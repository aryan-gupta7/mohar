import { archiveOf } from "../lib/ens";
import { useState } from "react";
import { STAGES, REASONS, stageStatuses, evOf, type StageId, type StageView } from "../lib/events";
import { useStore } from "../store";
import { Mono, Row, short, ago, fmtKwh, ModePill, StatusDot, Tag } from "./ui";

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

export function Pipeline() {
  const { s, cp, views, receipt, hash, confirmed, expected } = usePipeline();
  const [open, setOpen] = useState<StageId>("pico");
  return (
    <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
      <ol className="relative space-y-0.5">
        {views.map((v: StageView, i) => (
          <li key={v.id}>
            <button data-stage={v.id} data-status={v.status} onClick={() => setOpen(v.id)} aria-expanded={open === v.id}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${open === v.id ? "bg-fg/[.06]" : "hover:bg-fg/[.03]"}`}>
              <StatusDot s={v.status} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{STAGES[i].title}</span><span className="block truncate text-xs text-faint">{v.detail}</span></span>
            </button>
          </li>
        ))}
      </ol>
      <Detail id={open} s={s} cp={cp} receipt={receipt} hash={hash} confirmed={confirmed} expected={expected} view={views.find((x) => x.id === open)!} />
    </div>
  );
}

const Empty1 = ({ children }: { children: string }) => <p className="py-6 text-sm text-mute">{children}</p>;

function Detail({ id, s, cp, receipt, hash, confirmed, expected, view }: any) {
  const e = (n: string) => evOf(cp, n);
  const w = e("window"), air = e("ai_response"), aq = e("ai_request"), dec = e("decision"), sd = e("sign_done"), sm = e("submitted"), sub = e("submit"), lr = e("ledger_read"), lc = e("local_check");
  const title = STAGES.find((x) => x.id === id)!;
  let body: any = null;
  if (id === "pico") body = (<>
    <Row k="Scenario">{s.meter ? `${s.meter.mode} · ${s.meter.watts} W` : "—"}</Row>
    <Row k="Pulses generated">{s.meter?.pulses ?? "—"}</Row>
    <Row k="Last line">{ago(s.pico.lastAt, s.now)}</Row>
  </>);
  if (id === "esp") body = w ? (<>
    <Row k="Valid pulses">{w.valid}</Row><Row k="Glitches / stuck">{w.glitches} / {w.stuck}</Row>
    <Row k="Window">{(w.windowMs / 1000).toFixed(1)} s</Row><Row k="Average / peak">{w.avgW} W / {w.peakW} W</Row>
    <Row k="Total">{w.total} pulses · {fmtKwh(w.total)} kWh</Row>
  </>) : <Empty1>No window yet. One arrives every 20–60 s.</Empty1>;
  if (id === "ai") body = (<>
    <Row k="Model">qwen3.8-flash on 0G</Row>
    <Row k="Fixed check">{lc ? (lc.result === "pass" ? "passed, AI asked" : `${lc.result}, AI skipped`) : "—"}</Row>
    <Row k="Answer">{air ? air.answer : aq ? "waiting…" : "—"}</Row>
    <Row k="Request"><Mono>{air?.rid || "—"}</Mono></Row><Row k="Latency">{air ? `${air.latencyMs} ms` : "—"}</Row>
    {air?.answer === "NONE" && <Row k="Outcome">{air.why || "no answer"}, so the device chose Safe stop</Row>}
  </>);
  if (id === "policy") body = dec ? (<>
    <Row k="Final state"><ModePill mode={dec.mode} /></Row><Row k="Why">{REASONS[dec.reason] ?? `reason ${dec.reason}`}</Row>
    <Row k="AI alone would pick">{dec.aiWanted}</Row><Row k="Ledger hold">{dec.ledgerHold ? "set" : "none"}</Row>
  </>) : <Empty1>Waiting for the checks.</Empty1>;
  if (id === "sign") body = (<>
    <Row k="Device key"><Mono>{short(s.deviceKey?.root, 12, 8)}</Mono></Row>
    <Row k="One-time key">{sd ? `#${sd.leaf} · ${sd.leavesLeft} left of 256` : "—"}</Row>
    <Row k="Time">{sd ? `${sd.ms} ms` : "—"}</Row><Row k="Result">{sd ? (sd.resent ? `${sd.result} (resent saved report)` : sd.result) : "—"}</Row>
  </>);
  if (id === "tx") body = (<>
    <Row k="Sent via">{sub?.transport ?? "—"}</Row>
    <Row k="Node">{sm ? (sm.result === "ok" ? "Admitted by the alt mempool" : sm.result) : "—"}</Row>
    <Row k="Hash"><Mono>{hash ?? "—"}</Mono></Row>
    <Row k="Mined">{receipt ? `block ${parseInt(receipt.blockNumber, 16)}` : hash ? "not yet" : "—"}</Row>
  </>);
  if (id === "contracts") {
    const f = receipt?.frameReceipts ?? [];
    body = (<>
      {["Account checks the signature", "Paymaster approves", "Ledger records the report", "Paymaster settles"].map((l, i) => <Row key={i} k={l}>{f[i] ? (f[i].status === "0x1" ? "ok" : <span className="text-bad">failed</span>) : "—"}</Row>)}
      <Row k="Sponsored quota left">{s.chain.quota ? `${s.chain.quota.remaining} of ${s.chain.quota.daily}` : "unknown"}</Row>
    </>);
  }
  if (id === "record") {
    const L = s.chain.ledger;
    body = L ? (<>
      <Row k="Expected / ledger sequence">{expected ?? "—"} / {L.lastSeq}</Row>
      <Row k="Confirmed">{L.lastTotal} pulses · {fmtKwh(L.lastTotal)} kWh</Row>
      <Row k="Hold">{L.hold ? "set" : "none"}</Row><Row k="On-chain">{confirmed ? "confirmed" : "not yet"}</Row>
      <Row k="0G archive">{(() => { const a = archiveOf(s.ens.data?.records["mohar.log"]); return a.archived ? <><Tag k="Archived" /> <Mono>{short(a.root, 10, 6)}</Mono></> : <span className="text-mute">not archived</span>; })()}</Row>
      {lr?.ok && w && <Row k="Device vs ledger">{w.total} vs {L.lastTotal}</Row>}
    </>) : <Empty1>No ledger to read. Set the name in Settings.</Empty1>;
  }
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between"><div><div className="text-base font-medium">{title.title}</div><div className="text-xs text-faint">{title.sub}</div></div><span className="text-xs text-mute">{view.status.toLowerCase()}</span></div>
      {body}
    </div>
  );
}
