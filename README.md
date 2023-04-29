# solc-metadata

This is the minimum JavaScript required to fetch, extract, decode, and use the [metadata](https://docs.soliditylang.org/en/latest/metadata.html) that the Solidity compiler ([solc](https://github.com/ethereum/solidity/releases)) appends to the end of a smart contract's bytecode.

## Fetch

By default, the Solidity compiler appends metadata to the end of a smart contract's runtime bytecode. A smart contract's runtime bytecode may be fetched from any Ethereum node using the standard JSON-RPC method [`eth_getCode`](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_getcode).

Note that the runtime bytecode is different from the *creation* bytecode. The creation bytecode is the code that's sent to the transaction that creates the smart contract. The creation bytecode includes extra operations required to deploy the runtime bytecode (i.e. the constructor logic and arguments). Consequently, the runtime bytecode will look different from the creation bytecode.

## Extract

After the runtime bytecode is fetched, the metadata may be extracted by reading the last ~53 or so bytes from the end of the runtime bytecode. The exact length may vary. See the [`solc` docs](https://docs.soliditylang.org/en/v0.8.19/metadata.html#encoding-of-the-metadata-hash-in-the-bytecode) for details about how this metadata is encoded and how exactly to extract the metadata.

## Decode

The metadata in the runtime bytecode is [CBOR (Concise Binary Object Representation)](https://www.rfc-editor.org/rfc/rfc8949.html) encoded. A minimal and limited CBOR decoder is implemented to convert the CBOR into JSON.

## Use

The `ipfs` value in the decoded metadata is not immediately usable. It's a [multihash](https://github.com/multiformats/multihash) of the `sha256` hash of the full JSON metadata file. The multihash must be converted into a [CID](https://docs.ipfs.tech/concepts/content-addressing/) to be usable. Minimal transformation functions are implemented to convert the multihash into both CIDv0 and CIDv1.

Once the CID is calculated, you may finally use the CID to retrieve the full JSON metadata from IPFS (assuming someone has pinned the JSON file in IPFS).
