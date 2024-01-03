/**
 * Wrapper around the `fetch` API to simplify making an `eth_getCode` JSON-RPC call.
 * @param {string} address Hex address of the smart contract to retrieve the bytecode for (including `0x` prefix).
 * @param {string} rpc URL for a node that supports the standard Ethereum JSON-RPC method `eth_getCode`.
 * @returns {Promise<string|undefined>} `Promise` that will resolve to the `string` bytecode for the address, or `undefined` if the address is malformed.
 * @throws {TypeError} Will throw an error if the RPC responds with an HTTP error.
 */
export function fetchBytecode(address: string, rpc: string): Promise<string | undefined>;
/**
 * Determine the smart contract language used to produce a smart contract by inspecting the initial bytes
 * of the runtime bytecode.
 * @param {string} bytecode Runtime bytecode of a smart contract.
 * @returns {'solidity'|'vyper'|'unknown'} The smart contract language used to generate this smart contract.
 */
export function detectLanguage(bytecode: string): 'solidity' | 'vyper' | 'unknown';
/**
 * Parse arbitrary EVM bytecode to extract the bytecode metadata from it.
 * @param {string} bytecode Raw EVM bytecode in hex (including `0x` prefix).
 * @param {'solidity'|'vyper'} [lang=solidity] Smart contract language used to compile this bytecode.
 * @returns {Array<number>} Byte array of the CBOR-encoded bytecode metadata.
 * @throws {TypeError} Will throw an error if the bytecode is malformed.
 */
export function extractCBOR(bytecode: string, lang?: 'solidity' | 'vyper'): Array<number>;
/**
 * Decode `solc`-encoded CBOR metadata. This is **not a full CBOR decoder**, it can only handle metadata from `solc`.
 * @param {Array<number>} cbor Byte array of CBOR-encoded data.
 * @returns {Object} `Object` representing the decoded CBOR data.
 */
export function decodeCBOR(cbor: Array<number>): any;
/**
 * Get IPFS CIDs for the JSON metadata file from decoded bytecode metadata.
 * @param {Object} metadata Decoded bytecode metadata.
 * @returns {Object} The `solc` compiler version and IPFS CIDs (both CIDv0 and CIDv1) of the JSON metadata.
 */
export function calculateCID(metadata: any): any;
/**
 * Wrapper around the `fetch` API to simplify querying an IPFS node for a CID.
 * @param {string} cid An IPFS CID.
 * @param {string} ipfs URL for an IPFS node.
 * @returns {Promise<Response>} `Promise` that resolves to a `Response` object.
 */
export function fetchCID(cid: string, ipfs: string): Promise<Response>;
