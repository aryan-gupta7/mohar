import { useState } from "react";
import { Cable, Unplug, Usb } from "lucide-react";
import { useStore } from "../store";
import { Pipeline } from "../components/Pipeline";
import { Button, Card, H, ErrorBox, Mono, Page, Tag, ago, inputCls } from "../components/ui";

export const SCENARIOS = [
  { key: "i", name: "Idle", w: "60 W" },
  { key: "n", name: "Normal", w: "900 W" },
  { key: "h", name: "Heavy", w: "3,000 W" },
  { key: "s", name: "Surge", w: "12,000 W" },
  { key: "g", name: "Glitch", w: "900 W + spikes" },
  { key: "x", name: "Off", w: "0 W" },
  { key: "a", name: "Auto cycle", w: "varies" },
];
export const REPLAYS = [
  { file: "surge-inspect.log", label: "Surge → AI says Inspect" },
  { file: "glitch-local.log", label: "Glitching line → local Inspect" },
  { file: "ai-down-safe-stop.log", label: "AI unreachable → Safe stop" },
  { file: "credit-stop.log", label: "Credit exhausted → Credit stop" },
];

export function Console() {
  const s = useStore();
  const [sel, setSel] = useState("n"), [msg, setMsg] = useState<string>(), [log, setLog] = useState(false);
  const apply = async () => { setMsg(undefined); try { await s.sendPico(sel); setMsg(`Sent to the Pico: ${SCENARIOS.find((x) => x.key === sel)?.name}.`); } catch (e: any) { setMsg(e.message); } };
  return (
    <Page title="Console" aside={s.mode === "replay" ? <Tag k="Replay" title="Recorded lines, not live hardware" /> : <Tag k="Simulated" title="The Pico simulates the meter's pulse output" />}>
      <Card>
        <H right={<span className="text-xs text-mute">{s.pico.connected ? msg ?? "Pico connected" : "Pico not connected"}</span>}>Scenario</H>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((x) => (
            <button key={x.key} onClick={() => setSel(x.key)} aria-pressed={sel === x.key} className={`rounded-full px-4 py-2 text-sm transition-colors ${sel === x.key ? "bg-accent text-bg" : "shadow-[inset_0_0_0_1px_var(--line)] hover:bg-fg/5"}`}>
              {x.name} <span className={`ml-1 text-xs ${sel === x.key ? "opacity-70" : "text-faint"}`}>{x.w}</span>
            </button>
          ))}
        </div>
        <div className="mt-5"><Button onClick={apply} disabled={!s.pico.connected}>Apply scenario</Button></div>
      </Card>

      <Card><H>Pipeline</H><Pipeline /></Card>

      <Card>
        <H>Hardware</H>
        {!s.serial && <div className="mb-4"><ErrorBox title="Web Serial isn't available here">Use desktop Chrome or Edge to control the boards. Replays and every other page still work.</ErrorBox></div>}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={!s.serial || s.pico.connected} onClick={s.connectPico}><Usb size={15} />{s.pico.connected ? "Pico connected" : "Connect Pico"}</Button>
          <Button variant="ghost" disabled={!s.serial || s.esp.connected} onClick={s.connectEsp}><Cable size={15} />{s.esp.connected ? "ESP8266 connected" : "Connect ESP8266"}</Button>
          {(s.pico.connected || s.esp.connected) && <Button variant="ghost" onClick={s.disconnect}><Unplug size={15} />Disconnect</Button>}
        </div>
        {(s.pico.error || s.esp.error) && <div className="mt-3 text-sm text-bad">{s.pico.error ?? s.esp.error}</div>}
        <div className="mt-3 text-xs text-faint">Pico {s.pico.connected ? ago(s.pico.lastAt, s.now) : "off"} · ESP8266 {s.esp.connected ? ago(s.esp.lastAt, s.now) : "off"}. Opening the ESP's port resets it.</div>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <select aria-label="Replay" onChange={(e) => e.target.value && s.startReplay(`replay/${e.target.value}`, 6)} defaultValue="" className={`${inputCls} max-w-xs`}>
            <option value="">Play a recorded run…</option>{REPLAYS.map((r) => <option key={r.file} value={r.file}>{r.label}</option>)}
          </select>
          {s.mode === "replay" && <button onClick={s.stopReplay} className="text-sm text-warn underline">Stop ({s.replayName})</button>}
        </div>
      </Card>

      <div>
        <button onClick={() => setLog(!log)} className="text-sm text-mute hover:text-fg">{log ? "Hide" : "Show"} device log · {s.evs.length}</button>
        {log && <div className="surface mt-3 max-h-72 space-y-0.5 overflow-auto p-4">{s.evs.slice(-80).reverse().map((e, i) => <div key={i}><Mono>cp{e.cp} {e.e} {JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !["cp", "e", "ms", "at", "source"].includes(k))))}</Mono></div>)}</div>}
      </div>
    </Page>
  );
}
