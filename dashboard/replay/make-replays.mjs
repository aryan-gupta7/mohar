// Generates the sample replay logs. Format: "+<ms since start> <line>", lines exactly as docs/event-protocol.md.
// These are REPLAYS: written to follow the protocol, not recorded from a run, and the UI badges them as such.
import fs from "node:fs";
const ROOT = "0x6c0937ea06ed23562708791235b395d11e0888eccf5c6271fb79e4c254687701", PUB = "0x0a2886f4dcbaff6c44092ce15806b2c8";
const H = (n) => "0x" + n.toString(16).padStart(64, "0");
function run(name, o) {
  const out = []; let t = 0, up = 52000, pulses = 0, glitches = 0, cp = 1;
  const at = (ms, line) => out.push(`+${ms} ${line}`);
  at(0, "KEY READY root=" + ROOT + " pubSeed=" + PUB + " ms=5 source=loaded");
  const meter = (ev, mode, w) => `METER ${JSON.stringify({ event: ev, mode, watts: w, pulses, glitches, wh: +(pulses * 0.3125).toFixed(4), auto: false })}`;
  at(300, meter("load", o.mode, o.watts));
  const rate = o.watts / 1125; // pulses per second
  for (let s = 1; s <= 10; s++) { pulses += Math.round(rate * 2); if (o.glitch) glitches += 2; at(s * 2000, meter("tick", o.mode, o.watts)); }
  t = 21000; up += 21000;
  const ev = (dt, fields) => { t += dt; up += dt; at(t, "EV " + JSON.stringify({ cp, ms: up, ...fields })); };
  const w = o.window;
  ev(0, { e: "cp_start" });
  ev(150, { e: "window", valid: w.valid, glitches: w.glitches, stuck: 0, avgW: w.avgW, peakW: w.peakW, windowMs: 20000, gapMs: w.gapMs, total: pulses });
  ev(900, { e: "ledger_read", ok: true, credit: o.credit, arrears: o.arrears, hold: o.hold ? 1 : 0, lastSeq: o.seq - 1, lastTotal: o.prevTotal, tariff: 1000000000, ledgerMode: o.ledgerMode, nonce: o.seq });
  ev(10, { e: "local_check", result: o.local ?? "pass" });
  if (!o.local) {
    ev(5, { e: "ai_request", model: "qwen3.8-flash", provider: "0G Private Computer" });
    if (o.aiDown) ev(20000, { e: "ai_response", answer: "NONE", rid: "", latencyMs: 0, http: -1, why: "http_-1" });
    else ev(1200, { e: "ai_response", answer: o.ai, rid: o.rid, latencyMs: 1180, http: 200, why: "" });
  }
  ev(5, { e: "decision", mode: o.mode_, reason: o.reason, aiWanted: o.aiWanted, ledgerHold: o.hold ? 1 : 0, ledgerMode: o.ledgerMode, aiSource: o.aiDown ? "http_-1" : o.local ? "none" : "0g" });
  ev(20, { e: "sign_start", nonce: o.seq, leaf: o.seq - 1 });
  ev(520, { e: "sign_done", result: "OK", ms: 520, steps: 498, leaf: o.seq - 1, leavesLeft: 256 - o.seq, resent: 0 });
  ev(10, { e: "submit", transport: "wifi" });
  const hash = "0x" + (o.seq * 7919).toString(16).padStart(8, "0").repeat(8);
  ev(2800, { e: "submitted", result: "ok", hash });
  ev(5, { e: "cp_end", mode: o.mode_, totalMs: 4500 });
  at(t + 40, `CP mode=${o.mode_} reason=${o.reason} ai=${o.ai ?? "none"} rid=${o.rid || "-"} seq=${o.seq} nonce=${o.seq} total=${pulses}`);
  const receipt = { blockNumber: "0x" + (1200 + o.seq).toString(16), frameReceipts: [75000, 7556, 33800, 11670].map((g) => ({ status: "0x1", gasUsed: "0x" + g.toString(16) })) };
  at(t + 6000, "REPLAY-CHAIN " + JSON.stringify({ receipts: { [hash]: receipt }, ledger: { credit: String(o.credit - 20e9), hold: o.mode_ === "INSPECT" || o.hold, lastSeq: o.seq, lastTotal: pulses, tariff: "1000000000", arrears: String(o.arrears), lastMode: ["RUN", "INSPECT", "CREDIT_STOP", "SAFE_STOP"].indexOf(o.mode_), ledgerMode: o.ledgerMode } }));
  for (let s = 1; s <= 4; s++) { pulses += Math.round(rate * 2); at(t + 6000 + s * 2000, meter("tick", o.mode, o.watts)); }
  fs.writeFileSync(new URL(`./${name}.log`, import.meta.url), out.join("\n") + "\n");
}
run("surge-inspect", { mode: "surge", watts: 12000, window: { valid: 213, glitches: 0, avgW: 11980, peakW: 12400, gapMs: 120 }, credit: 5e11, arrears: 0, seq: 3, prevTotal: 120, ledgerMode: 0, ai: "INSPECT", rid: "5f0c8a3e-71d2-4b6a-9c11-8e2a4d7b90f1", mode_: "INSPECT", reason: 4, aiWanted: "INSPECT" });
run("glitch-local", { mode: "glitch", watts: 900, glitch: true, local: "glitch", window: { valid: 19, glitches: 9, avgW: 905, peakW: 1010, gapMs: 3500 }, credit: 5e11, arrears: 0, seq: 4, prevTotal: 200, ledgerMode: 0, mode_: "INSPECT", reason: 2, aiWanted: "INSPECT" });
run("ai-down-safe-stop", { mode: "normal", watts: 900, window: { valid: 18, glitches: 0, avgW: 898, peakW: 990, gapMs: 3600 }, credit: 5e11, arrears: 0, seq: 5, prevTotal: 260, ledgerMode: 0, aiDown: true, mode_: "SAFE_STOP", reason: 20, aiWanted: "SAFE_STOP" });
run("credit-stop", { mode: "heavy", watts: 3000, window: { valid: 53, glitches: 0, avgW: 2990, peakW: 3100, gapMs: 1200 }, credit: 0, arrears: 14e9, seq: 6, prevTotal: 300, ledgerMode: 2, ai: "RUN", rid: "a41e6d90-2c3b-4f58-8d77-1b9e0c52e6a4", mode_: "CREDIT_STOP", reason: 10, aiWanted: "RUN" });
