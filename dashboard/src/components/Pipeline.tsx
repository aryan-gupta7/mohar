// The pipeline. The stepper follows UIarc "Stepper": connectors fill in order, a check draws itself, a ring marks the active step.
// Every motion is driven by a real stage status (an EV line, a METER line, an RPC receipt). An idle pipeline does not move.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { archiveOf } from "../lib/ens";
import { STAGES, REASONS, stageStatuses, evOf, type Status, type StageId, type StageView } from "../lib/events";
import { useStore } from "../store";
import { Mono, Row, short, ago, fmtKwh, ModePill, Tag } from "./ui";
import { Odometer } from "./motion";

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

/* ---------- stepper ---------- */
function Marker({ n, status }: { n: number; status: Status }) {
  const reduce = useReducedMotion();
  const done = status === "COMPLETED", bad = status === "FAILED", busy = status === "PROCESSING";
  return (
    <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center">
      <motion.span className="absolute inset-0 rounded-full" initial={false}
        animate={{ backgroundColor: done ? "var(--ok)" : bad ? "var(--bad)" : "rgba(0,0,0,0)", boxShadow: done || bad ? "inset 0 0 0 0 transparent" : `inset 0 0 0 1.5px ${busy ? "var(--fg)" : "var(--faint)"}` }} transition={{ duration: reduce ? 0 : 0.25 }} />
      {busy && !reduce && <motion.span className="absolute inset-0 rounded-full border border-fg" initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }} />}
      {busy && <svg className="absolute inset-0" viewBox="0 0 28 28" style={{ animation: reduce ? undefined : "spin 1.1s linear infinite" }}><circle cx="14" cy="14" r="12.75" fill="none" stroke="var(--fg)" strokeWidth="2" strokeLinecap="round" strokeDasharray="20 80" /></svg>}
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.svg key="c" viewBox="0 0 28 28" className="relative h-7 w-7" initial={{ opacity: 1 }}><motion.path d="M8.5 14.5l3.6 3.6 7.4-8" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} /></motion.svg>
        ) : bad ? (
          <motion.svg key="x" viewBox="0 0 28 28" className="relative h-7 w-7"><motion.path d="M9.5 9.5l9 9M18.5 9.5l-9 9" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3 }} /></motion.svg>
        ) : (
          <motion.span key="n" className={`relative text-xs tabular-nums ${busy ? "font-medium text-fg" : "text-faint"}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{n}</motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Link to the next stage. Fills when this stage completes; a packet travels down it while the next stage is really processing. */
function Link({ filled, flowing, failed }: { filled: boolean; flowing: boolean; failed: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden className="relative ml-[13px] block h-5 w-px overflow-hidden bg-line">
      <motion.span className={`absolute inset-x-0 top-0 h-full origin-top ${failed ? "bg-bad" : "bg-ok"}`} initial={false} animate={{ scaleY: filled ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.45, ease: [0.4, 0, 0.2, 1] }} />
      {flowing && !reduce && <motion.span className="absolute left-0 top-0 h-2.5 w-px bg-fg" initial={{ y: -10 }} animate={{ y: 20 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />}
    </span>
  );
}

export function Pipeline() {
  const { s, cp, views, receipt, hash, confirmed, expected } = usePipeline();
  const [pin, setPin] = useState<StageId | null>(null);
  // Follow the work: the open stage is the one that is processing, else the latest completed one, unless the user pinned one.
  let active = 0;
  views.forEach((v, i) => { if (v.status === "PROCESSING") active = i; });
  if (!views.some((v) => v.status === "PROCESSING")) views.forEach((v, i) => { if (v.status === "COMPLETED" || v.status === "FAILED") active = i; });
  const open = pin ?? views[active].id;
  useEffect(() => { setPin(null); }, [cp?.cp]);
  return (
    <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <ol>
          {views.map((v: StageView, i) => (
            <li key={v.id}>
              <button data-stage={v.id} data-status={v.status} onClick={() => setPin(v.id)} aria-current={open === v.id ? "step" : undefined}
                className={`flex w-full items-center gap-3 rounded-lg py-0.5 pr-2 text-left transition-colors ${open === v.id ? "text-fg" : "text-mute hover:text-fg"}`}>
                <Marker n={i + 1} status={v.status} />
                <span className="text-sm">{STAGES[i].title}</span>
              </button>
              {i < views.length - 1 && <Link filled={v.status === "COMPLETED"} flowing={views[i + 1].status === "PROCESSING"} failed={views[i + 1].status === "FAILED"} />}
            </li>
          ))}
        </ol>
        {pin && <button onClick={() => setPin(null)} className="mt-3 text-xs text-mute underline hover:text-fg">Follow live</button>}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={open} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          <Detail id={open} s={s} cp={cp} receipt={receipt} hash={hash} confirmed={confirmed} expected={expected} view={views.find((x) => x.id === open)!} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------- one small picture per stage, drawn from that stage's real data ---------- */
const Frame = ({ children }: { children: React.ReactNode }) => <div className="mb-5 flex min-h-[72px] items-center rounded-lg bg-fg/[.035] px-5 py-4">{children}</div>;

function PicoPicture({ watts, alive }: { watts?: number; alive: boolean }) {
  const pps = (watts ?? 0) / 1125; // pulses per second at 3,200 pulses/kWh
  const idle = !alive || pps <= 0;
  return (
    <Frame><div className="w-full"><div className="train" data-idle={idle} style={{ ["--d" as any]: `${28 / Math.max(2, Math.min(pps * 28, 320))}s` }} />
      <div className="mt-2 text-xs text-mute">{idle ? "No pulses" : `${pps.toFixed(pps < 10 ? 1 : 0)} pulses per second`}</div></div></Frame>
  );
}
function EspPicture({ total, valid }: { total?: number; valid?: number }) {
  return (
    <Frame><div><div className="num text-3xl font-semibold">{total !== undefined ? <Odometer value={String(total)} /> : "—"}<span className="ml-2 text-sm font-normal text-mute">pulses counted</span></div>
      <div className="mt-1 text-xs text-mute">{valid !== undefined ? `${valid} in the last window · ${fmtKwh(total ?? 0)} kWh` : "Waiting for a window"}</div></div></Frame>
  );
}
function Choice({ options, value, pending }: { options: string[]; value?: string; pending?: boolean }) {
  return (
    <Frame><div className="flex w-full gap-1">{options.map((o) => (
      <div key={o} className={`relative flex-1 rounded-md py-2 text-center text-sm ${value === o ? "text-bg" : "text-mute"}`}>
        {value === o && <motion.span layoutId={`choice-${options.join()}`} className="absolute inset-0 rounded-md bg-accent" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
        <span className="relative">{o}</span>
      </div>))}</div>{pending && !value && <span className="ml-3 shrink-0 animate-pulse text-xs text-mute">asking…</span>}</Frame>
  );
}
function LeafPicture({ leaf, left, signing }: { leaf?: number; left?: number; signing: boolean }) {
  const used = left !== undefined ? 256 - left : 0;
  return (
    <Frame><div className="flex w-full items-center gap-6">
      <div className="grid shrink-0 grid-cols-[repeat(32,5px)] gap-[3px]" aria-label="256 one-time keys">{Array.from({ length: 256 }, (_, i) => (
        <motion.span key={i} className="h-[5px] w-[5px] rounded-[1px]" initial={false} animate={{ backgroundColor: i === leaf ? "var(--ok)" : i < used ? "var(--fg)" : "var(--line)", scale: i === leaf ? 1.5 : 1 }} transition={{ duration: 0.25 }} />))}</div>
      <div className="text-xs text-mute">{signing ? "Signing…" : leaf !== undefined ? <>Key <b className="text-fg">#{leaf}</b> used<br />{left} left</> : "No key used yet"}</div>
    </div></Frame>
  );
}
function Blocks({ items }: { items: { label: string; state: "ok" | "bad" | "wait" }[] }) {
  return (
    <Frame><div className="grid w-full gap-1.5" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>{items.map((b) => (
      <div key={b.label}><div className="relative h-1.5 overflow-hidden rounded-full bg-line"><motion.span className={`absolute inset-0 origin-left ${b.state === "bad" ? "bg-bad" : "bg-ok"}`} initial={false} animate={{ scaleX: b.state === "wait" ? 0 : 1 }} transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }} /></div>
        <div className={`mt-2 text-xs ${b.state === "wait" ? "text-faint" : b.state === "bad" ? "text-bad" : "text-mute"}`}>{b.label}</div></div>))}</div></Frame>
  );
}
function Ladder({ mode }: { mode?: string }) {
  const rows = ["SAFE_STOP", "INSPECT", "CREDIT_STOP", "RUN"], label: Record<string, string> = { SAFE_STOP: "Safe stop", INSPECT: "Inspect", CREDIT_STOP: "Credit stop", RUN: "Run" };
  return (
    <Frame><div className="w-full"><div className="mb-2 text-xs text-faint">Most cautious wins</div>{rows.map((r) => (
      <div key={r} className={`relative rounded-md px-3 py-1 text-sm ${mode === r ? "text-bg" : "text-mute"}`}>{mode === r && <motion.span layoutId="ladder" className="absolute inset-0 rounded-md bg-accent" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}<span className="relative">{label[r]}</span></div>))}</div></Frame>
  );
}
function LedgerPicture({ device, ledger }: { device?: number; ledger?: number }) {
  const pct = device && ledger !== undefined ? Math.min(100, (ledger / device) * 100) : 0;
  return (
    <Frame><div className="w-full"><div className="flex justify-between text-xs text-mute"><span>On the ledger</span><span>{ledger ?? "—"} of {device ?? "—"} pulses</span></div>
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-line"><motion.span className="absolute inset-0 origin-left bg-ok" initial={false} animate={{ scaleX: pct / 100 }} transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }} /></div></div></Frame>
  );
}

function Detail({ id, s, cp, receipt, hash, confirmed, expected, view }: any) {
  const e = (n: string) => evOf(cp, n);
  const w = e("window"), air = e("ai_response"), aq = e("ai_request"), dec = e("decision"), ss = e("sign_start"), sd = e("sign_done"), sm = e("submitted"), sub = e("submit"), lr = e("ledger_read"), lc = e("local_check");
  const title = STAGES.find((x) => x.id === id)!;
  const f = receipt?.frameReceipts ?? [];
  const picoAlive = !!s.meter && (s.mode === "replay" || s.now - s.pico.lastAt < 8000);
  let pic: any = null, body: any = null;
  if (id === "pico") { pic = <PicoPicture watts={s.meter?.watts} alive={picoAlive} />; body = (<><Row k="Scenario">{s.meter ? `${s.meter.mode} · ${s.meter.watts} W` : "—"}</Row><Row k="Pulses generated">{s.meter?.pulses ?? "—"}</Row><Row k="Last line">{ago(s.pico.lastAt, s.now)}</Row></>); }
  if (id === "esp") { pic = <EspPicture total={w?.total} valid={w?.valid} />; body = w ? (<><Row k="Glitches / stuck">{w.glitches} / {w.stuck}</Row><Row k="Window">{(w.windowMs / 1000).toFixed(1)} s</Row><Row k="Average / peak">{w.avgW} W / {w.peakW} W</Row></>) : null; }
  if (id === "ai") { pic = <Choice options={["RUN", "INSPECT", "NONE"]} value={air?.answer} pending={!!aq} />; body = (<><Row k="Model">qwen3.8-flash on 0G</Row><Row k="Fixed check">{lc ? (lc.result === "pass" ? "passed, AI asked" : `${lc.result}, AI skipped`) : "—"}</Row><Row k="Request"><Mono>{air?.rid || "—"}</Mono></Row><Row k="Latency">{air ? `${air.latencyMs} ms` : "—"}</Row>{air?.answer === "NONE" && <Row k="Outcome">{air.why || "no answer"}, so the device chose Safe stop</Row>}</>); }
  if (id === "policy") { pic = <Ladder mode={dec?.mode} />; body = dec ? (<><Row k="Final state"><ModePill mode={dec.mode} /></Row><Row k="Why">{REASONS[dec.reason] ?? `reason ${dec.reason}`}</Row><Row k="AI alone would pick">{dec.aiWanted}</Row><Row k="Ledger hold">{dec.ledgerHold ? "set" : "none"}</Row></>) : null; }
  if (id === "sign") { pic = <LeafPicture leaf={sd?.leaf} left={sd?.leavesLeft} signing={!!ss && !sd} />; body = (<><Row k="Device key"><Mono>{short(s.deviceKey?.root, 12, 8)}</Mono></Row><Row k="Time">{sd ? `${sd.ms} ms` : "—"}</Row><Row k="Result">{sd ? (sd.resent ? `${sd.result} (resent saved report)` : sd.result) : "—"}</Row></>); }
  if (id === "tx") { pic = <Blocks items={[{ label: "Signed", state: sd?.result === "OK" ? "ok" : "wait" }, { label: "Admitted", state: sm ? (sm.result === "ok" ? "ok" : "bad") : "wait" }, { label: "Mined", state: receipt ? "ok" : "wait" }]} />; body = (<><Row k="Sent via">{sub?.transport ?? "—"}</Row><Row k="Hash"><Mono>{hash ?? "—"}</Mono></Row><Row k="Block">{receipt ? parseInt(receipt.blockNumber, 16) : "—"}</Row></>); }
  if (id === "contracts") { pic = <Blocks items={["Account", "Paymaster", "Ledger", "Settle"].map((label, i) => ({ label, state: f[i] ? (f[i].status === "0x1" ? "ok" : "bad") : "wait" }))} />; body = (<Row k="Sponsored quota left">{s.chain.quota ? `${s.chain.quota.remaining} of ${s.chain.quota.daily}` : "unknown"}</Row>); }
  if (id === "record") {
    const L = s.chain.ledger;
    pic = <LedgerPicture device={w?.total} ledger={L?.lastTotal} />;
    body = L ? (<><Row k="Sequence">{L.lastSeq}{expected !== undefined ? ` (expected ${expected})` : ""}</Row><Row k="Confirmed">{L.lastTotal} pulses · {fmtKwh(L.lastTotal)} kWh</Row><Row k="On-chain">{confirmed ? "confirmed" : "not yet"}</Row>
      <Row k="0G archive">{(() => { const a = archiveOf(s.ens.data?.records["mohar.log"]); return a.archived ? <><Tag k="Archived" /> <Mono>{short(a.root, 10, 6)}</Mono></> : <span className="text-mute">not archived</span>; })()}</Row>{lr?.ok && null}</>) : null;
  }
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between"><div><div className="text-base font-medium">{title.title}</div><div className="text-xs text-faint">{title.sub}</div></div><span className="text-xs text-mute">{view.status.toLowerCase()}</span></div>
      {pic}{body}
    </div>
  );
}
