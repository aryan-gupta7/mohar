import { useState } from "react";
import { Cable, Play, Unplug, Usb, FileText } from "lucide-react";
import { useStore } from "../store";
import { Pipeline } from "../components/Pipeline";
import { Badge, Card, H, ErrorBox, Mono, ago } from "../components/ui";

export const SCENARIOS = [
  { key: "i", name: "Idle", w: "60 W", note: "Standby load" },
  { key: "n", name: "Normal household", w: "900 W", note: "Typical consumption" },
  { key: "h", name: "Heavy consumption", w: "3,000 W", note: "A high-load appliance" },
  { key: "s", name: "Surge", w: "12,000 W", note: "Abnormal demand spike" },
  { key: "g", name: "Signal glitch", w: "900 W + spikes", note: "Injects invalid short pulses" },
  { key: "x", name: "Meter off", w: "0 W", note: "No pulses generated" },
  { key: "a", name: "Automatic cycle", w: "varies", note: "Cycles through the scenarios" },
];
export const REPLAYS = [
  { file: "surge-inspect.log", label: "Surge → AI says INSPECT → confirmed" },
  { file: "glitch-local.log", label: "Glitching line → local check → INSPECT" },
  { file: "ai-down-safe-stop.log", label: "AI unreachable → SAFE_STOP" },
  { file: "credit-stop.log", label: "Credit exhausted → CREDIT_STOP" },
];

export function Console() {
  const s = useStore();
  const [sel, setSel] = useState("n"), [msg, setMsg] = useState<string>(), [log, setLog] = useState(false);
  const apply = async () => { setMsg(undefined); try { await s.sendPico(sel); setMsg(`Sent “${sel}” to the Pico. It now generates ${SCENARIOS.find((x) => x.key === sel)?.w} pulses.`); } catch (e: any) { setMsg(e.message); } };
  const demoAvail = s.serial;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <H right={<Badge k="SIMULATED INPUT" />}>Meter input simulator · Pico H</H>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SCENARIOS.map((x) => (
              <button key={x.key} onClick={() => setSel(x.key)} className={`rounded-2xl border p-3 text-left transition ${sel === x.key ? "border-lime bg-lime/10" : "border-line hover:border-mute"}`}>
                <div className="text-sm font-semibold leading-tight">{x.name}</div><div className="metric text-lg">{x.w}</div><div className="text-[11px] text-mute">{x.note}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={apply} disabled={!s.pico.connected} className="inline-flex items-center gap-2 rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-black disabled:opacity-40"><Play size={16} />Apply meter scenario</button>
            <span className="text-xs text-mute">{s.pico.connected ? msg ?? "Pico connected." : "Connect the Pico to apply a scenario."}</span>
          </div>
          <p className="mt-3 text-xs text-mute">This sends one character to the Pico over USB. The Pico then makes real electrical pulses on its output pin, and the ESP8266 counts them. The browser never sends a reading.</p>
        </Card>
        <Card>
          <H>Connections</H>
          {!demoAvail && <ErrorBox title="Web Serial is not available in this browser">Use desktop Chrome or Edge to control the hardware. You can still watch a recorded REPLAY below, and every other page works here.</ErrorBox>}
          <div className="mt-2 space-y-2">
            <button disabled={!demoAvail || s.pico.connected} onClick={s.connectPico} className="w-full flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-50"><Usb size={16} />{s.pico.connected ? "Pico connected" : "Connect Pico (simulator)"}</button>
            <button disabled={!demoAvail || s.esp.connected} onClick={s.connectEsp} className="w-full flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-50"><Cable size={16} />{s.esp.connected ? "ESP8266 connected" : "Connect ESP8266 (device)"}</button>
            {(s.pico.connected || s.esp.connected) && <button onClick={s.disconnect} className="w-full flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm"><Unplug size={16} />Disconnect</button>}
          </div>
          {(s.pico.error || s.esp.error) && <div className="mt-2 text-xs text-bad">{s.pico.error ?? s.esp.error}</div>}
          <div className="mt-3 text-xs text-mute space-y-1">
            <div>Pico: {s.pico.connected ? `last line ${ago(s.pico.lastAt, s.now)}` : "not connected"}</div>
            <div>ESP8266: {s.esp.connected ? `last line ${ago(s.esp.lastAt, s.now)}` : "not connected"}</div>
            <div>Opening the ESP’s port resets it; the first checkpoint follows about 10 s later.</div>
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-center gap-2 mb-2"><Badge k="REPLAY" /><span className="text-xs text-mute">Recorded hardware lines, not live</span></div>
            <select aria-label="Replay" onChange={(e) => e.target.value && s.startReplay(`replay/${e.target.value}`, 6)} defaultValue="" className="w-full rounded-xl border border-line bg-mid px-3 py-2 text-sm">
              <option value="">Play a recorded run…</option>{REPLAYS.map((r) => <option key={r.file} value={r.file}>{r.label}</option>)}
            </select>
            {s.mode === "replay" && <button onClick={s.stopReplay} className="mt-2 text-xs underline text-warn">Stop replay ({s.replayName})</button>}
          </div>
        </Card>
      </div>
      {s.mode === "replay" && <div className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-2 text-sm text-warn">REPLAY — these are recorded lines played back, not live hardware. Chain values come from the recording.</div>}
      <Card><H>Live pipeline · every stage moves only when its real event arrives</H><Pipeline /></Card>
      <Card>
        <H right={<button onClick={() => setLog(!log)} className="text-xs underline text-mute inline-flex items-center gap-1"><FileText size={12} />{log ? "Hide" : "Show"} device log</button>}>Device events</H>
        <div className="text-xs text-mute">{s.evs.length} events received. {s.evs.length === 0 && "Nothing yet: connect the ESP8266 or play a replay."}</div>
        {log && <div className="mt-2 max-h-72 overflow-auto rounded-xl bg-mid p-3 space-y-0.5">{s.evs.slice(-80).reverse().map((e, i) => <div key={i}><Mono>cp{e.cp} {e.e} {JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !["cp", "e", "ms", "at", "source"].includes(k))))}</Mono></div>)}</div>}
      </Card>
    </div>
  );
}
