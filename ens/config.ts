// ENSv2 on Sepolia: addresses from https://docs.ens.domains/learn/deployments (read 6 Nov 2026), checked on-chain by
// ens/00-check.ts. Sepolia has been redeployed before, so every script re-checks before it spends anything.
// The RPC is the one setting you may change; everything else is read from the chain.
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { sepolia } from "viem/chains";

export const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
export const client = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });

export const ADDR = {
  ETHRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  ETHRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  RootRegistry: "0xb458d6a3a77919449d03e7a6903c26827c1ec43f",
  UniversalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe", // the upgradable proxy; the docs say apps resolve through it
  VerifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
  PermissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  UserRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  MockUSDC: "0x240b0316df57887dbbe58b586508b19e633a14aa",
  StandardRentPriceOracle: "0x8196665d4ca7488b6474a9ec8e7d2719fb42263a",
} as const satisfies Record<string, Address>;

export const REGISTRAR_ABI = parseAbi([
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)",
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function MAX_COMMITMENT_AGE() view returns (uint64)",
  "function MIN_REGISTER_DURATION() view returns (uint64)",
  "function ETH_REGISTRY() view returns (address)",
]);
