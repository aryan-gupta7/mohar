import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "../store";
import { evOf } from "../lib/events";
import { Badge, Card, Empty, ErrorBox, H, ModePill, Row, Stat, ago, fmtKwh, short } from "../components/ui";
import { usePipeline } from "../components/Pipeline";

export const useWindows = () => {
  const { evs } = useStore();
  return evs.filter((e) => e.e === "window").map((e) => ({ t: e.at, time: new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), avgW: e.avgW as number, peakW: e.peakW as number, valid: e.valid as number, glitches: e.glitches as number, stuck: e.stuck as number, total: e.total as number, source: e.source }));
};
export const creditText = (L: any) => (L.tariff > 0n ? `${(L.credit / L.tariff).toString()} pulses` : `${L.credit} wei`);
export const arrearsText = (L: any) => (L.tariff > 0n ? `${(L.arrears / L.tariff).toString()} pulses` : `${L.arrears} wei`);

export function Overview() {
  const { s, cp } = usePipeline();
  const W = useWindows(); const lastW = W[W.length - 1];
  const dec = evOf(cp, "decision"), air = evOf(cp, "ai_response");
  const L = s.chain.ledger; const lastRow = s.chain.rows[s.chain.rows.length - 1];
  const live = lastW ? lastW.total : s.meter ? s.meter.pulses : undefined;
  const deviceSeen = Math.max(s.esp.lastAt, s.pico.lastAt);
  const stale = deviceSeen > 0 && s.mode === "live" && s.now - deviceSeen > 90000;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{s.settings.ensName}</h1>
        <Badge k="SEPOLIA" title="Identity records live on Sepolia" /><Badge k="MOHAR DEVNET" title="Meter contracts live on the EF devnet" />
        {s.mode === "replay" && <Badge k="REPLAY" />}
        <span className="text-xs text-mute">{deviceSeen ? `Device last heard ${ago(deviceSeen, s.now)}` : "No device connected"}</span>
        {stale && <Badge k="STALE" title="No line from the device for over 90 s" />}
      </div>
      {s.chain.status === "error" && <ErrorBox title="Cannot read the chain">{s.chain.error}. Values below from the chain may be old (last good read {ago(s.chain.lastOkAt ?? 0, s.now)}).</ErrorBox>}
      {s.ids.from === "none" && <Empty>No ledger known yet. The name <b>{s.settings.ensName}</b> has no published records{s.ens.status === "error" ? ` (${s.ens.error})` : ""}. Add a test ledger address in Settings to explore.</Empty>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Estimated power" value={lastW ? lastW.avgW : s.meter && s.meter.watts} unit="W" badge="ESTIMATED" note={lastW ? `average of the last window · ${ago(lastW.t, s.now)}` : s.meter ? "Pico setting; the ESP has not reported a window yet" : "no data"} />
        <Stat label="Energy counted by the device" value={live !== undefined ? fmtKwh(live) : "—"} unit="kWh" badge="LIVE HARDWARE" note={live !== undefined ? `${live} pulses ÷ 3,200` : undefined} />
        <Stat label="Energy confirmed on-chain" value={L ? fmtKwh(L.lastTotal) : "—"} unit="kWh" badge="ON-CHAIN CONFIRMED" note={L ? `${L.lastTotal} pulses · report #${L.lastSeq}` : undefined} />
        <Card><div className="text-xs text-mute">Meter status</div><div className="mt-3"><ModePill mode={dec?.mode ?? (L ? ["RUN", "INSPECT", "CREDIT_STOP", "SAFE_STOP"][L.lastMode] : undefined)} /></div><div className="mt-2 text-xs text-mute">{dec ? "device's latest decision" : L ? "from the last confirmed report" : ""}{L?.hold ? " · inspection hold set" : ""}</div></Card>
        <Stat label="Credit left" value={L ? creditText(L).split(" ")[0] : "—"} unit={L ? "pulses" : undefined} note="demo credit (devnet ETH), not rupees" />
        <Stat label="Arrears" value={L ? arrearsText(L).split(" ")[0] : "—"} unit={L ? "pulses" : undefined} tone={L && L.arrears > 0n ? "text-sky" : ""} note="usage not yet paid for" />
        <Stat label="Signal health" value={lastW ? (lastW.stuck ? "Stuck line" : lastW.glitches ? `${lastW.glitches} glitch${lastW.glitches > 1 ? "es" : ""}` : "Normal") : "—"} note="last window" badge="DERIVED" />
        <Stat label="Latest AI decision" value={air ? air.answer : "—"} note={air ? `request ${short(air.rid, 8, 4)} · ${air.latencyMs} ms` : "none yet"} badge="AI RESPONSE" />
      </div>
      <Card>
        <H right={<Badge k="DERIVED" />}>Estimated power per measurement window</H>
        {W.length < 2 ? <Empty>Needs at least two windows from the device. Connect the ESP8266 or play a replay.</Empty> : (
          <div className="h-56"><ResponsiveContainer><AreaChart data={W}><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D7FEFA" stopOpacity={0.5} /><stop offset="100%" stopColor="#D7FEFA" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" /><XAxis dataKey="time" stroke="var(--mute)" fontSize={11} /><YAxis stroke="var(--mute)" fontSize={11} unit=" W" width={60} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12 }} /><Area type="monotone" dataKey="avgW" name="Average W" stroke="#D7FEFA" fill="url(#g)" /><Area type="monotone" dataKey="peakW" name="Peak W" stroke="#7fb8b2" fill="none" /></AreaChart></ResponsiveContainer></div>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><H>Live reading vs last confirmed report</H>
          <Row k="Device count (live)">{live !== undefined ? `${live} pulses · ${fmtKwh(live)} kWh` : "—"}</Row>
          <Row k="Ledger count (confirmed)">{L ? `${L.lastTotal} pulses · ${fmtKwh(L.lastTotal)} kWh` : "—"}</Row>
          <Row k="Not yet confirmed">{live !== undefined && L ? `${Math.max(0, live - L.lastTotal)} pulses` : "—"}</Row>
          <Row k="Latest transaction">{usePipelineHash()}</Row>
        </Card>
        <Card><H>Last confirmed report</H>
          {lastRow ? (<><Row k="Sequence">#{lastRow.seq}</Row><Row k="State">{["RUN", "INSPECT", "CREDIT_STOP", "SAFE_STOP"][lastRow.mode]}</Row><Row k="Pulses">{lastRow.total} ({lastRow.usage} new)</Row><Row k="AI request ID">{lastRow.requestId || "none"}</Row><Row k="Block">{lastRow.block}{lastRow.time ? ` · ${new Date(lastRow.time * 1000).toLocaleTimeString()}` : ""}</Row></>) : <Empty>No reports on the ledger yet.</Empty>}
        </Card>
      </div>
    </div>
  );
}
function usePipelineHash() { const { hash, receipt } = usePipeline(); return hash ? `${short(hash, 10, 6)} ${receipt ? "· mined" : "· waiting to be mined"}` : "—"; }
