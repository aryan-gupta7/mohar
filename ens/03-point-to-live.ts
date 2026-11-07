// Points meter-001.mohar.eth at the live contracts on the Mohar devnet that the board reports to.
// Usage: node ens/03-point-to-live.ts <account> <ledger> <paymaster> [chainId=1337] [dashboardUrl|none]
// Also copies the account's own root() and pubSeed() into mohar.pq.root / mohar.pq.pubSeed (read from MOHAR_RPC, default the public devnet),
// so the name can never advertise a different key than the account holds. "none" clears agent-endpoint[web].
// Signed by the owner (the deployer key). Replaces the placeholders ENS-2 left. Reads back through the Universal Resolver.
import { createWalletClient, encodeFunctionData, http, parseAbi, toBytes, bytesToHex, namehash, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ADDR, SEPOLIA_RPC, client } from "./config.ts";
import { deployerKey } from "../signer/src/devnet.ts";
import fs from "node:fs";

// meter-001 is registered in the fleet's own registry (deployed in ENS-1), not the top-level one.
const FLEET_REGISTRY = JSON.parse(fs.readFileSync(new URL("../docs/evidence/ens-1.json", import.meta.url), "utf8")).fleetRegistry as Address;

const [account, ledger, paymaster, chainId = "1337", dashboard] = process.argv.slice(2);
if (!account || !ledger || !paymaster) throw new Error("usage: 03-point-to-live.ts <account> <ledger> <paymaster> [chainId] [dashboardUrl]");
const NAME = "meter-001.mohar.eth";
const dns = (n: string) => bytesToHex(Uint8Array.from([...n.split(".").flatMap((l) => [l.length, ...toBytes(l)]), 0]));
const REG = parseAbi(["function getResolver(string label) view returns (address)"]);
const RES = parseAbi(["function setText(bytes name, string key, string value)", "function setAddress(bytes name, uint256 coinType, bytes value)", "function multicall(bytes[] calls) returns (bytes[] results)"]);
const UR = parseAbi(["function resolve(bytes name, bytes data) view returns (bytes result, address resolver)"]);
const PROFILE = parseAbi(["function text(bytes32 node, string key) view returns (string)", "function addr(bytes32 node, uint256 coinType) view returns (bytes)"]);

const owner = privateKeyToAccount(deployerKey());
const wallet = createWalletClient({ account: owner, chain: sepolia, transport: http(SEPOLIA_RPC) });
let resolver: Address = "0x0000000000000000000000000000000000000000";
for (let i = 0; i < 10 && /^0x0+$/.test(resolver); i++) resolver = await client.readContract({ address: FLEET_REGISTRY, abi: REG, functionName: "getResolver", args: ["meter-001"] } as any) as Address;
if (/^0x0+$/.test(resolver)) throw new Error("meter-001 has no resolver");
const name = dns(NAME);
const DEVNET = process.env.MOHAR_RPC ?? "https://altmempool.forshtat.com";
const ethCall = async (to: string, data: string) => (await (await fetch(DEVNET, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) })).json()).result as Hex;
const pqRoot = await ethCall(account, "0xebf0c717");                       // root()
const pqSeed = ("0x" + (await ethCall(account, "0x63e71ad4")).slice(2, 34)) as Hex; // pubSeed(): the first 16 bytes
if (!/^0x[0-9a-f]{64}$/i.test(pqRoot)) throw new Error(`could not read root() from ${account} on ${DEVNET}: ${pqRoot}`);
console.log("account root", pqRoot, "pubSeed", pqSeed);
const calls: Hex[] = [
  encodeFunctionData({ abi: RES, functionName: "setText", args: [name, "mohar.pq.root", pqRoot] }),
  encodeFunctionData({ abi: RES, functionName: "setText", args: [name, "mohar.pq.pubSeed", pqSeed] }),
  encodeFunctionData({ abi: RES, functionName: "setAddress", args: [name, 0x80000000n | BigInt(chainId), account as Hex] }),
  encodeFunctionData({ abi: RES, functionName: "setText", args: [name, "mohar.chainId", chainId] }),
  encodeFunctionData({ abi: RES, functionName: "setText", args: [name, "mohar.ledger", ledger] }),
  encodeFunctionData({ abi: RES, functionName: "setText", args: [name, "mohar.paymaster", paymaster] }),
  ...(dashboard ? [encodeFunctionData({ abi: RES, functionName: "setText", args: [name, "agent-endpoint[web]", dashboard === "none" ? "" : dashboard] })] : []),
];
const hash = await wallet.writeContract({ address: resolver, abi: RES, functionName: "multicall", args: [calls] });
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`multicall reverted: ${hash}`);
console.log("updated in", hash);
const read = async (data: Hex) => (await client.readContract({ address: ADDR.UniversalResolver, abi: UR, functionName: "resolve", args: [name, data] })) as readonly [Hex, Address];
const node = namehash(NAME);
for (const key of ["mohar.chainId", "mohar.ledger", "mohar.paymaster"]) {
  for (let i = 0; i < 12; i++) {
    const [out] = await read(encodeFunctionData({ abi: PROFILE, functionName: "text", args: [node, key] }));
    const v = (await import("viem")).decodeAbiParameters([{ type: "string" }], out)[0];
    if (v) { console.log(key, "=", v); break; }
    await new Promise((r) => setTimeout(r, 2500));
  }
}
