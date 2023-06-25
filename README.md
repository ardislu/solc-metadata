# solc-metadata

This is the minimum JavaScript required to fetch, extract, decode, and use the [metadata](https://docs.soliditylang.org/en/latest/metadata.html) that the Solidity compiler ([solc](https://github.com/ethereum/solidity/releases)) appends to the end of a smart contract's runtime bytecode.

Similar to sourcify's metadata playground ([website](https://playground.sourcify.dev/), [GitHub](https://github.com/sourcifyeth/metadata-playground)) but reduced to the bare minimum code.

## Fetch

By default, the Solidity compiler appends metadata to the end of a smart contract's runtime bytecode. A smart contract's runtime bytecode may be fetched from any Ethereum node using the standard JSON-RPC method [`eth_getCode`](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_getcode).

**The runtime bytecode is different from the *creation* bytecode**. The creation bytecode is the code that's used to create the smart contract. The creation bytecode includes extra operations required to deploy the runtime bytecode (i.e. the constructor logic and arguments). Consequently, the runtime bytecode will look different from the creation bytecode.

## Extract

After the runtime bytecode is fetched, the metadata may be extracted by reading the last ~53 or so bytes from the end of the runtime bytecode. The exact length will vary depending on the version of `solc` and the exact compiler settings used to compile the bytecode. See the [`solc` docs](https://docs.soliditylang.org/en/latest/metadata.html#encoding-of-the-metadata-hash-in-the-bytecode) for details about how this metadata is encoded and how exactly to extract the metadata.

## Decode

The metadata in the runtime bytecode is [CBOR (Concise Binary Object Representation)](https://www.rfc-editor.org/rfc/rfc8949.html) encoded. A minimal and limited CBOR decoder is implemented to convert the CBOR into JSON.

## Use

Here are the possible keys that `solc` may encode into the bytecode (as of `v0.8.19`):

| Key            | Description                                                 | Included in `solc` versions   |
| -------------- | ----------------------------------------------------------- | ----------------------------- |
| `solc`         | The `solc` version used to compile the bytecode             | `0.4.7` and above             |
| `bzzr0`        | Swarm hash                                                  | `0.4.7` to `0.5.10`           |
| `bzzr1`        | Swarm hash                                                  | `0.5.11` and above            |
| `ipfs`         | IPFS hash (not a CID) of the full metadata JSON             | `0.6.0` and above             |
| `experimental` | `bool` indicating if experimental `solc` features were used | `0.4.16` and above            |

The table above was created by researching the [`solc` changelog](https://github.com/ethereum/solidity/blob/develop/Changelog.md) and archived versions of the [official `solc` documentation](https://docs.soliditylang.org/en/v0.8.19/metadata.html). Check the changelog and the documentation for the latest details.

**The `ipfs` value in the decoded metadata is not a CID**. It's a [multihash](https://github.com/multiformats/multihash) of the `sha256` hash of the full JSON metadata file. The multihash must be converted into a [CID](https://docs.ipfs.tech/concepts/content-addressing/) to be usable. Minimal transformation functions are implemented to convert the multihash into both CIDv0 and CIDv1.

Once the CID is calculated, you may finally use the CID to retrieve the full JSON metadata from IPFS (assuming someone has pinned the JSON file in IPFS).

If the smart contract was compiled using an old version of `solc` (before `v0.6.0`), then the metadata may only contain `bzzr0` or `bzzr1` keys. In this case, the tool is unable to fetch the metadata because there are no easily accessible public Swarm gateways, and it's unlikely the metadata is still hosted anyway.
