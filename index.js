/**
 * Wrapper around the `fetch` API to simplify making an `eth_getCode` JSON-RPC call.
 * @param {string} address Hex address of the smart contract to retrieve the bytecode for (including `0x` prefix).
 * @param {string} rpc URL for a node that supports the standard Ethereum JSON-RPC method `eth_getCode`.
 * @returns {Promise<string|undefined>} `Promise` that will resolve to the `string` bytecode for the address, or `undefined` if the address is malformed.
 * @throws {TypeError} Will throw an error if the RPC responds with an HTTP error.
 */
async function fetchBytecode(address, rpc) {
  // Will work on all blockchains that support the standard Ethereum JSON-RPC method 'eth_getCode'
  return fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'eth_getCode',
      params: [
        address,
        'latest'
      ]
    })
  })
    .then(r => r.json())
    .then(obj => obj.result);
}

/**
 * Determine the smart contract language used to produce a smart contract by inspecting the initial bytes
 * of the runtime bytecode.
 * @param {string} bytecode Runtime bytecode of a smart contract.
 * @returns {'solidity'|'vyper'|'unknown'} The smart contract language used to generate this smart contract.
 */
function detectLanguage(bytecode) {
  const prefix = bytecode.replace('0x', '').substring(0, 10);

  // https://github.com/banteg/erigon-kv/blob/5584ada83c75b244e611641d100ccc647a7f6791/examples/compilers.py#L17
  if (prefix === '6060604052' || prefix === '6080604052') {
    return 'solidity';
  }
  else if (prefix === '6004361015' || prefix === '341561000a') {
    return 'vyper';
  }
  else {
    return 'unknown';
  }
}

/**
 * Parse arbitrary EVM bytecode to extract the bytecode metadata from it.
 * @param {string} bytecode Raw EVM bytecode in hex (including `0x` prefix).
 * @param {'solidity'|'vyper'} [lang=solidity] Smart contract language used to compile this bytecode.
 * @returns {Array<number>} Byte array of the CBOR-encoded bytecode metadata.
 * @throws {TypeError} Will throw an error if the bytecode is malformed.
 */
function extractCBOR(bytecode, lang = 'solidity') {
  // The length of the CBOR will always be stored as the last two bytes of the runtime bytecode
  const cborLen = parseInt(bytecode.slice(-4), 16);

  // Derive the CBOR by counting backwards from the end (minus the last two bytes)
  // IMPORTANT: Vyper INCLUDES the last two bytes in the byte length, unlike Solidity!
  const cbor = bytecode.substring(bytecode.length - (lang === 'solidity' ? 4 : 0) - cborLen * 2, bytecode.length - 4);

  // Convert to a byte array for easier use in subsequent processing
  const byteArray = cbor.match(/.{2}/g).map(v => parseInt(v, 16));

  return byteArray;
}

/**
 * Decode `solc`-encoded CBOR metadata. This is **not a full CBOR decoder**, it can only handle metadata from `solc`.
 * @param {Array<number>} cbor Byte array of CBOR-encoded data.
 * @returns {Object} `Object` representing the decoded CBOR data.
 */
function decodeCBOR(cbor) {
  const decoder = new TextDecoder();

  // Assume the first byte initializes a map structure. The size is not used because it's not required for objects in JavaScript.
  cbor.shift();
  const output = {};

  let isKey = true; // Alternate between key and property after each structure is processed
  let lastStructure = null; // To set the property for the last key that was set
  while (cbor.length > 0) {
    const byte = cbor.shift();

    // IMPORTANT: NOT ALL TYPES ARE REPRESENTED IN THIS JUMP TABLE
    // Assumes that solc will only use the below types in the bytecode metadata
    let structure;
    if (byte >= 0x40 && byte <= 0x57) { // bytes
      const len = byte - 0x40;
      const bytes = cbor.slice(0, len);
      cbor = cbor.slice(len);
      structure = new Uint8Array(bytes);
    }
    else if (byte === 0x58) { // bytes_1n
      const len = cbor.shift();
      const bytes = cbor.slice(0, len);
      cbor = cbor.slice(len);
      structure = new Uint8Array(bytes);
    }
    else if (byte >= 0x60 && byte <= 0x77) { // UTF-8
      const len = byte - 0x60;
      const bytes = cbor.slice(0, len);
      cbor = cbor.slice(len);
      structure = decoder.decode(new Uint8Array(bytes));
    }

    if (isKey) {
      output[structure] = null;
      lastStructure = structuredClone(structure);
    }
    else {
      output[lastStructure] = structure;
    }
    isKey = !isKey;
  }

  // The output should look like this:
  // {
  //   ipfs: <multihash>,
  //   solc: <version>
  // }
  return output;
}

/**
 * Transform a SHA-256 hash into an IPFS CIDv0, which is a base58btc-encoded multihash.
 * @param {Array<number>} byteArray A byte array representing a SHA-256 hash.
 * @returns {string} An IPFS CIDv0 (starts with `Q`) for a SHA-256 hash.
 */
function solcMultihashToCIDv0(byteArray) {
  // The IPFS v0 CID is the base58btc-encoded multihash, where the multihash is of the sha256 hash of the dag-pb representation of the metadata
  const output = [];

  // Base58 conversion logic is copied from https://github.com/cryptocoinjs/base-x
  const base = 58;
  const size = 46; // v0 CIDs are always 46 characters
  let length = 0;
  let pointer = 0;
  while (pointer < byteArray.length) {
    let carry = byteArray[pointer];
    let i = 0;
    for (let it1 = size - 1; (carry !== 0 || i < length) && (it1 !== -1); it1--, i++) {
      carry += (256 * output[it1]) >>> 0;
      output[it1] = (carry % base) >>> 0;
      carry = (carry / base) >>> 0;
    }
    length = i;
    pointer++;
  }

  // The base58btc alphabet is from the Bitcoin client source code: https://github.com/bitcoin/bitcoin/blob/master/src/base58.cpp
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  return output.map(b => alphabet.charAt(b)).join('');
}

/**
 * Transform a SHA-256 hash into an IPFS CIDv1, which is a self-describing format that may encode many combinations of hash and content.
 * This function will base32-encode the hash.
 * @param {Array<number>} byteArray A byte array representing a SHA-256 hash.
 * @returns {string} An IPFS CIDv1 (starts with `b`) for a SHA-256 hash.
 */
function solcMultihashToCIDv1(byteArray) {
  // The CIDv1 format includes multiple parts so the format can be flexible and self-describing for many combinations
  // of encoding, version, hash function, length, etc. However, all these parts are already chosen by solc and then
  // hardcoded into an immutable smart contract. So these parts will be the same for pretty much every smart contract
  // metadata file. For efficiency and to save a lot of boilerplate code, the prefix and initial parts are hardcoded
  // to set the values as follows:
  // <multibase-prefix>: b (base32)
  // <multicodec-cidv1>: 0x01 (CID v1)
  // <multicodec-content-type>: 0x70 (dag-pb)
  // Reference: https://github.com/multiformats/cid
  const prefix = 'b';
  byteArray = [0x01, 0x70, ...byteArray];

  // Encoding logic is copied from https://github.com/multiformats/js-multiformats/
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'; // RFC4648 base32
  const bitsPerChar = 5;
  const mask = (1 << bitsPerChar) - 1;
  let out = '';
  let bits = 0;
  let buffer = 0;
  for (let i = 0; i < byteArray.length; ++i) {
    buffer = buffer << 8 | byteArray[i];
    bits += 8;
    while (bits > bitsPerChar) {
      bits -= bitsPerChar;
      out += alphabet[mask & buffer >> bits];
    }
  }
  if (bits) {
    out += alphabet[mask & buffer << bitsPerChar - bits];
  }

  return `${prefix}${out}`;
}

/**
 * Get IPFS CIDs for the JSON metadata file from decoded bytecode metadata.
 * @param {Object} metadata Decoded bytecode metadata.
 * @returns {Object} The `solc` compiler version and IPFS CIDs (both CIDv0 and CIDv1) of the JSON metadata.
 */
function calculateCID(metadata) {
  const { ipfs, solc } = metadata;

  const solcVersion = `${solc[0]}.${solc[1]}.${solc[2]}`;
  const cidV0 = solcMultihashToCIDv0(ipfs);
  const cidV1 = solcMultihashToCIDv1(ipfs);

  return { solcVersion, cidV0, cidV1 };
}

/**
 * Wrapper around the `fetch` API to simplify querying an IPFS node for a CID. 
 * @param {string} cid An IPFS CID.
 * @param {URL} ipfs URL for an IPFS node.
 * @returns {Promise<Response>} `Promise` that resolves to a `Response` object.
 */
function fetchCID(cid, ipfs) {
  let response;
  if (cid[0] === 'Q') { // v0
    response = fetch(`${ipfs.origin}/ipfs/${cid}${ipfs.search}`);
  }
  else { // v1
    if (ipfs.host.split('.')[0] === 'ipfs') {
      response = fetch(`${ipfs.protocol}//${cid}.${ipfs.host}${ipfs.pathname}${ipfs.search}`);
    }
    else {
      response = fetch(`${ipfs.protocol}//${cid}.ipfs.${ipfs.host}${ipfs.pathname}${ipfs.search}`);
    }
  }
  return response;
}

export { fetchBytecode, detectLanguage, extractCBOR, decodeCBOR, calculateCID, fetchCID };
