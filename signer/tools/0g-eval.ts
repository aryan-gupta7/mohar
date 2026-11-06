// 0G-1: does a decision model judge meter windows reliably? Runs every labelled scenario several times through
// POST /v1/decisions and scores the answers. Needs a 0G Private Computer key in .secrets/0g-api.key (git-ignored).
// Usage: node signer/tools/0g-eval.ts [model=laya] [runs=10] [inspectThreshold=0.5]
// Output: docs/evidence/0g-1-<model>.json and a table. Nothing here ever reaches hardware.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const BASE = process.env.ZEROG_BASE ?? "https://router-api.0g.ai/v1";
const [model = "laya", runsArg = "10", thresholdArg = "0.5"] = process.argv.slice(2);
const runs = Number(runsArg);
const threshold = Number(thresholdArg);
const keyFile = path.join(ROOT, ".secrets/0g-api.key");
if (!fs.existsSync(keyFile)) throw new Error(`Put your 0G API key (sk-…) in ${keyFile}`);
const key = fs.readFileSync(keyFile, "utf8").trim();

type Scenario = { name: string; expect: "run" | "inspect"; why: string; window: Record<string, number>; context: Record<string, number | boolean> };
const { scenarios } = JSON.parse(fs.readFileSync(path.join(ROOT, "firmware/sim/scenarios.json"), "utf8")) as { scenarios: Scenario[] };

/** The state the device would send: short, plain, and well inside laya's 512-token limit. */
function describe(s: Scenario): string {
  const w = s.window;
  const c = s.context;
  return [
    `Electricity meter, last ${w.window_s} s. Sanctioned load ${c.sanctioned_load_w} W, meter limit ${c.meter_max_w} W.`,
    `Valid pulses ${w.valid_pulses}, average ${w.avg_watts} W, peak ${w.peak_watts} W, longest gap between pulses ${w.longest_gap_s} s.`,
    `Pulse-line glitches ${w.glitches}, stuck-low events ${w.stuck_low}.`,
    w.previous_avg_watts !== undefined ? `Previous window averaged ${w.previous_avg_watts} W.` : "",
  ].join(" ");
}

const questions = {
  inspect: {
    type: "noul",
    instructions: "Should a technician inspect this electricity meter?",
    criteria: {
      true: "readings suggest overload above the sanctioned load, tampering, a faulty pulse line, or behaviour that does not look like a real electrical load",
      false: "readings look like ordinary consumption within the sanctioned load",
    },
  },
};

const TIMEOUT_MS = 20_000; // the device's own limit: later than this is no decision
let timeouts = 0;

// Chat models (everything that isn't laya or vela) are asked for one word. Anything else counts as no decision.
const isDecisionModel = ["laya", "vela-2.0-9b"].includes(model);
const SYSTEM =
  "You supervise a prepaid electricity meter. Given its last-minute readings, answer with exactly one word, RUN or INSPECT. " +
  "Do not explain. Owner's policy: answer INSPECT if any of these is true: " +
  "(1) the average load is above the sanctioned load; " +
  "(2) there were 3 or more pulse-line glitches, or any stuck-low event; " +
  "(3) the previous window averaged load but this window has none, though the line is healthy; " +
  "(4) the pulse spacing does not look like a real electrical load, for example the peak is many times the average. " +
  "Otherwise answer RUN. Low credit is not a reason to inspect.";

async function ask(state: string) {
  const t0 = Date.now();
  try {
    const res = await fetch(isDecisionModel ? `${BASE}/decisions` : `${BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(
        isDecisionModel
          ? { model, state, questions }
          : { model, temperature: 0, max_tokens: 16, enable_thinking: false, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: state }] },
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    const ms = Date.now() - t0;
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    return { status: res.status, ms, bytes: text.length + [...res.headers].reduce((n, [k, v]) => n + k.length + v.length + 4, 0), headerRequestId: res.headers.get("x-request-id"), body, text };
  } catch {
    timeouts++;
    return { status: 0, ms: TIMEOUT_MS, bytes: 0, headerRequestId: null as string | null, body: undefined as any, text: "timeout" };
  }
}

const results: any[] = [];
const latencies: number[] = [];
let maxBytes = 0;
let idsMatch = 0;
let idsSeen = 0;
let lastError: string | undefined;
for (const s of scenarios) {
  const state = describe(s);
  const p: number[] = [];
  const ids: string[] = [];
  let ok = 0;
  for (let i = 0; i < runs; i++) {
    const r = await ask(state);
    latencies.push(r.ms);
    maxBytes = Math.max(maxBytes, r.bytes);
    if (r.status !== 200) {
      lastError = `${r.status} ${r.text.slice(0, 300)}`;
      console.error(`  ${s.name}: HTTP ${r.status} ${r.text.slice(0, 200)}`);
      if ([401, 402].includes(r.status)) throw new Error(`stopping: ${lastError}`);
      continue;
    }
    let prob = r.body?.answers?.inspect?.noul;
    if (!isDecisionModel) {
      // Strict allowlist: exactly RUN or INSPECT. Anything else is not a decision.
      const word = String(r.body?.choices?.[0]?.message?.content ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
      prob = word === "INSPECT" ? 1 : word === "RUN" ? 0 : undefined;
      if (prob === undefined) lastError = `not a decision: ${JSON.stringify(r.body?.choices?.[0]?.message?.content)}`;
    }
    const traceId = r.body?.x_0g_trace?.request_id;
    if (typeof prob !== "number") continue;
    p.push(prob);
    if (traceId) {
      ids.push(traceId);
      idsSeen++;
      if (traceId && String(r.headerRequestId ?? "").includes(traceId)) idsMatch++;
    }
    // The device's rule: only a clear "inspect" probability above the threshold counts as inspect.
    const action = prob >= threshold ? "inspect" : "run";
    if (action === s.expect) ok++;
  }
  results.push({ name: s.name, expect: s.expect, correct: ok, of: runs, meanProb: p.length ? p.reduce((a, b) => a + b, 0) / p.length : null, minProb: Math.min(...p), maxProb: Math.max(...p), sampleRequestId: ids[0] });
}

latencies.sort((a, b) => a - b);
const p95 = latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)];
console.log(`\nmodel ${model}, ${runs} runs each, inspect if P(inspect) >= ${threshold}\n`);
for (const r of results) console.log(`${r.correct >= Math.ceil(r.of * 0.9) ? "ok  " : "FAIL"} ${String(r.correct).padStart(2)}/${r.of}  expect ${r.expect.padEnd(7)} mean P ${r.meanProb?.toFixed(3)}  [${r.minProb?.toFixed(2)}..${r.maxProb?.toFixed(2)}]  ${r.name}`);
const passAll = results.every((r) => r.correct >= Math.ceil(r.of * 0.9));
console.log(`\n0G1-T3 every scenario at least 9/10: ${passAll ? "PASS" : "FAIL"}`);
console.log(`calls that timed out at ${TIMEOUT_MS / 1000} s (no decision): ${timeouts}`);
console.log(`0G1-T4 p95 latency ${p95} ms (limit 15000): ${p95 <= 15000 ? "PASS" : "FAIL"}`);
console.log(`0G1-T5 largest response incl. headers ${maxBytes} bytes (limit 8192): ${maxBytes <= 8192 ? "PASS" : "FAIL"}`);
console.log(`0G1-T2 trace request_id equals X-Request-ID: ${idsSeen ? `${idsMatch}/${idsSeen}` : "no ids seen"}`);

fs.mkdirSync(path.join(ROOT, "docs/evidence"), { recursive: true });
const out = path.join(ROOT, `docs/evidence/0g-1-${model}.json`);
fs.writeFileSync(out, JSON.stringify({ model, base: BASE, runs, threshold, at: new Date().toISOString(), p95Ms: p95, timeouts, maxBytes, requestIdMatch: { matched: idsMatch, seen: idsSeen }, lastError, results }, null, 2) + "\n");
console.log(`saved ${path.relative(process.cwd(), out)}`);
