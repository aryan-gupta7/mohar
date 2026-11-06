import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "../store";
import { Badge, Card, Empty, H, Row, Stat, ago, fmtKwh } from "../components/ui";
import { useWindows } from "./Overview";

export function Meter() {
  const s = useStore(); const W = useWindows(); const last = W[W.length - 1];
  const gaps = last ? (last.valid > 0 ? (60000 / last.valid) : 0) : 0;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Live meter</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Cumulative pulses" value={last?.total ?? s.meter?.pulses ?? "—"} badge="LIVE HARDWARE" note="counted by the ESP8266 on D6" />
        <Stat label="Pulses in last window" value={last?.valid ?? "—"} note={last ? ago(last.t, s.now) : undefined} />
        <Stat label="Estimated power" value={last?.avgW ?? "—"} unit="W" badge="ESTIMATED" note="from pulse timing, not a current sensor" />
        <Stat label="Peak power" value={last?.peakW ?? "—"} unit="W" badge="DERIVED" />
        <Stat label="Energy" value={last ? fmtKwh(last.total) : "—"} unit="kWh" badge="DERIVED" note="pulses ÷ 3,200" />
        <Stat label="Meter constant" value="3,200" unit="pulses/kWh" note="1 pulse = 0.3125 Wh" />
        <Stat label="Input status" value={s.meter ? (s.mode === "replay" || s.now - s.pico.lastAt < 8000 ? "Pulses arriving" : "Quiet") : "Not connected"} note={s.meter ? `Pico: ${s.meter.mode}, ${s.meter.watts} W` : undefined} badge="SIMULATED INPUT" />
        <Stat label="Mean pulse spacing" value={gaps ? (gaps / 1000).toFixed(2) : "—"} unit="s" badge="DERIVED" />
      </div>
      <Card>
        <H right={<Badge k="DERIVED" />}>Valid pulses per window</H>
        {W.length < 2 ? <Empty>No windows yet.</Empty> : <div className="h-52"><ResponsiveContainer><BarChart data={W}><CartesianGrid stroke="var(--line)" strokeDasharray="3 3" /><XAxis dataKey="time" stroke="var(--mute)" fontSize={11} /><YAxis stroke="var(--mute)" fontSize={11} width={40} /><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12 }} /><Bar dataKey="valid" name="Valid pulses" fill="#D7FEFA" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>}
      </Card>
      <Card>
        <H right={<Badge k="LIVE HARDWARE" />}>Signal integrity</H>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div><div className="text-xs text-mute">Valid (15–200 ms)</div><div className="metric text-2xl">{last?.valid ?? "—"}</div></div>
          <div><div className="text-xs text-mute">Rejected glitches (under 15 ms)</div><div className="metric text-2xl">{last?.glitches ?? "—"}</div></div>
          <div><div className="text-xs text-mute">Stuck-low events (over 200 ms)</div><div className="metric text-2xl">{last?.stuck ?? "—"}</div></div>
        </div>
        <p className="mt-3 text-xs text-mute">Pulses are classified by how long the line stays low. Glitches and stuck lines are never counted as energy. Three or more glitches in a window, or any stuck line, makes the device choose INSPECT without asking the AI.</p>
        {W.length > 1 && <div className="mt-3 h-40"><ResponsiveContainer><LineChart data={W}><CartesianGrid stroke="var(--line)" strokeDasharray="3 3" /><XAxis dataKey="time" stroke="var(--mute)" fontSize={11} /><YAxis stroke="var(--mute)" fontSize={11} width={30} allowDecimals={false} /><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12 }} /><Line dataKey="glitches" name="Glitches" stroke="#9BD7E8" dot={false} /><Line dataKey="stuck" name="Stuck-low" stroke="#ff7a7a" dot={false} /></LineChart></ResponsiveContainer></div>}
      </Card>
      <Card>
        <H>Sensor explorer</H>
        <Row k="Meter pulse input · Pico → ESP8266">Connected when pulses arrive <Badge k="SIMULATED INPUT" /></Row>
        <Row k="Signal integrity · pulse-width analysis">Monitoring <Badge k="LIVE HARDWARE" /></Row>
        <Row k="Power estimation">Calculated <Badge k="DERIVED" /></Row>
        <Row k="Energy accumulator">Available <Badge k="DERIVED" /></Row>
        {["Voltage sensor", "Current sensor", "Temperature / vibration", "Appliance-level monitoring"].map((x) => <Row key={x} k={x}><span className="text-mute">Not installed</span></Row>)}
        <p className="mt-2 text-xs text-mute">This build has one simulated meter pulse source. Nothing else is measured, so nothing else is charted.</p>
      </Card>
    </div>
  );
}
