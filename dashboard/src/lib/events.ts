// Parsing of the hardware's lines (docs/event-protocol.md) and the pipeline state derived from them.
// Nothing here advances on a timer: a stage changes only when its event has been received.
export type Status = "WAITING" | "PROCESSING" | "COMPLETED" | "FAILED" | "UNAVAILABLE";
export type Source = "live" | "replay";

export type MeterLine = { event: string; mode: string; watts: number; pulses: number; glitches: number; wh: number; auto: boolean; at: number; source: Source };
export type EvLine = { e: string; cp: number; ms: number; at: number; source: Source; [k: string]: any };

export function parseLine(raw: string, at: number, source: Source): { meter?: MeterLine; ev?: EvLine; key?: { root: string; pubSeed: string }; cp?: string } {
  const line = raw.trim();
  if (line.startsWith("METER ")) {
    try { return { meter: { ...JSON.parse(line.slice(6)), at, source } }; } catch { return {}; }
  }
  if (line.startsWith("EV ")) {
    try { return { ev: { ...JSON.parse(line.slice(3)), at, source } }; } catch { return {}; }
  }
  if (line.startsWith("KEY READY") || line.startsWith("INFO ")) {
    const root = /root=(0x[0-9a-f]{64})/.exec(line)?.[1], pubSeed = /pubSeed=(0x[0-9a-f]{32})/.exec(line)?.[1];
    if (root && pubSeed) return { key: { root, pubSeed } };
  }
  if (line.startsWith("CP ")) return { cp: line };
  return {};
}

export const MODES = ["RUN", "INSPECT", "CREDIT_STOP", "SAFE_STOP"] as const;
export const REASONS: Record<number, string> = {
  0: "Nothing unusual", 1: "Peak load above the meter's limit (fixed check)", 2: "Repeated glitches on the pulse line (fixed check)",
  3: "Pulse line held low (fixed check)", 4: "0G AI recommended inspection", 10: "Credit exhausted; usage is accruing as arrears",
  11: "Inspection hold on the ledger", 20: "No valid decision from the AI service", 21: "Chain unreachable", 22: "All 256 signing keys used", 24: "Starting up",
};

export const STAGES = [
  { id: "pico", n: 1, title: "Meter simulator", sub: "Raspberry Pi Pico H", badge: "SIMULATED INPUT" },
  { id: "esp", n: 2, title: "Pulse capture", sub: "ESP8266", badge: "LIVE HARDWARE" },
  { id: "ai", n: 3, title: "AI assessment", sub: "0G · qwen3.8-flash", badge: "AI RESPONSE" },
  { id: "policy", n: 4, title: "Policy and state", sub: "Firmware rules + ledger", badge: "LOCAL POLICY" },
  { id: "sign", n: 5, title: "Signing", sub: "Hash-based, on the device", badge: "SIGNED" },
  { id: "tx", n: 6, title: "Transaction", sub: "Frame tx via alt mempool", badge: "MEMPOOL ACCEPTED" },
  { id: "contracts", n: 7, title: "Contracts", sub: "Account · Paymaster · Ledger", badge: "ON-CHAIN CONFIRMED" },
  { id: "record", n: 8, title: "Verified record", sub: "MachineLedger", badge: "ON-CHAIN CONFIRMED" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

export type Checkpoint = { cp: number; events: EvLine[]; first: number; last: number; source: Source; done: boolean };

/** Groups EV lines into checkpoints. A new `cp_start` (or a changed cp number after a reset) opens a new one. */
export function groupCheckpoints(evs: EvLine[]): Checkpoint[] {
  const out: Checkpoint[] = [];
  for (const ev of evs) {
    let cur = out[out.length - 1];
    if (!cur || ev.e === "cp_start" || (cur.done && ev.cp !== cur.cp)) {
      cur = { cp: ev.cp, events: [], first: ev.at, last: ev.at, source: ev.source, done: false };
      out.push(cur);
    }
    cur.events.push(ev);
    cur.last = ev.at;
    if (ev.e === "cp_end") cur.done = true;
  }
  return out;
}

export const evOf = (c: Checkpoint | undefined, e: string) => c?.events.find((x) => x.e === e);

export type StageView = { id: StageId; status: Status; detail: string; at?: number };

/** Stage statuses for one checkpoint, from the events it actually contains. */
export function stageStatuses(c: Checkpoint | undefined, picoAlive: boolean, chain: { receipt?: any; confirmed?: boolean; checked?: boolean }): StageView[] {
  const w = evOf(c, "window"), ai = evOf(c, "ai_response"), aiReq = evOf(c, "ai_request"), lc = evOf(c, "local_check"),
    dec = evOf(c, "decision"), ss = evOf(c, "sign_start"), sd = evOf(c, "sign_done"), sub = evOf(c, "submit"), sm = evOf(c, "submitted");
  const open = c && !c.done;
  const v: StageView[] = [];
  v.push({ id: "pico", status: picoAlive ? "COMPLETED" : "WAITING", detail: picoAlive ? "Producing pulses" : "No METER line received yet" });
  v.push({ id: "esp", status: w ? "COMPLETED" : c ? "PROCESSING" : "WAITING", detail: w ? `${w.valid} valid pulses in the window` : "Waiting for a measurement window", at: w?.at });
  let aiStatus: Status = "WAITING", aiDetail = "Waiting for a checkpoint";
  if (lc && lc.result !== "pass") { aiStatus = "UNAVAILABLE"; aiDetail = `Skipped: the fixed ${lc.result} check already decided`; }
  else if (ai) { aiStatus = ai.answer === "NONE" ? "FAILED" : "COMPLETED"; aiDetail = ai.answer === "NONE" ? `No decision (${ai.why || "no answer"})` : `${ai.answer} in ${ai.latencyMs} ms`; }
  else if (aiReq) { aiStatus = "PROCESSING"; aiDetail = "Request sent to 0G"; }
  else if (c && open && w) { aiStatus = "PROCESSING"; aiDetail = "Preparing the request"; }
  v.push({ id: "ai", status: aiStatus, detail: aiDetail, at: (ai ?? aiReq)?.at });
  v.push({ id: "policy", status: dec ? "COMPLETED" : lc ? "PROCESSING" : "WAITING", detail: dec ? `${dec.mode} (reason ${dec.reason})` : "Waiting for the checks", at: dec?.at });
  v.push({ id: "sign", status: sd ? (sd.result === "OK" ? "COMPLETED" : "FAILED") : ss ? "PROCESSING" : "WAITING", detail: sd ? (sd.result === "OK" ? `Signed in ${sd.ms} ms with key ${sd.leaf} (${sd.leavesLeft} left)` : `Not signed: ${sd.result}`) : ss ? "Signing with a one-time key" : "Waiting", at: (sd ?? ss)?.at });
  let tx: StageView = { id: "tx", status: "WAITING", detail: "Waiting for a signed report" };
  if (sm) tx = { id: "tx", status: sm.result === "ok" ? "COMPLETED" : "FAILED", detail: sm.result === "ok" ? (chain.receipt ? "Mined" : "Admitted by the mempool; waiting to be mined") : `Node answer: ${sm.result}`, at: sm.at };
  else if (sub) tx = { id: "tx", status: "PROCESSING", detail: `Submitted via ${sub.transport}`, at: sub.at };
  else if (sd && sd.result !== "OK") tx = { id: "tx", status: "UNAVAILABLE", detail: "Nothing to send" };
  v.push(tx);
  const r = chain.receipt;
  const frames: any[] = r?.frameReceipts ?? [];
  const allOk = frames.length > 0 && frames.every((f) => f.status === "0x1");
  v.push({ id: "contracts", status: r ? (allOk ? "COMPLETED" : "FAILED") : sm?.result === "ok" ? "PROCESSING" : "WAITING", detail: r ? (allOk ? "All four frames succeeded" : "A frame failed") : "Waiting for the receipt" });
  v.push({ id: "record", status: chain.confirmed ? "COMPLETED" : sm?.result === "ok" ? "PROCESSING" : "WAITING", detail: chain.confirmed ? "Ledger sequence reached this report" : "Waiting for the ledger to show it" });
  return v;
}
