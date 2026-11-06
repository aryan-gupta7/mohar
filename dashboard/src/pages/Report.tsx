import { useStore } from "../store";
import { evOf, REASONS } from "../lib/events";
import { usePipeline } from "../components/Pipeline";
import { Badge, Card, Empty, H, ModePill, Mono, Row, fmtKwh, short } from "../components/ui";
import { creditText, arrearsText } from "./Overview";

export function Report() {
  const { s, cp, receipt, hash, confirmed, expected } = usePipeline();
  const L = s.chain.ledger; const e = (n: string) => evOf(cp, n);
  const w = e("window"), dec = e("decision"), air = e("ai_response"), sd = e("sign_done"), sm = e("submitted");
  if (!cp) return <Empty>No checkpoint yet. Run a scenario on the Demo Console, then come back to see the verified result.</Empty>;
  const stage = !sm ? "Preparing" : sm.result !== "ok" ? "Rejected" : !receipt ? "Submitted — waiting to be mined" : confirmed ? "Confirmed on-chain" : "Mined — waiting for the ledger to show it";
  const frames = receipt?.frameReceipts ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">Verified report</h1>{confirmed ? <Badge k="ON-CHAIN CONFIRMED" /> : <Badge k="MEMPOOL ACCEPTED" />}{cp.source === "replay" && <Badge k="REPLAY" />}</div>
      <Card className={confirmed ? "border-lime/50" : ""}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-xs text-mute">Status</div><div className="text-xl font-semibold">{stage}</div></div>
          <ModePill mode={dec?.mode} />
        </div>
        <div className="mt-4 grid sm:grid-cols-2 gap-x-8">
          <div>
            <Row k="Report sequence">#{expected ?? "—"}</Row>
            <Row k="Pulses reported by the device">{w ? `${w.total} · ${fmtKwh(w.total)} kWh` : "—"} <Badge k="LIVE HARDWARE" /></Row>
            <Row k="Pulses on the ledger">{L ? `${L.lastTotal} · ${fmtKwh(L.lastTotal)} kWh` : "—"} <Badge k="ON-CHAIN CONFIRMED" /></Row>
            <Row k="Average / peak power">{w ? `${w.avgW} W / ${w.peakW} W` : "—"} <Badge k="DERIVED" /></Row>
            <Row k="Credit / arrears (demo credit)">{L ? `${creditText(L)} / ${arrearsText(L)}` : "—"}</Row>
            <Row k="Inspection hold">{L ? (L.hold ? "set" : "none") : "—"}</Row>
          </div>
          <div>
            <Row k="Final state">{dec ? `${dec.mode}` : "—"}</Row>
            <Row k="Why">{dec ? REASONS[dec.reason] : "—"}</Row>
            <Row k="AI">{air ? `${air.answer} · ${air.latencyMs} ms` : "not asked"} {air?.answer && air.answer !== "NONE" && <Badge k="AI RESPONSE" />}</Row>
            <Row k="AI request ID"><Mono>{air?.rid || "—"}</Mono></Row>
            <Row k="Signed with">{sd?.result === "OK" ? `one-time key #${sd.leaf} (${sd.leavesLeft} left)` : sd ? sd.result : "—"} {sd?.result === "OK" && <Badge k="SIGNED" />}</Row>
            <Row k="Transaction"><Mono>{hash ?? "—"}</Mono></Row>
          </div>
        </div>
        {frames.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs">{["Account verifies signature", "Paymaster approves", "Ledger records report", "Paymaster settles"].map((l, i) => <span key={l} className={`rounded-full border px-3 py-1 ${frames[i]?.status === "0x1" ? "border-lime/50 text-lime" : "border-bad/50 text-bad"}`}>{l}: {frames[i]?.status === "0x1" ? "ok" : "failed"}</span>)}</div>}
        <p className="mt-3 text-xs text-mute">This report is device-authorised: the ESP8266 signed it with its own one-time key, and the chain accepted it only because the signature verified. “Confirmed” means a receipt exists and the ledger’s sequence number has reached it; “submitted” alone proves nothing. {short(hash)}</p>
      </Card>
      <Card><H>What this report is made of</H><div className="text-xs text-mute">Pulse window → fixed checks → AI → state → signature → alt mempool → four contract steps → ledger. Open the Demo Console for each stage’s detail, or Activity for the full history.</div></Card>
    </div>
  );
}
