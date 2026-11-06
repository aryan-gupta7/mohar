import { Stage, Title, Mono, seg, ease, clamp } from "./kit";

const STEPS = [
  { n: "Pulse", t: "The demo's input. A Pico H plays a meter's impulse output: one 30 ms pulse per 0.3125 Wh. Any other sensor takes this place." },
  { n: "Count", t: "The ESP8266, the device, counts them and closes a window: valid pulses, glitches, average and peak." },
  { n: "Check", t: "Fixed rules run on the device itself. Beyond the meter's range, or three glitches in a window, means Inspect at once, no network needed." },
  { n: "Ask 0G", t: "qwen3.8-flash answers RUN or INSPECT. Any other reply is no decision." },
  { n: "Decide", t: "The most cautious of the device's checks, the AI and the ledger wins. The AI can add caution, never remove it." },
  { n: "Sign", t: "A one-time key out of 256 under a Merkle root signs the report, after the intent is saved to flash." },
  { n: "Submit", t: "Wi-Fi, TLS and a public RPC, with no relayer. The alt mempool admits it, four frames run, and the device pays no gas." },
  { n: "Record", t: "MachineLedger stores the reading, and for the demo meter charges credit, keeps arrears and sets the hold." },
];

function Specimen({ i, q }: { i: number; q: number }) {
  const W = 360, H = 120;
  const line = "var(--fg)";
  if (i === 0) return (
    <svg width={W} height={H}><line x1="0" x2={W} y1="90" y2="90" stroke="var(--line)" />{Array.from({ length: 9 }, (_, k) => { const x = ((k * 44 - q * 130) % 396 + 396) % 396 - 30; return <rect key={k} x={x} y="52" width="10" height="38" fill={line} />; })}</svg>
  );
  if (i === 1) return (
    <svg width={W} height={H}><text x="0" y="80" fontFamily="JetBrains Mono Variable, monospace" fontSize="64" fontWeight="700" fill={line}>{String(Math.round(1200 + q * 214)).padStart(5, "0")}</text><text x="250" y="80" fontFamily="JetBrains Mono Variable, monospace" fontSize="16" fill="var(--mute)">pulses</text><line x1="0" x2={W * q} y1="104" y2="104" stroke="var(--accent)" strokeWidth="3" /></svg>
  );
  if (i === 2) return (
    <svg width={W} height={H} fontFamily="JetBrains Mono Variable, monospace" fontSize="13">{[["peak > 13,800 W", 0.35], ["glitches >= 3", 0.7]].map(([l, at], k) => { const hit = q > (at as number); return <g key={k} transform={`translate(0 ${20 + k * 50})`}><rect width="200" height="36" fill="none" stroke={line} /><text x="12" y="23" fill={line}>{l}</text><line x1="200" x2="270" y1="18" y2="18" stroke="var(--faint)" /><rect x="270" width="90" height="36" fill={hit ? "var(--accent)" : "none"} stroke={hit ? "var(--accent)" : line} /><text x="282" y="23" fill={hit ? "#fff" : line}>INSPECT</text></g>; })}</svg>
  );
  if (i === 3) return (
    <svg width={W} height={H} fontFamily="JetBrains Mono Variable, monospace" fontSize="14">{["RUN", "INSPECT", "NONE"].map((l, k) => { const on = q > 0.5 && k === 1; return <g key={l} transform={`translate(${k * 120} 30)`}><rect width="108" height="46" fill={on ? "var(--fg)" : "none"} stroke={line} /><text x="54" y="28" textAnchor="middle" fill={on ? "var(--bg)" : line}>{l}</text></g>; })}<text x="0" y="104" fill="var(--mute)">request id stored with the report</text></svg>
  );
  if (i === 4) return (
    <svg width={W} height={H} fontFamily="JetBrains Mono Variable, monospace" fontSize="13">{["SAFE_STOP", "INSPECT", "CREDIT_STOP", "RUN"].map((l, k) => { const on = (q < 0.5 ? 3 : 1) === k; return <g key={l} transform={`translate(0 ${k * 28})`}><rect width="240" height="24" fill={on ? "var(--fg)" : "none"} stroke="var(--line)" /><text x="10" y="16" fill={on ? "var(--bg)" : "var(--mute)"}>{l}</text></g>; })}<text x="256" y="68" fill="var(--mute)">{q < 0.5 ? "all clear" : "AI says INSPECT"}</text></svg>
  );
  if (i === 5) { const leaf = Math.floor(q * 40) + 17; return (
    <svg width={W} height={H}>{Array.from({ length: 128 }, (_, k) => <rect key={k} x={(k % 32) * 11} y={Math.floor(k / 32) * 11 + 8} width="7" height="7" fill={k === leaf % 128 ? "var(--accent)" : k < leaf % 128 ? "var(--fg)" : "var(--line)"} />)}<text x="0" y="74" fontFamily="JetBrains Mono Variable, monospace" fontSize="12" fill="var(--mute)">leaf = nonce - 1 · 2,400 bytes</text></svg>
  ); }
  if (i === 6) return (
    <svg width={W} height={H} fontFamily="JetBrains Mono Variable, monospace" fontSize="12">{["VERIFY", "VERIFY", "SENDER", "DEFAULT"].map((l, k) => { const f = seg(q, k * 0.22, k * 0.22 + 0.22); return <g key={k} transform={`translate(${k * 92} 24)`}><rect width="84" height="60" fill="none" stroke="var(--line)" /><rect width={84 * f} height="60" fill="var(--fg)" opacity="0.9" /><text x="8" y="36" fill={f > 0.6 ? "var(--bg)" : "var(--fg)"}>{l}</text><text x="8" y="80" fill="var(--mute)">frame {k}</text></g>; })}</svg>
  );
  return (
    <svg width={W} height={H} fontFamily="JetBrains Mono Variable, monospace" fontSize="13">{[["pulses", "+" + Math.round(q * 214)], ["credit", "-" + Math.round(q * 214)], ["hold", q > 0.7 ? "set" : "none"]].map(([k, v], r) => <g key={k} transform={`translate(0 ${r * 36})`}><line x1="0" x2={W} y1="0" y2="0" stroke="var(--line)" /><text x="0" y="24" fill="var(--mute)">{k}</text><text x={W} y="24" textAnchor="end" fill="var(--fg)">{v}</text></g>)}</svg>
  );
}

export function Flow() {
  return (
    <Stage id="flow" height={640}>
      {(p) => {
        const n = STEPS.length, f = clamp(p * 1.05) * (n - 1e-6), i = Math.min(n - 1, Math.floor(f)), q = f - i;
        return (
          <div className="mx-auto flex h-full max-w-6xl flex-col justify-center px-6 md:px-10">
            <Mono className="text-mute">The method, shown on the demo meter</Mono>
            <Title className="mt-4 max-w-3xl text-4xl font-semibold leading-[1] tracking-[-0.04em] md:text-6xl">One report, from signal to ledger.</Title>
            <div className="relative mt-14 md:mt-20">
              <div className="relative h-px bg-fg/30">
                <div className="absolute left-0 top-0 h-px bg-fg" style={{ width: `${(f / (n - 1)) * 100}%` }} />
                <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 bg-accent" style={{ left: `${(f / (n - 1)) * 100}%` }} />
                {STEPS.map((s, k) => <div key={s.n} className="absolute top-0 -translate-x-1/2" style={{ left: `${(k / (n - 1)) * 100}%` }}><div className={`mt-[-5px] h-2.5 w-2.5 border border-fg ${k <= i ? "bg-fg" : "bg-bg"}`} /><div className={`mt-3 hidden font-mono text-[11px] uppercase tracking-[0.08em] md:block ${k === i ? "text-fg" : "text-faint"}`}>{s.n}</div></div>)}
              </div>
            </div>
            <div className="mt-16 grid items-end gap-10 md:mt-24 md:grid-cols-[1fr_380px]">
              <div key={i} style={{ opacity: ease(seg(q, 0, 0.12)), transform: `translateY(${(1 - ease(seg(q, 0, 0.12))) * 10}px)` }}>
                <div className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")} / 08</div>
                <div className="mt-2 text-5xl font-semibold tracking-[-0.04em] md:text-7xl">{STEPS[i].n}</div>
                <p className="mt-5 max-w-xl text-lg leading-snug text-mute">{STEPS[i].t}</p>
              </div>
              <div className="hidden md:block"><Specimen i={i} q={q} /></div>
            </div>
          </div>
        );
      }}
    </Stage>
  );
}
