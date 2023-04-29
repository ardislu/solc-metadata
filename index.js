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

function extractCBOR(bytecode) {
  // The length of the CBOR will always be stored as the last two bytes of the runtime bytecode
  const cborLen = parseInt(bytecode.slice(-4), 16);

  // Derive the CBOR by counting backwards from the end (minus the last two bytes)
  const cbor = bytecode.substring(bytecode.length - 4 - cborLen * 2, bytecode.length - 4);

  // Convert to a byte array for easier use in subsequent processing
  const byteArray = cbor.match(/.{2}/g).map(v => parseInt(v, 16));

  return byteArray;
}

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

// The IPFS v0 CID is the base58btc-encoded multihash, where the multihash is of the sha256 hash of the dag-pb representation of the metadata
function solcMultihashToCIDv0(byteArray) {
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

// The IPFS v1 CID is a self-describing format that may encode many combinations of hash and content
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

function calculateCID(metadata) {
  const { ipfs, solc } = metadata;

  const solcVersion = `${solc[0]}.${solc[1]}.${solc[2]}`;
  const cidV0 = solcMultihashToCIDv0(ipfs);
  const cidV1 = solcMultihashToCIDv1(ipfs)

  return { solcVersion, cidV0, cidV1 };
}

function fetchJSONMetadata(cid, ipfs) {
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
  return response.then(r => r.json());
}

export { fetchBytecode, extractCBOR, decodeCBOR, calculateCID, fetchJSONMetadata };
