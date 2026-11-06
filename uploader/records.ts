// Turns a ledger's `Report` events into episode-log records. The chain is the source of truth: every record can be
// rebuilt from the chain alone, and replay.ts does exactly that to check a downloaded log.
import { parseEventLogs, type Address, type Hex } from "viem";
import { rpc } from "../signer/src/devnet.ts";
import { LEDGER_ABI } from "../signer/src/mohar.ts";

const MODES = ["RUN", "INSPECT", "CREDIT_STOP", "SAFE_STOP"] as const;
// firmware/mohar/src/machine.h
const REASONS: Record<number, string> = {
  0: "ok", 1: "local_peak_power", 2: "local_pulse_line_glitches", 3: "local_stuck_pulse_line", 4: "ai_inspect",
  10: "credit_exhausted", 11: "inspection_hold", 20: "no_decision", 21: "chain_unreachable", 22: "keys_exhausted", 24: "startup",
};
const MODELS: Record<number, string | null> = { 0: null, 1: "qwen3.8-flash" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EpisodeRecord = {
  device: string;
  ledger: string;
  seq: number;
  tx: string;
  block: number;
  timestamp: number;
  request_id: string | null;
  /** Format check only: 0G request IDs are UUIDs. A UUID-shaped ID is not proof it came from 0G; "dev-injected" is not one. */
  request_id_is_uuid: boolean;
  model: string | null;
  meter: {
    simulated: true;
    total_pulses: string;
    usage_pulses: string;
    window_pulses: number;
    glitches: number;
    stuck_low: number;
    avg_watts: number;
    peak_watts: number;
    window_ms: number;
    longest_gap_ms: number;
  };
  charged_wei: string;
  owed_wei: string;
  decision: { is_decision: boolean; action: "run" | "inspect" | "none"; reason: string; reason_code: number; confidence: number };
  selected_mode: (typeof MODES)[number];
  /** The state the device entered and showed on its LED. Nothing physical is switched. */
  device_state: (typeof MODES)[number];
};

const num = (b: bigint): number | string => (b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : b.toString());

/** The 32-byte sensors word, as laid out in mechanism.md section 7b (big-endian). */
export function decodeSensors(word: Hex) {
  const b = Buffer.from(word.slice(2), "hex");
  return {
    window_pulses: b.readUInt32BE(0),
    glitches: b.readUInt16BE(4),
    stuck_low: b.readUInt16BE(6),
    avg_watts: b.readUInt16BE(8),
    peak_watts: b.readUInt16BE(10),
    window_ms: b.readUInt32BE(12),
    longest_gap_ms: b.readUInt32BE(16),
    cumulative: b.readBigUInt64BE(20),
  };
}

export type ChainReport = { seq: number; tx: Hex; block: number; args: any; logIndex: number };

export async function readReports(rpcUrl: string, ledger: Address, fromSeq = 0): Promise<ChainReport[]> {
  const logs = await rpc<any[]>("eth_getLogs", [{ address: ledger, fromBlock: "0x0", toBlock: "latest" }], rpcUrl);
  const parsed = parseEventLogs({ abi: LEDGER_ABI, eventName: "Report", logs: logs as any });
  return parsed
    .map((l: any) => ({ seq: Number(l.args.seq), tx: l.transactionHash as Hex, block: Number(l.blockNumber), args: l.args, logIndex: Number(l.logIndex) }))
    .filter((r) => r.seq > fromSeq)
    .sort((a, b) => a.seq - b.seq);
}

export async function blockTimestamp(rpcUrl: string, block: number): Promise<number> {
  const b = await rpc<any>("eth_getBlockByNumber", [`0x${block.toString(16)}`, false], rpcUrl);
  return Number(BigInt(b.timestamp));
}

export async function toRecord(rpcUrl: string, device: string, ledger: Address, r: ChainReport): Promise<EpisodeRecord> {
  const a = r.args;
  const s = decodeSensors(a.sensors);
  const requestId: string | null = a.requestId ? a.requestId : null;
  const mode = MODES[a.mode] ?? "SAFE_STOP";
  // A decision is a report that carries a request ID. Local checks carry none, and SAFE_STOP is by definition the
  // absence of a decision, so it is never one even if a request ID were present.
  const isDecision = requestId !== null && mode !== "SAFE_STOP";
  const action = !isDecision ? "none" : a.reason === 4 ? "inspect" : "run";
  return {
    device,
    ledger: ledger.toLowerCase(),
    seq: r.seq,
    tx: r.tx,
    block: r.block,
    timestamp: await blockTimestamp(rpcUrl, r.block),
    request_id: requestId,
    request_id_is_uuid: requestId !== null && UUID.test(requestId),
    model: isDecision ? (MODELS[a.model] ?? `model_${a.model}`) : null,
    meter: {
      simulated: true,
      total_pulses: String(a.total),
      usage_pulses: String(a.usage),
      window_pulses: s.window_pulses,
      glitches: s.glitches,
      stuck_low: s.stuck_low,
      avg_watts: s.avg_watts,
      peak_watts: s.peak_watts,
      window_ms: s.window_ms,
      longest_gap_ms: s.longest_gap_ms,
    },
    charged_wei: String(a.charged),
    owed_wei: String(a.owed),
    decision: { is_decision: isDecision, action, reason: REASONS[a.reason] ?? `code_${a.reason}`, reason_code: a.reason, confidence: a.confidence },
    selected_mode: mode,
    device_state: mode,
  };
}

/** Stable JSON: keys sorted, so the same records always give the same bytes (and the same root hash). */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x && typeof x === "object") return `{${Object.keys(x as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((x as any)[k])}`).join(",")}}`;
  return JSON.stringify(x);
}

export type Batch = { schema: "mohar-episode-log/1"; device: string; ledger: string; chainId: number; fromSeq: number; toSeq: number; records: EpisodeRecord[] };
export const batchBytes = (b: Batch): Uint8Array => new TextEncoder().encode(canonical(b));
