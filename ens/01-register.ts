// ENS-1: registers the fleet name on Sepolia, with its own resolver and its own subname registry.
// Usage: node ens/01-register.ts [label=mohar]
// Spends Sepolia gas from the deployer key (.secrets/deployer.key) and test USDC (free). Saves docs/evidence/ens-1.json.
import fs from "node:fs";
import path from "node:path";
import { createWalletClient, encodeFunctionData, http, keccak256, parseAbi, parseEventLogs, toBytes, zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ADDR, REGISTRAR_ABI, SEPOLIA_RPC, client } from "./config.ts";
import { deployerKey } from "../signer/src/devnet.ts";

const label = process.argv[2] ?? "mohar";
const account = privateKeyToAccount(deployerKey());
const wallet = createWalletClient({ account, chain: sepolia, transport: http(SEPOLIA_RPC) });
const evidence: Record<string, unknown> = { network: "sepolia", label, owner: account.address, startedAt: new Date().toISOString() };
const note = (k: string, v: unknown) => { evidence[k] = v; console.log(k + ":", typeof v === "string" ? v : JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x))); };

// Role bits, from contracts-v2 (RegistryRolesLib, PermissionedResolverLib). Admin variant = bit << 128.
const R = (bit: number) => 1n << BigInt(bit);
const ADMIN = (x: bigint) => x << 128n;
const REG = { REGISTRAR: R(0), UNREGISTER: R(12), RENEW: R(16), SET_SUBREGISTRY: R(20), SET_RESOLVER: R(24) };
const REGISTRY_ROOT_ROLES = Object.values(REG).reduce((a, b) => a | b | ADMIN(b), 0n);
const RES = { ADDR: R(0), TEXT: R(4), DATA: R(36), NAME: R(24), CLEAR: R(32) };
const RESOLVER_ROOT_ROLES = Object.values(RES).reduce((a, b) => a | b | ADMIN(b), 0n);

const FACTORY_ABI = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);
const USDC_ABI = parseAbi(["function mint(address to, uint256 amount)", "function approve(address spender, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
// The deployed contracts (found from their bytecode: they differ from the contracts-v2 repo head) take a list of
// (account, roles) pairs.
const INIT_REGISTRY = parseAbi(["function initialize((address account, uint256 roles)[] accounts)"]);
const INIT_RESOLVER = parseAbi(["function initialize((address account, uint256 roles)[] accounts, bytes[] setters)"]);

async function send(label_: string, tx: Parameters<typeof wallet.writeContract>[0]) {
  const hash = await wallet.writeContract(tx);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label_} reverted: ${hash}`);
  note(`tx ${label_}`, hash);
  return receipt;
}
async function deployProxy(name: string, impl: Address, abi: any, args: any[]) {
  const data = encodeFunctionData({ abi, functionName: "initialize", args } as any);
  const salt = BigInt(keccak256(toBytes(`${name} ${label} ${Date.now()}`)));
  const receipt = await send(`deploy ${name}`, { address: ADDR.VerifiableFactory, abi: FACTORY_ABI, functionName: "deployProxy", args: [impl, salt, data] } as any);
  const [log] = parseEventLogs({ abi: FACTORY_ABI, eventName: "ProxyDeployed", logs: receipt.logs });
  return log.args.proxyAddress as Address;
}

// 0. The deployment must be what we expect, and the name must be free.
const read = (functionName: any, args: any[] = []) => client.readContract({ address: ADDR.ETHRegistrar, abi: REGISTRAR_ABI, functionName, args } as any);
if (((await read("ETH_REGISTRY")) as string).toLowerCase() !== ADDR.ETHRegistry) throw new Error("registrar points at a different registry: Sepolia was redeployed. Update ens/config.ts");
if (!(await read("isAvailable", [label]))) throw new Error(`${label}.eth is taken`);
const duration = (await read("MIN_REGISTER_DURATION")) as bigint;
const minAge = (await read("MIN_COMMITMENT_AGE")) as bigint;
const [base, premium] = (await read("getRegisterPrice", [label, duration, ADDR.MockUSDC])) as [bigint, bigint];
const price = base + premium;
note("price", `${Number(price) / 1e6} test USDC for ${Number(duration) / 86400} days`);
note("sepoliaBalanceWei", (await client.getBalance({ address: account.address })).toString());

// 1. Test USDC: mint what we need, approve the registrar for the exact price.
await send("mint test USDC", { address: ADDR.MockUSDC, abi: USDC_ABI, functionName: "mint", args: [account.address, price] } as any);
await send("approve registrar", { address: ADDR.MockUSDC, abi: USDC_ABI, functionName: "approve", args: [ADDR.ETHRegistrar, price] } as any);

// 2. The fleet's own resolver and subname registry, as verifiable proxies.
const resolver = await deployProxy("fleet PermissionedResolver", ADDR.PermissionedResolverImpl, INIT_RESOLVER, [[{ account: account.address, roles: RESOLVER_ROOT_ROLES }], []]);
const subregistry = await deployProxy("fleet UserRegistry", ADDR.UserRegistryImpl, INIT_REGISTRY, [[{ account: account.address, roles: REGISTRY_ROOT_ROLES }]]);
note("fleetResolver", resolver);
note("fleetRegistry", subregistry);

// 3. Commit, wait out the minimum age, register.
const secret = keccak256(toBytes(`secret ${label} ${Date.now()} ${Math.random()}`));
const referrer = `0x${"00".repeat(32)}` as Hex;
const commitment = (await read("makeCommitment", [label, account.address, secret, subregistry, resolver, duration, referrer])) as Hex;
await send("commit", { address: ADDR.ETHRegistrar, abi: REGISTRAR_ABI, functionName: "commit", args: [commitment] } as any);
const wait = Number(minAge) + 3;
console.log(`waiting ${wait}s for the commitment to age`);
await new Promise((r) => setTimeout(r, wait * 1000));
const receipt = await send("register", { address: ADDR.ETHRegistrar, abi: REGISTRAR_ABI, functionName: "register", args: [label, account.address, secret, subregistry, resolver, duration, ADDR.MockUSDC, referrer] } as any);
note("registeredInBlock", receipt.blockNumber.toString());

// 4. Checks.
note("ENS1-T1 isAvailable now", await read("isAvailable", [label]));
evidence.finishedAt = new Date().toISOString();
const dir = path.resolve(import.meta.dirname, "../docs/evidence");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "ens-1.json"), JSON.stringify(evidence, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2) + "\n");
console.log("saved docs/evidence/ens-1.json");
