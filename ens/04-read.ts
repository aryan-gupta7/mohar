// Read-only: prints meter-001.mohar.eth's records as the Universal Resolver returns them.
import { bytesToHex, decodeAbiParameters, encodeFunctionData, namehash, parseAbi, toBytes, type Address, type Hex } from "viem";
import { ADDR, client } from "./config.ts";
const NAME = process.argv[2] ?? "meter-001.mohar.eth";
const dns = bytesToHex(Uint8Array.from([...NAME.split(".").flatMap((l) => [l.length, ...toBytes(l)]), 0]));
const UR = parseAbi(["function resolve(bytes name, bytes data) view returns (bytes result, address resolver)"]);
const P = parseAbi(["function text(bytes32 node, string key) view returns (string)", "function addr(bytes32 node, uint256 coinType) view returns (bytes)"]);
const node = namehash(NAME);
const keys = ["mohar.chainId", "mohar.ledger", "mohar.paymaster", "mohar.pq.scheme", "mohar.pq.root", "mohar.pq.pubSeed", "mohar.deviceType", "mohar.tariff", "mohar.operator", "mohar.maintenance.status", "mohar.log", "agent-endpoint[web]"];
for (const k of keys) {
  const [out, resolver] = (await client.readContract({ address: ADDR.UniversalResolver, abi: UR, functionName: "resolve", args: [dns, encodeFunctionData({ abi: P, functionName: "text", args: [node, k] })] })) as readonly [Hex, Address];
  console.log(k.padEnd(26), decodeAbiParameters([{ type: "string" }], out)[0]);
}
const [a] = (await client.readContract({ address: ADDR.UniversalResolver, abi: UR, functionName: "resolve", args: [dns, encodeFunctionData({ abi: P, functionName: "addr", args: [node, 0x80000539n] })] })) as readonly [Hex, Address];
console.log("addr (chain 1337)".padEnd(26), decodeAbiParameters([{ type: "bytes" }], a)[0]);
