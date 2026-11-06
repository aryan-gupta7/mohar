import { useState } from "react";
import { Cable, Unplug, Usb } from "lucide-react";
import { useStore } from "../store";
import { Segmented } from "../components/motion";
import { Pipeline } from "../components/Pipeline";
import { motion } from "motion/react";
import { Button, Card, H, ErrorBox, Mono, Page, StatusDot, Tag, ago } from "../components/ui";

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

const VIEWS = [{ value: "live", label: "Live" }, { value: "replay", label: "Replay" }];

/** Selectable rows with one sliding ring, after UIarc "Radio cards". */
function ReplayList({ value, onPick }: { value?: string; onPick: (file: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Recorded runs" className="grid gap-2 sm:grid-cols-2">
      {REPLAYS.map((r) => (
        <button key={r.file} role="radio" aria-checked={value === r.file} onClick={() => onPick(r.file)} className="relative rounded-lg px-4 py-3 text-left text-sm shadow-[inset_0_0_0_1px_var(--line)] hover:bg-fg/[.03]">
          {value === r.file && <motion.span layoutId="replay-ring" className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_0_1.5px_var(--fg)]" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function Console() {
  const s = useStore();
  const [view, setView] = useState<"live" | "replay">(s.mode === "replay" ? "replay" : "live");
  const [sel, setSel] = useState("n"), [msg, setMsg] = useState<string>(), [log, setLog] = useState(false);
  const apply = async () => { setMsg(undefined); try { await s.sendPico(sel); setMsg(`Sent to the Pico: ${SCENARIOS.find((x) => x.key === sel)?.name}.`); } catch (e: any) { setMsg(e.message); } };
  const pick = (v: string) => { const next = v as "live" | "replay"; if (next === "live" && s.mode === "replay") s.stopReplay(); setView(next); };
  const lastRow = s.chain.rows[s.chain.rows.length - 1];
  const espAge = s.esp.lastAt ? s.now - s.esp.lastAt : Infinity;
  const reporting = s.mode === "live" && espAge < 90000;
  const status = reporting ? `Live reporting · device heard ${ago(s.esp.lastAt, s.now)}` : lastRow?.time ? `Last on-chain report ${ago(lastRow.time * 1000, s.now)}` : "Waiting for the device";
  const replayFile = s.replayName;
  return (
    <Page title="Console" aside={<Segmented id="console-view" options={VIEWS} value={view} onChange={pick} />}>
      {view === "live" ? (<>
        <div className="flex items-center gap-2 px-1 text-sm text-mute"><StatusDot s={reporting ? "PROCESSING" : "WAITING"} /><span>{status}</span></div>
        <Card>
          <H right={<span className="text-xs text-mute">{s.pico.connected ? msg ?? "Pico connected" : "Pico not connected"}</span>}>Meter scenario</H>
          <Segmented id="scenario" value={sel} onChange={setSel} options={SCENARIOS.map((x) => ({ value: x.key, label: x.name, hint: x.w }))} />
          <div className="mt-5"><Button onClick={apply} disabled={!s.pico.connected}>Apply scenario</Button></div>
        </Card>
        <Card><H>Pipeline</H><Pipeline /></Card>
        <Card>
          <H>Hardware</H>
          {!s.serial && <div className="mb-4"><ErrorBox title="Web Serial isn't available here">Use desktop Chrome or Edge to attach the boards over USB.</ErrorBox></div>}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={!s.serial || s.pico.connected} onClick={s.connectPico}><Usb size={15} />{s.pico.connected ? "Pico connected" : "Connect Pico"}</Button>
            <Button variant="ghost" disabled={!s.serial || s.esp.connected} onClick={s.connectEsp}><Cable size={15} />{s.esp.connected ? "ESP8266 connected" : "Connect ESP8266"}</Button>
            {(s.pico.connected || s.esp.connected) && <Button variant="ghost" onClick={s.disconnect}><Unplug size={15} />Disconnect</Button>}
          </div>
          {(s.pico.error || s.esp.error) && <div className="mt-3 text-sm text-bad">{s.pico.error ?? s.esp.error}</div>}
          <div className="mt-3 text-xs text-faint">Pico {s.pico.connected ? ago(s.pico.lastAt, s.now) : "off"} · ESP8266 {s.esp.connected ? ago(s.esp.lastAt, s.now) : "off"}. Opening the ESP's port resets it.</div>
        </Card>
      </>) : (<>
        <Card>
          <H right={<Tag k="Replay" />}>Recorded runs</H>
          <p className="mb-4 text-sm text-mute">Saved logs played back to show the pipeline. They are not from your boards or contracts.</p>
          <ReplayList value={s.mode === "replay" ? `${replayFile}` : undefined} onPick={(f) => s.startReplay(`replay/${f}`, 6)} />
          {s.mode === "replay" && <div className="mt-4"><Button variant="ghost" onClick={s.stopReplay}>Stop replay</Button></div>}
        </Card>
        <Card><H right={s.mode === "replay" ? <Tag k="Replay" /> : undefined}>Pipeline</H><Pipeline /></Card>
      </>)}

      <div>
        <button onClick={() => setLog(!log)} className="text-sm text-mute hover:text-fg">{log ? "Hide" : "Show"} device log · {s.evs.length}</button>
        {log && <div className="surface mt-3 max-h-72 space-y-0.5 overflow-auto p-4">{s.evs.slice(-80).reverse().map((e, i) => <div key={i}><Mono>cp{e.cp} {e.e} {JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !["cp", "e", "ms", "at", "source"].includes(k))))}</Mono></div>)}</div>}
      </div>
    </Page>
  );
}
