import { Address } from "viem";

/**
 * Round-3 Originality on Optimism: one multi-scalar parent and 98 scalar repo markets, created
 * 2026-09-22 and seeded with 1,000 sUSDS.
 *
 * Generated from `create-originality-r3-v2-execution.json` and `originality-r3-seed.json` in the
 * liquidity repo — do not edit by hand. Static rather than discovered at runtime because the set
 * postdates Seer's Optimism indexer stall (2026-08-29): Supabase has no rows for it, so no query
 * would expand the parent to its children. The data function reads MarketView using these ids.
 *
 * WHY A BUNDLED PARENT. Round 2 put all 98 repos in one multi-categorical parent, so each repo
 * market was collateralized in its own parent outcome token. OP Mainnet now caps a transaction at
 * 2^24 gas and that parent needs ~37M, so round 3's parent is a 3-outcome multi-scalar — "How many
 * repositories in [bundle] will be evaluated…", outcomes Bundle A/B/C — and each repo market is
 * conditional on its BUNDLE's token: the first 33 repos (round 2's order) on A, the next 33 on B,
 * the last 32 on C. The bundles are a gas workaround only and are never shown in the UI.
 *
 * `bundle` is the repo market's `parentOutcome`. The repo cannot be read back from the parent's
 * outcomes as round 2 does — that would name every market after its bundle — so it lives here.
 *
 * This file is reached from Netlify functions, so it must import nothing but `viem` types — see
 * the header comment in `./contests`.
 */
export const ORIGINALITY_R3_PARENT_MARKET_ID: Address = "0x52f80fc4fa783ab5850d1658589284c47a21b3b7";

/** The parent's Invalid outcome token (SER-INVALID), its last wrapped token. */
export const ORIGINALITY_R3_PARENT_INVALID_TOKEN: Address = "0x8cee1c7ab2e5d857b672ba6529d722e2ba2c6ee7";

export interface OriginalityR3Market {
  repo: string;
  address: Address;
  /** 0 = Bundle A, 1 = Bundle B, 2 = Bundle C — the market's `parentOutcome`. */
  bundle: 0 | 1 | 2;
}

export const ORIGINALITY_R3_MARKETS: readonly OriginalityR3Market[] = [
  { repo: "ethereum/py_ecc", address: "0x7e6192a6c9702c9e49671fae6a97acd8843976eb", bundle: 0 },
  { repo: "blockscout/blockscout", address: "0x3172682c0e73e4bd2a1105af469417d09e5039b7", bundle: 0 },
  { repo: "LFDT-web3j/web3j", address: "0xb653ad536660811257ec8adb0ed1898aae2abc24", bundle: 0 },
  { repo: "herumi/mcl", address: "0xc4f9db466414731aa79dd9851a2185e589180624", bundle: 0 },
  { repo: "paulmillr/noble-curves", address: "0x61c8e32e7b87954a97d7f32d9db856d7005e9855", bundle: 0 },
  { repo: "arkworks-rs/algebra", address: "0xcdf9ad1c756430600fcb86bf09e669fff412d55c", bundle: 0 },
  { repo: "flashbots/rbuilder", address: "0xf45f966c19eda472d706eeeba29a761ac6bf5527", bundle: 0 },
  { repo: "protofire/solhint", address: "0x34914b2c614a58a6cafb8d7b3f3a5b64140f661c", bundle: 0 },
  { repo: "l2beat/l2beat", address: "0x48505727e6b85bf1b8c25ba4d06329cdfd6eae16", bundle: 0 },
  { repo: "Consensys/gnark-crypto", address: "0x16605c0eb1139f36658a2532b93735d923fb0d7d", bundle: 0 },
  { repo: "Vectorized/solady", address: "0xcf40d59d011600d6bc3d8bc921495d9ab48ce437", bundle: 0 },
  { repo: "taikoxyz/taiko-mono", address: "0x0d6e1e1b4314ee05515d8c03725fc48d93fcfbca", bundle: 0 },
  { repo: "flashbots/mev-boost", address: "0x3ccb63fb185d2598bad4d4d83bc3853b980815e9", bundle: 0 },
  { repo: "flashbots/mev-boost-relay", address: "0x14173dfb839ef4676f05dd28424196c135807cca", bundle: 0 },
  { repo: "ethereum/js-ethereum-cryptography", address: "0xed806018aed460f7c8469d453c32b6d9f431d3bb", bundle: 0 },
  { repo: "libp2p/libp2p", address: "0x16d25d82c7473cd9f91967c1931cfd36994c663f", bundle: 0 },
  { repo: "supranational/blst", address: "0x2b3a03745a3e4391bda2920ce852f9b2ee617bad", bundle: 0 },
  { repo: "wighawag/hardhat-deploy", address: "0x61aa38901a39bcc76d5cb15b8c406b9727af2474", bundle: 0 },
  { repo: "ethstaker/eth-docker", address: "0x955a5e8317763dfb774de2ed0c65a93f9f5021ed", bundle: 0 },
  { repo: "DefiLlama/DefiLlama-Adapters", address: "0xdae672d4b1abb32e311e5c01af9ae15a907e2557", bundle: 0 },
  { repo: "DefiLlama/chainlist", address: "0xa16249d3ce202dc6bbaf2535a8e714a99acedcca", bundle: 0 },
  { repo: "Certora/CertoraProver", address: "0x84aa7a1384bf68454c2446612af205c8e16d659b", bundle: 0 },
  { repo: "Plonky3/Plonky3", address: "0x5053350662f7eff9e8d415156d5a6159ce1a7e66", bundle: 0 },
  { repo: "ChainSafe/bls", address: "0x562a9a0d4dba9f7fee58d1b22a0fcc419ca11102", bundle: 0 },
  { repo: "intellij-solidity/intellij-solidity", address: "0xe46c603f9b61c3f367cf62222a340ab28d2285fb", bundle: 0 },
  { repo: "dappnode/DAppNode", address: "0x174666728e544e8882a0a49b7b6cdc2287124d1b", bundle: 0 },
  { repo: "wealdtech/ethdo", address: "0x0afb2d380cbcc209ccf54211d60cfe7e5ac99c25", bundle: 0 },
  { repo: "lambdaclass/lambdaworks", address: "0x08e343960ddc8c718922fdbeb0ea1f05ec2c6f04", bundle: 0 },
  { repo: "smartcontracts/simple-optimism-node", address: "0x6bf5afc2ca6fb5e43ab27d98b0a80f3fcb6f62f5", bundle: 0 },
  { repo: "skalenetwork/libBLS", address: "0x16c9363e1bd998fadc5c97a2d5c6321dfaecf88c", bundle: 0 },
  { repo: "shazow/whatsabi", address: "0xa53a4338d39fdc946741c3a078e08cc09af8240a", bundle: 0 },
  { repo: "TrueBlocks/trueblocks-core", address: "0x200b8fb8906ce0614ab7c200f7eb5fae5e14c45f", bundle: 0 },
  { repo: "EspressoSystems/jellyfish", address: "0xe233cb991bb2650a8380f2eefa88f4b5c6b3d4cd", bundle: 0 },
  { repo: "a16z/halmos", address: "0xebdba6c87fb7b773cbc0077e4e943670f37b9a83", bundle: 1 },
  { repo: "succinctlabs/op-succinct", address: "0x0c658a6e0343bf1365f95b25c1ff63b728ad8fd3", bundle: 1 },
  { repo: "succinctlabs/sp1", address: "0x4b41efdf43aaac6fa1dd3b9ffa1a570d6597cdc7", bundle: 1 },
  { repo: "otterscan/otterscan", address: "0xaf87f8d0abbf8bd3e7c12003991fefe676fb1a41", bundle: 1 },
  { repo: "lambdaclass/ethrex", address: "0x86370e61593c1fc759982d55f01e236844bfaf2f", bundle: 1 },
  { repo: "NethermindEth/juno", address: "0x5a01f885471fa4205de2639a8be665ba21bec3ac", bundle: 1 },
  { repo: "Commit-Boost/commit-boost-client", address: "0x2d97934bd5e0435838da311adf6a3ec101c3728c", bundle: 1 },
  { repo: "Cyfrin/aderyn", address: "0x413d3fb6a93f1edfbfade4ae8686408370dc4818", bundle: 1 },
  { repo: "0xMiden/miden-vm", address: "0xecff2e8ab900b7ec2c4f445149201e98c02d4c62", bundle: 1 },
  { repo: "holiman/goevmlab", address: "0xb9d2a2a1f4c278f011042c2d00b6ae597adfbb90", bundle: 1 },
  { repo: "edb-rs/edb", address: "0x6dd9734f3b7f6fce66ed0f400b79e1205e48f0b3", bundle: 1 },
  { repo: "evmts/tevm-monorepo", address: "0x349ec1ea268c412a276c002cb2f48a0ceb3cebd9", bundle: 1 },
  { repo: "succinctlabs/rsp", address: "0xd6ddaf0ece8b81c1e8cd9d7f8811e7cacc6afa92", bundle: 1 },
  { repo: "aestus-relay/mev-boost-relay", address: "0x7c01a10aa90a98f37ec8991316e85998e3400a23", bundle: 1 },
  { repo: "OffchainLabs/stylus-sdk-rs", address: "0x8ede7c2f483826aaac3f94602e98f0fcf0daefd2", bundle: 1 },
  { repo: "ethstaker/ethstaker-deposit-cli", address: "0x63109e5ea805a8d0d6c58cf2d2fd39b2d06e3a45", bundle: 1 },
  { repo: "dl-solarity/solidity-lib", address: "0xd2cbcf69ac50d31a75b8c6dc3efcde9a9270f735", bundle: 1 },
  { repo: "risc0/risc0-ethereum", address: "0xd32f67a1e374c3e229964cd4190873c20981aed3", bundle: 1 },
  { repo: "powdr-labs/powdr", address: "0xa015aae93dba4f57bad60d7d5106ecafef8603d7", bundle: 1 },
  { repo: "axiom-crypto/snark-verifier", address: "0x12c50fed65c66b31ddce2d314cabc5c916f4e87f", bundle: 1 },
  { repo: "swiss-knife-xyz/swiss-knife", address: "0xd53c44f717ad25906b78d1c8966a66e2ec754692", bundle: 1 },
  { repo: "a16z/helios", address: "0x50b87c43b1bd192f821faf5e1bd24c1dab5fdd46", bundle: 1 },
  { repo: "alloy-rs/alloy", address: "0xc123517ef0d53b127ea949bc403ab8afa829ed38", bundle: 1 },
  { repo: "apeworx/ape", address: "0x080848554ee722a29fae5e77bdbc6a51b5ef6661", bundle: 1 },
  { repo: "chainsafe/lodestar", address: "0xeb2c133333f436a66d593fac546a3cf3fb938d30", bundle: 1 },
  { repo: "consensys/teku", address: "0x1fcbe5371992a1df7111274d781309d49db75847", bundle: 1 },
  { repo: "erigontech/erigon", address: "0x8ac382d16b53463644e18b1401371b97076ee518", bundle: 1 },
  { repo: "eth-infinitism/account-abstraction", address: "0x7e79e4baec50efa7a8b647a54144e828a6c9777d", bundle: 1 },
  { repo: "ethereum-lists/chains", address: "0x9d65d25042a7eba86b031a138c38ea7094115510", bundle: 1 },
  { repo: "ethereum/consensus-specs", address: "0x8ebd6144b77908442dc245f682a1d31e0f887ab3", bundle: 1 },
  { repo: "ethereum/eips", address: "0x2e2a36409951cfd44e3c3cf0a3a2c568552d0a9c", bundle: 1 },
  { repo: "ipsilon/evmone", address: "0x7e0f8b6944d576e2690d03ce6218bd13ca74fd73", bundle: 1 },
  { repo: "ethereum/execution-apis", address: "0xa11ec52bbc7b7907572d34add79ddea2ee3ae811", bundle: 1 },
  { repo: "argotorg/fe", address: "0xa429cb6ccb906d07abdb63c044cb7be3a6f62024", bundle: 2 },
  { repo: "ethereum/go-ethereum", address: "0xb547c18fdaeb6145783ee580c9d2808e0c75a4f0", bundle: 2 },
  { repo: "remix-project-org/remix-project", address: "0xd1923b6e6c8ae996a5579017366244e609070f70", bundle: 2 },
  { repo: "argotorg/solidity", address: "0x57bfaf5055c01fff8cc9286f3e1a7720ae333e80", bundle: 2 },
  { repo: "argotorg/sourcify", address: "0x7aa95c31a098b46ae68f99a1e2414399ed0d99c1", bundle: 2 },
  { repo: "ethereum/web3.py", address: "0x815e8dc49a612c9631edd6f4bd1e1dda8017e677", bundle: 2 },
  { repo: "ethers-io/ethers.js", address: "0x343a9d27b2f335aa1a74f2322529730deddacb07", bundle: 2 },
  { repo: "foundry-rs/foundry", address: "0x22eb4970fb64db584765c878cdea6d60cc29b63c", bundle: 2 },
  { repo: "grandinetech/grandine", address: "0x6f0b04e04eef06e6a6468614292a3d02d598aeba", bundle: 2 },
  { repo: "hyperledger-web3j/web3j", address: "0xa4dd21b04142b24b2949900f58eb4ea90ea8561a", bundle: 2 },
  { repo: "hyperledger/besu", address: "0x4c004a74d5e9fe87dbc0f41d1835588618a4bc9f", bundle: 2 },
  { repo: "nethereum/nethereum", address: "0x4427bdd162a3fae29bf89e9b618c8b02d2c37709", bundle: 2 },
  { repo: "nethermindeth/nethermind", address: "0xf3650fb878f9243d08f5b40fdb9b603528c475ad", bundle: 2 },
  { repo: "nomicfoundation/hardhat", address: "0xccda450680586bb285981156410e8f9528be1e92", bundle: 2 },
  { repo: "openzeppelin/openzeppelin-contracts", address: "0x21b520587b29bfaf330b27a34b6ca4e768de9a8b", bundle: 2 },
  { repo: "paradigmxyz/reth", address: "0x10f55ea4cc7a14653f2ace4599f8d8f6e9611bb7", bundle: 2 },
  { repo: "OffchainLabs/prysm", address: "0x50c1f379823bde05b7f395be8da6f6a16a824d12", bundle: 2 },
  { repo: "safe-global/safe-smart-account", address: "0x03bf4264ffef7d648ec50beaaec78a9ccc56f6ae", bundle: 2 },
  { repo: "scaffold-eth/scaffold-eth-2", address: "0x8da3df7108dbb62244b34cfa7a308d48d24cb7e3", bundle: 2 },
  { repo: "sigp/lighthouse", address: "0x69a4d873b3fb124482341495cd1f94939b963c4d", bundle: 2 },
  { repo: "status-im/nimbus-eth2", address: "0x9e0d86528d6289ae62fb5f556628a9a8ed068291", bundle: 2 },
  { repo: "vyperlang/titanoboa", address: "0x96526ee677010817171af5a42d3803612c23e02d", bundle: 2 },
  { repo: "vyperlang/vyper", address: "0x239989fcbbd6a0b06ef9e1d415885dea70e5444e", bundle: 2 },
  { repo: "wevm/viem", address: "0xf8a06fc745d4796ecbee2e96aece174df8bdd6e0", bundle: 2 },
  { repo: "argotorg/hevm", address: "0xd31ee15a44a28e4bd35cc749576c1294ee68115a", bundle: 2 },
  { repo: "ethdebug/format", address: "0x288384a6a44774268adf06e3ae56996a51f9b958", bundle: 2 },
  { repo: "argotorg/act", address: "0xda29f51abb6a04824299267cad7b0b417dc76592", bundle: 2 },
  { repo: "ethpandaops/ethereum-package", address: "0x1853207e367b57bf50594d1effcf65377f33d4f6", bundle: 2 },
  { repo: "ethpandaops/ethereum-helm-charts", address: "0x0cc9d676f5ad57420e65f903660beb1f4fb13d49", bundle: 2 },
  { repo: "ethpandaops/checkpointz", address: "0xe03c58ec657253511b525290565fc767a1b56766", bundle: 2 },
  { repo: "lambdaclass/lambda_ethereum_consensus", address: "0x65612deb6fc1790c00cf370d6ab5e6c02b6eff9c", bundle: 2 },
  { repo: "erigontech/silkworm", address: "0xad1bc4c0ff4740c8a5c7124d020175028cd36a38", bundle: 2 },
];

export const ORIGINALITY_R3_MARKET_IDS: readonly Address[] = ORIGINALITY_R3_MARKETS.map(
  (market) => market.address,
);
