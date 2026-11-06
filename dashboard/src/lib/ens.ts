// ENS on Sepolia. These are the ENSv2 contracts as deployed (an older version than contracts-v2 head). The machine's
// records are read through ENS's Universal Resolver. Nothing about a meter is written in this file.
import { rpc, ethCall, RpcDead, RpcError, encodeCall, decodeArgs, namehash, dnsEncode, explainRevert } from "./abi.js";

export const ENS = {
  chainId: 11155111,
  rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe", // ENS's own proxy, not a meter
  coinType: 0x80000539n, // ENSIP-11, chain 1337
};
export const RECORDS = ["mohar.chainId", "mohar.ledger", "mohar.paymaster", "mohar.pq.scheme", "mohar.pq.root", "mohar.pq.pubSeed",
  "mohar.policy", "mohar.operator", "mohar.deviceType", "mohar.capabilities", "mohar.tariff", "mohar.maintenance.status", "mohar.log", "agent-context"] as const;

export class UserError extends Error {}

async function read(url: string, name: string, data: string) {
  const out = await ethCall(url, ENS.universalResolver, encodeCall("resolve(bytes,bytes)", [dnsEncode(name), data]));
  return decodeArgs(["bytes", "address"], out)[0] as string;
}
async function text(url: string, name: string, key: string): Promise<string | null> {
  try { return (decodeArgs(["string"], await read(url, name, encodeCall("text(bytes32,string)", [namehash(name), key])))[0] as string) || null; }
  catch (e) { if (e instanceof RpcDead) throw e; return null; }
}
async function addr(url: string, name: string): Promise<string | null> {
  try {
    const [b] = decodeArgs(["bytes"], await read(url, name, encodeCall("addr(bytes32,uint256)", [namehash(name), ENS.coinType])));
    return b && b.length === 42 ? b : null;
  } catch (e) { if (e instanceof RpcDead) throw e; return null; }
}

export type Resolved = { name: string; resolver: string; records: Record<string, string | null>; account: string | null };

// Public RPCs drop calls now and then; try each in turn so one hiccup doesn't look like a missing name.
export const ENS_FALLBACKS = [ENS.rpc, "https://sepolia.gateway.tenderly.co", "https://1rpc.io/sepolia", "https://sepolia.drpc.org"];
async function firstWorking(): Promise<string> {
  for (let round = 0; round < 2; round++)
    for (const u of ENS_FALLBACKS) { try { await rpc(u, "eth_chainId", [], 6000); return u; } catch { /* try the next */ } }
  throw new UserError(`Cannot reach the ENS network (Sepolia): none of ${ENS_FALLBACKS.length} public RPC endpoints answered.`);
}

export async function resolveName(name: string, preferred = ENS.rpc): Promise<Resolved> {
  const url = preferred === ENS.rpc ? await firstWorking() : preferred;
  let id: number;
  try { id = Number(BigInt(await rpc(url, "eth_chainId"))); } catch { throw new UserError(`Cannot reach the ENS network (Sepolia) at ${url}.`); }
  if (id !== ENS.chainId) throw new UserError(`That RPC is chain ${id}, not Sepolia (${ENS.chainId}). Names are looked up on Sepolia.`);
  let found: any[];
  try { found = decodeArgs(["address", "bytes32", "uint256"], await ethCall(url, ENS.universalResolver, encodeCall("findResolver(bytes)", [dnsEncode(name)]))); }
  catch (e) { if (e instanceof RpcDead) throw new UserError(`Cannot reach the ENS network (Sepolia) at ${url}.`); found = ["0x" + "0".repeat(40), null, 0n]; }
  const [resolver, , offset] = found;
  if (/^0x0{40}$/.test(resolver)) throw new UserError(`Unknown name: no resolver is registered for ${name}.`);
  const values = await Promise.all(RECORDS.map((k) => text(url, name, k)));
  const records: Record<string, string | null> = {};
  RECORDS.forEach((k, i) => (records[k] = values[i]));
  const account = await addr(url, name);
  if (!account && !Object.values(records).some(Boolean)) {
    if (offset > 0n) throw new UserError(`${name} is not registered. Only its parent's resolver answered, and it has no records for this name.`);
    throw new UserError(`${name} exists, but has no Mohar records yet (no account, ledger or paymaster).`);
  }
  return { name, resolver, records, account };
}

/** Dry-runs setText as `from`, with no key and no gas: shows whether ENS would accept or reject the edit. */
export async function simulateSetText(url: string, resolver: string, name: string, key: string, value: string, from: string) {
  const data = encodeCall("setText(bytes,string,string)", [dnsEncode(name), key, value]);
  try { await ethCall(url, resolver, data, from); return { ok: true, message: "Accepted: this account is allowed to change that record." }; }
  catch (e) {
    if (e instanceof RpcDead) throw e;
    const d = e instanceof RpcError ? (typeof e.data === "string" ? e.data : (e.data as any)?.data) : undefined;
    return { ok: false, message: explainRevert(d) };
  }
}
