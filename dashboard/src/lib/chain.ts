// Reads of the Mohar devnet: the ledger's status() and Report events, receipts, paymaster quota. Read only.
import { createPublicClient, decodeEventLog, http, parseAbi, type Hex } from "viem";
import { rpc, ethCall, decodeArgs, encodeCall } from "./abi.js";

export const LEDGER_EVENTS = parseAbi([
  "event Report(uint64 indexed seq, uint64 total, uint64 usage, uint256 charged, uint256 owed, uint8 mode, uint8 reason, uint8 confidence, uint8 model, uint32 salt, bytes32 sensors, string requestId)",
  "event HoldSet(uint64 indexed seq)",
  "event HoldCleared(address indexed by)",
  "event TopUp(address indexed from, uint256 amount, uint256 paidArrears, uint256 credit)",
]);

export type LedgerStatus = { credit: bigint; hold: boolean; lastSeq: number; lastTotal: number; tariff: bigint; earned: bigint; arrears: bigint; lastMode: number; ledgerMode: number };

export async function readStatus(url: string, ledger: string): Promise<LedgerStatus> {
  const out = await ethCall(url, ledger, "0x200d2ed2");
  const t = ["uint256", "bool", "uint64", "uint64", "uint256", "uint256", "uint256", "uint8", "uint8"];
  const [credit, hold, lastSeq, lastTotal, tariff, earned, arrears, lastMode, ledgerMode] = decodeArgs(t, out) as any[];
  return { credit, hold, lastSeq: Number(lastSeq), lastTotal: Number(lastTotal), tariff, earned, arrears, lastMode: Number(lastMode), ledgerMode: Number(ledgerMode) };
}
export async function readAccountRoot(url: string, account: string): Promise<string> {
  return (await ethCall(url, account, "0xebf0c717")) as string;
}
/** Remaining sponsored transactions for a device in the QuotaPaymaster (policyOf: remaining is the top 64 bits). */
export async function readQuota(url: string, paymaster: string, device: string): Promise<{ remaining: number; daily: number } | null> {
  try {
    const out = await ethCall(url, paymaster, encodeCall("policyOf(address)", [device]));
    const w = BigInt(out);
    return { remaining: Number(w >> 192n), daily: Number((w >> 128n) & 0xffffffffffffffffn) };
  } catch { return null; }
}

/** The report's 32-byte `sensors` word, as the firmware packs it (mechanism.md, "Pulse counting"). */
export function decodeSensors(hex: string) {
  const b = hex.replace(/^0x/, "");
  const u = (a: number, n: number) => parseInt(b.slice(2 * a, 2 * (a + n)), 16);
  const total = (BigInt("0x" + b.slice(40, 48)) << 32n) | BigInt("0x" + b.slice(48, 56));
  return { valid: u(0, 4), glitches: u(4, 2), stuck: u(6, 2), avgW: u(8, 2), peakW: u(10, 2), windowMs: u(12, 4), gapMs: u(16, 4), total: Number(total) };
}

export type ReportRow = {
  seq: number; total: number; usage: number; charged: bigint; owed: bigint; mode: number; reason: number; confidence: number; model: number;
  sensors: ReturnType<typeof decodeSensors>; requestId: string; tx: string; block: number; time?: number;
};

export async function readReports(url: string, ledger: string, lookback = 20000): Promise<{ rows: ReportRow[]; holds: any[] }> {
  const client = createPublicClient({ transport: http(url) });
  const head = await client.getBlockNumber();
  const fromBlock = head > BigInt(lookback) ? head - BigInt(lookback) : 0n;
  const logs = await client.getLogs({ address: ledger as Hex, fromBlock, toBlock: head });
  const rows: ReportRow[] = [], holds: any[] = [];
  const times = new Map<bigint, number>();
  for (const l of logs) {
    let ev: any;
    try { ev = decodeEventLog({ abi: LEDGER_EVENTS, data: l.data, topics: l.topics as any }); } catch { continue; }
    if (!times.has(l.blockNumber!)) {
      try { times.set(l.blockNumber!, Number((await client.getBlock({ blockNumber: l.blockNumber! })).timestamp)); } catch { /* time stays unknown */ }
    }
    const time = times.get(l.blockNumber!);
    if (ev.eventName === "Report") {
      const a = ev.args;
      rows.push({ seq: Number(a.seq), total: Number(a.total), usage: Number(a.usage), charged: a.charged, owed: a.owed, mode: a.mode, reason: a.reason, confidence: a.confidence, model: a.model, sensors: decodeSensors(a.sensors), requestId: a.requestId, tx: l.transactionHash!, block: Number(l.blockNumber), time });
    } else holds.push({ kind: ev.eventName, args: ev.args, tx: l.transactionHash, block: Number(l.blockNumber), time });
  }
  rows.sort((a, b) => a.seq - b.seq);
  return { rows, holds };
}

export const getReceipt = async (url: string, hash: string) => {
  try { return await rpc(url, "eth_getTransactionReceipt", [hash]); } catch { return null; }
};
export const getTxStatus = async (url: string, hash: string) => {
  try { return await rpc(url, "skandha_frameTransactionStatus", [hash]); } catch { return null; }
};
export const getBlockNumber = async (url: string) => parseInt(await rpc(url, "eth_blockNumber", []), 16);
export const getChainId = async (url: string) => parseInt(await rpc(url, "eth_chainId", []), 16);
