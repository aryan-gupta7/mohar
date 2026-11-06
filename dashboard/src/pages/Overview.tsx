import { useStore } from "../store";
import { evOf } from "../lib/events";
import { Card, Empty, ErrorBox, H, ModePill, Page, Stat, Tag, ago, fmtKwh, short, kwh } from "../components/ui";
import { usePipeline } from "../components/Pipeline";
import { Odometer } from "../components/motion";
import { PowerChart } from "../components/PowerChart";
import { Meter3D } from "../landing/Meter3D";

export const useWindows = () => {
  const { evs } = useStore();
  return evs.filter((e) => e.e === "window").map((e) => ({ t: e.at, time: new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), avgW: e.avgW as number, peakW: e.peakW as number, valid: e.valid as number, glitches: e.glitches as number, stuck: e.stuck as number, total: e.total as number }));
};
export const creditText = (L: any) => (L.tariff > 0n ? `${(L.credit / L.tariff).toString()}` : `${L.credit}`);
export const arrearsText = (L: any) => (L.tariff > 0n ? `${(L.arrears / L.tariff).toString()}` : `${L.arrears}`);
export const MODE = ["RUN", "INSPECT", "CREDIT_STOP", "SAFE_STOP"];

export function Overview() {
  const { s, cp, hash, receipt } = usePipeline();
  const W = useWindows(); const lastW = W[W.length - 1];
  const dec = evOf(cp, "decision");
  const L = s.chain.ledger; const lastRow = s.chain.rows[s.chain.rows.length - 1];
  const live = lastW ? lastW.total : s.meter ? s.meter.pulses : L?.lastTotal;
  const deviceSeen = Math.max(s.esp.lastAt, s.pico.lastAt);
  const stale = deviceSeen > 0 && s.mode === "live" && s.now - deviceSeen > 90000;
  const mode = dec?.mode ?? (L ? MODE[L.lastMode] : undefined);
  return (
    <Page title={s.settings.ensName} aside={<>{s.mode === "replay" && <Tag k="Replay" />}{stale && <Tag k="Stale" title="No line from the device for over 90 s" />}</>}>
      {s.chain.status === "error" && <ErrorBox title="Cannot read the chain">{s.chain.error}. Chain values may be old (last good read {ago(s.chain.lastOkAt ?? 0, s.now)}).</ErrorBox>}
      {s.ids.from === "none" && <Card><div className="text-sm font-medium">No meter connected</div><p className="mt-1 text-sm text-mute">Add the ledger address, or paste a setup link, to read this meter from the chain.</p><a href="#settings" className="mt-4 inline-flex bg-accent px-4 py-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-white">Connect a meter</a></Card>}

      <div className="surface grid md:grid-cols-[1fr_260px]">
        <div className="p-6 md:p-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute">Energy counted</div>
          <div className="num mt-3 text-6xl font-semibold leading-none md:text-7xl">{live !== undefined ? <Odometer value={kwh(live).toFixed(3)} /> : "—"}<span className="ml-2 text-xl font-normal text-mute">kWh</span></div>
          <div className="mt-4 text-sm text-mute">{deviceSeen ? `Device heard ${ago(deviceSeen, s.now)}` : L ? `From the chain · report #${L.lastSeq}${lastRow?.time ? ` · ${ago(lastRow.time * 1000, s.now)}` : ""}` : "Not connected"}{deviceSeen && L ? ` · ${fmtKwh(L.lastTotal)} kWh confirmed on-chain` : ""}</div>
          <div className="mt-6 flex items-center gap-4"><ModePill mode={mode} />{L?.hold && <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-warn">Inspection hold set</span>}</div>
        </div>
        <div className="relative h-56 border-t border-line md:h-auto md:border-l md:border-t-0"><Meter3D compact kwh={live !== undefined ? kwh(live) : 0} watts={lastW ? lastW.avgW : s.meter?.watts} /></div>
      </div>

      <div className="grid grid-cols-2 border-l border-t border-line">
        <div className="border-b border-r border-line p-5"><Stat label="Credit" value={L ? creditText(L) : "—"} unit={L ? "pulses" : undefined} note="demo credit" /></div>
        <div className="border-b border-r border-line p-5"><Stat label="Arrears" value={L ? arrearsText(L) : "—"} unit={L ? "pulses" : undefined} tone={L && L.arrears > 0n ? "text-warn" : ""} /></div>
      </div>

      <Card><PowerChart measured={W.map((w) => ({ at: w.t, w: w.avgW }))} /></Card>

      <Card>
        <H right={<a href="#activity" className="text-sm text-mute hover:text-fg">All activity →</a>}>Last report</H>
        {lastRow ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm"><b className="num text-base">#{lastRow.seq}</b><ModePill mode={MODE[lastRow.mode]} /><span className="text-mute">{lastRow.total} pulses</span><span className="ml-auto text-mute">{lastRow.time ? new Date(lastRow.time * 1000).toLocaleTimeString() : `block ${lastRow.block}`}</span></div>
        ) : <Empty>No reports on the ledger yet.</Empty>}
        {hash && <div className="mt-3 text-xs text-faint">Latest transaction {short(hash, 10, 6)} · {receipt ? "mined" : "waiting to be mined"}</div>}
      </Card>
    </Page>
  );
}
