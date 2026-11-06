import { useStore } from "../store";
import { evOf } from "../lib/events";
import { Card, Empty, ErrorBox, H, ModePill, Page, Stat, Tag, ago, fmtKwh, short, kwh } from "../components/ui";
import { usePipeline } from "../components/Pipeline";
import { Odometer } from "../components/motion";
import { PowerChart } from "../components/PowerChart";

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
  const live = lastW ? lastW.total : s.meter ? s.meter.pulses : undefined;
  const deviceSeen = Math.max(s.esp.lastAt, s.pico.lastAt);
  const stale = deviceSeen > 0 && s.mode === "live" && s.now - deviceSeen > 90000;
  const mode = dec?.mode ?? (L ? MODE[L.lastMode] : undefined);
  return (
    <Page title={s.settings.ensName} aside={<>{s.mode === "replay" && <Tag k="Replay" />}{stale && <Tag k="Stale" title="No line from the device for over 90 s" />}</>}>
      {s.chain.status === "error" && <ErrorBox title="Cannot read the chain">{s.chain.error}. Chain values may be old (last good read {ago(s.chain.lastOkAt ?? 0, s.now)}).</ErrorBox>}
      {s.ids.from === "none" && <Empty>No ledger yet. {s.settings.ensName} has no published records{s.ens.status === "error" ? ` (${s.ens.error})` : ""}.</Empty>}

      <Card className="py-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-sm text-mute">Energy counted</div>
            <div className="num mt-2 text-7xl font-semibold leading-none">{live !== undefined ? <Odometer value={kwh(live).toFixed(3)} /> : "—"}<span className="ml-2 text-xl font-normal text-mute">kWh</span></div>
            <div className="mt-3 text-sm text-mute">{deviceSeen ? `Device heard ${ago(deviceSeen, s.now)}` : "No device connected"}{L ? ` · ${fmtKwh(L.lastTotal)} kWh confirmed on-chain` : ""}</div>
          </div>
          <div className="text-right"><ModePill mode={mode} />{L?.hold && <div className="mt-1 text-xs text-warn">Inspection hold set</div>}</div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-8 px-1">
        <Stat label="Credit" value={L ? creditText(L) : "—"} unit={L ? "pulses" : undefined} note="demo credit" />
        <Stat label="Arrears" value={L ? arrearsText(L) : "—"} unit={L ? "pulses" : undefined} tone={L && L.arrears > 0n ? "text-warn" : ""} />
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
