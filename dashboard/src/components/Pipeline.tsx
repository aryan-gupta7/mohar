import { useState } from "react";
import { STAGES, REASONS, stageStatuses, evOf, type StageId, type StageView } from "../lib/events";
import { useStore } from "../store";
import { Badge, Card, Mono, Row, StatusIcon, short, ago, fmtKwh, ModePill, type BadgeKind } from "./ui";

const TONE: Record<string, string> = { COMPLETED: "border-lime/50", PROCESSING: "border-lav/70 shadow-[0_0_24px_-6px_#a88ed4]", FAILED: "border-bad/60", UNAVAILABLE: "border-line opacity-70", WAITING: "border-line" };

export function usePipeline() {
  const s = useStore();
  const cp = s.cps[s.cps.length - 1];
  const sm = evOf(cp, "submitted"), lr = evOf(cp, "ledger_read");
  const hash = sm?.result === "ok" ? (sm.hash as string) : undefined;
  const receipt = hash ? s.receipts[hash] : undefined;
  const expected = lr?.ok ? Number(lr.lastSeq) + 1 : undefined;
  const confirmed = !!(receipt && expected !== undefined && s.chain.ledger && s.chain.ledger.lastSeq >= expected);
  const picoAlive = !!s.meter && (s.mode === "replay" || s.now - s.pico.lastAt < 8000);
  const views = stageStatuses(cp, picoAlive, { receipt, confirmed });
  return { s, cp, views, receipt, hash, confirmed, expected };
}

function Node({ v, i, open, onOpen }: { v: StageView; i: number; open: boolean; onOpen: () => void }) {
  const st = STAGES[i];
  return (
    <button data-stage={v.id} data-status={v.status} onClick={onOpen} aria-expanded={open} className={`card relative min-w-0 w-full flex-1 p-3 text-left transition ${TONE[v.status]} ${open ? "ring-2 ring-lime/60" : ""}`}>
      <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-mute">STAGE {st.n}</span><StatusIcon s={v.status} /></div>
      <div className="mt-1 text-sm font-semibold leading-tight">{st.title}</div>
      <div className="text-[11px] text-mute">{st.sub}</div>
      <div className="mt-2 text-[11px] leading-snug min-h-[30px]">{v.detail}</div>
      <div className="mt-2 flex flex-col items-start gap-1"><Badge k={st.badge as BadgeKind} /><span className="text-[10px] font-semibold tracking-wide text-mute">{v.status}</span></div>
    </button>
  );
}
const DOT: Record<string, string> = { COMPLETED: "#b9e303", PROCESSING: "#a88ed4", FAILED: "#ff6b6b", UNAVAILABLE: "#556", WAITING: "#2c3243" };
/** One line through all eight stages. A segment animates only while the stage after it is actually processing. */
function Rail({ views, cp }: { views: StageView[]; cp?: { done: boolean } }) {
  return (
    <div className="mb-4 flex items-center" aria-hidden>
      {views.map((v, i) => (
        <div key={v.id} className="flex items-center flex-1 min-w-0 last:flex-none">
          <div className="relative h-4 w-4 rounded-full border-2 shrink-0" style={{ borderColor: DOT[v.status], background: v.status === "COMPLETED" ? DOT.COMPLETED : "transparent" }}>
            {v.status === "PROCESSING" && <span className="absolute inset-0 rounded-full pulse-ring" style={{ background: DOT.PROCESSING }} />}
          </div>
          {i < views.length - 1 && (
            <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="h-1 flex-1 min-w-0 w-0"><line x1="0" y1="2" x2="100" y2="2" className={views[i + 1].status === "PROCESSING" || (v.status === "COMPLETED" && views[i + 1].status === "WAITING" && cp && !cp.done) ? "flowline" : ""} stroke={v.status === "COMPLETED" ? DOT.COMPLETED : DOT.WAITING} strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg>
          )}
        </div>
      ))}
    </div>
  );
}

export function Pipeline() {
  const { s, cp, views, receipt, hash, confirmed, expected } = usePipeline();
  const [open, setOpen] = useState<StageId>("pico");
  return (
    <div>
      <Rail views={views} cp={cp} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {views.map((v, i) => <Node key={v.id} v={v} i={i} open={open === v.id} onOpen={() => setOpen(v.id)} />)}
      </div>
      <div className="mt-4"><Detail id={open} s={s} cp={cp} receipt={receipt} hash={hash} confirmed={confirmed} expected={expected} view={views.find((x) => x.id === open)!} /></div>
    </div>
  );
}

function Detail({ id, s, cp, receipt, hash, confirmed, expected, view }: any) {
  const e = (n: string) => evOf(cp, n);
  const w = e("window"), air = e("ai_response"), aq = e("ai_request"), dec = e("decision"), sd = e("sign_done"), sm = e("submitted"), sub = e("submit"), lr = e("ledger_read"), lc = e("local_check");
  const title = STAGES.find((x) => x.id === id)!;
  let body: any = null;
  if (id === "pico") body = (
    <>
      <Row k="Scenario">{s.meter ? `${s.meter.mode} · ${s.meter.watts} W` : "—"} <Badge k="SIMULATED INPUT" /></Row>
      <Row k="Pulses generated since the Pico started">{s.meter?.pulses ?? "—"}</Row>
      <Row k="Glitches injected">{s.meter?.glitches ?? "—"}</Row>
      <Row k="Last METER line">{ago(s.pico.lastAt, s.now)}</Row>
      <p className="mt-2 text-xs text-mute">The browser sends one character naming a scenario. The Pico turns it into a real pulse train on GP0 (30 ms low pulses, open-collector style) which the ESP8266 counts on D6. No reading is ever sent to the ESP.</p>
    </>
  );
  if (id === "esp") body = w ? (
    <>
      <Row k="Valid pulses in this window">{w.valid}</Row><Row k="Rejected glitches (under 15 ms)">{w.glitches}</Row><Row k="Stuck-low events (over 200 ms)">{w.stuck}</Row>
      <Row k="Window">{(w.windowMs / 1000).toFixed(1)} s</Row><Row k="Average power">{w.avgW} W <Badge k="DERIVED" /></Row><Row k="Peak power">{w.peakW} W <Badge k="DERIVED" /></Row>
      <Row k="Cumulative pulses (device count)">{w.total} = {fmtKwh(w.total)} kWh <Badge k="LIVE HARDWARE" /></Row><Row k="Longest gap between pulses">{(w.gapMs / 1000).toFixed(1)} s</Row>
      <p className="mt-2 text-xs text-mute">3,200 pulses = 1 kWh. Power is estimated from pulse timing: W = pulses × 1,125,000 ÷ window ms. It is calculated, not measured with a voltage or current sensor.</p>
    </>
  ) : <p className="text-sm text-mute">No measurement window received yet. A checkpoint runs about every 20 to 60 s.</p>;
  if (id === "ai") body = (
    <>
      <Row k="Provider">0G Private Computer</Row><Row k="Model">qwen3.8-flash (reasoning off)</Row>
      <Row k="Fixed check first">{lc ? (lc.result === "pass" ? "passed, so the AI was asked" : `${lc.result}: decided without the AI`) : "—"} <Badge k="LOCAL POLICY" /></Row>
      <Row k="Answer">{air ? air.answer : aq ? "waiting…" : "—"} {air && air.answer !== "NONE" && <Badge k="AI RESPONSE" />}</Row>
      <Row k="Request ID"><Mono>{air?.rid || "—"}</Mono></Row><Row k="Latency">{air ? `${air.latencyMs} ms` : "—"}</Row>
      <Row k="Confidence">Not provided by this model</Row>
      {air?.answer === "NONE" && <Row k="Why no decision">{air.why || "no answer"}: the device chooses SAFE_STOP and never invents one</Row>}
      <p className="mt-2 text-xs text-mute">The AI can only add caution. It cannot clear a hold or override a credit restriction.</p>
    </>
  );
  if (id === "policy") body = dec ? (
    <>
      <Row k="Final state"><ModePill mode={dec.mode} /></Row><Row k="Why">{REASONS[dec.reason] ?? `reason ${dec.reason}`}</Row>
      <Row k="Without the ledger, the device would choose">{dec.aiWanted}</Row><Row k="Ledger inspection hold">{dec.ledgerHold ? "set" : "not set"}</Row>
      <Row k="Ledger's own view">{["RUN", "INSPECT", "CREDIT_STOP", "SAFE_STOP"][dec.ledgerMode]}</Row>
      <p className="mt-2 text-xs text-mute">Order of caution: SAFE_STOP → INSPECT → CREDIT_STOP → RUN. CREDIT_STOP is a ledger state: the meter keeps counting and unpaid usage accrues as arrears. Nothing is disconnected.</p>
    </>
  ) : <p className="text-sm text-mute">Waiting for the checks.</p>;
  if (id === "sign") body = (
    <>
      <Row k="Device key (Merkle root)"><Mono>{short(s.deviceKey?.root, 12, 8)}</Mono></Row>
      <Row k="Scheme">Hash-based, WOTS-like, Keccak-256 — experimental, unaudited <Badge k="SIGNED" /></Row>
      <Row k="One-time key used">{sd ? `#${sd.leaf}` : "—"}</Row><Row k="Keys left of 256">{sd ? sd.leavesLeft : "—"}</Row>
      <Row k="Signing time">{sd ? `${sd.ms} ms` : "—"}</Row><Row k="Result">{sd ? (sd.resent ? `${sd.result} (resent a saved, identical report)` : sd.result) : "—"}</Row>
      <p className="mt-2 text-xs text-mute">The ESP8266 signs its own report. This page never sees the seed or any signing key.</p>
    </>
  );
  if (id === "tx") body = (
    <>
      <Row k="Prepared → signed">{sd?.result === "OK" ? "done" : "—"}</Row><Row k="Submitted via">{sub?.transport ?? "—"}</Row>
      <Row k="Node answer">{sm ? (sm.result === "ok" ? "Admitted by the alt mempool" : sm.result) : "—"} {sm?.result === "ok" && <Badge k="MEMPOOL ACCEPTED" />}</Row>
      <Row k="Transaction hash"><Mono>{hash ?? "—"}</Mono></Row>
      <Row k="Mined">{receipt ? `block ${parseInt(receipt.blockNumber, 16)}` : hash ? "not yet" : "—"}</Row>
      <p className="mt-2 text-xs text-mute">Submitted is not confirmed. A transaction is only on-chain once a receipt exists and the ledger shows its sequence number.</p>
    </>
  );
  if (id === "contracts") {
    const f = receipt?.frameReceipts ?? [];
    const lab = ["Frame 0 · MoharAccount checks the device signature and scope", "Frame 1 · QuotaPaymaster approves payment from the quota", "Frame 2 · MachineLedger records the report", "Frame 3 · QuotaPaymaster settles the quota"];
    body = (
      <>
        {lab.map((l, i) => <Row key={i} k={l}>{f[i] ? (f[i].status === "0x1" ? "succeeded" : "FAILED") : "—"} {f[i] && <span className="text-mute text-xs">gas {parseInt(f[i].gasUsed, 16)}</span>}</Row>)}
        <Row k="Sponsored quota left">{s.chain.quota ? `${s.chain.quota.remaining} of ${s.chain.quota.daily}` : "unknown (paymaster address not known)"}</Row>
        <Row k="Account paid for gas">no — the QuotaPaymaster did</Row>
      </>
    );
  }
  if (id === "record") {
    const L = s.chain.ledger;
    body = L ? (
      <>
        <Row k="Report sequence this checkpoint will have">{expected ?? "—"}</Row><Row k="Ledger's last sequence">{L.lastSeq}</Row>
        <Row k="Confirmed pulses">{L.lastTotal} = {fmtKwh(L.lastTotal)} kWh <Badge k="ON-CHAIN CONFIRMED" /></Row>
        <Row k="Credit left (demo credit)">{L.tariff > 0n ? `${(L.credit / L.tariff).toString()} pulses` : L.credit.toString() + " wei"}</Row>
        <Row k="Arrears">{L.tariff > 0n ? `${(L.arrears / L.tariff).toString()} pulses` : L.arrears.toString() + " wei"}</Row>
        <Row k="Hold">{L.hold ? "set" : "none"}</Row><Row k="Confirmation">{confirmed ? "yes" : "not yet"}</Row>
        {lr?.ok && <Row k="Device's count vs ledger">{w ? `${w.total} (device) vs ${L.lastTotal} (ledger)` : "—"}</Row>}
      </>
    ) : <p className="text-sm text-mute">No ledger to read yet. Set the name or a test ledger address in Settings.</p>;
  }
  return (
    <Card>
      <div className="flex items-center justify-between mb-2"><div className="font-semibold">{title.n}. {title.title} <span className="text-mute font-normal text-xs">· {title.sub}</span></div><StatusIcon s={view.status} /></div>
      {body}
    </Card>
  );
}
