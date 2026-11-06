// Live power chart. Shape follows UIarc "Line chart" (scrubbable crosshair, headline that follows it, value scale that springs),
// drawn flat: hairline grid, one stepped line, one faint fill, no glow. The time window slides with the clock.
import { animate } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { Segmented } from "./motion";

type Pt = { at: number; w: number };
const STEPS = [1000, 2000, 4000, 6000, 8000, 12000, 16000];
const niceMax = (v: number) => STEPS.find((s) => s >= v * 1.08) ?? Math.ceil(v / 2000) * 2000;
const fmtW = (w: number) => (w >= 1000 ? `${+(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`);
const LIVE_RANGES = [{ value: "60", label: "1 min" }, { value: "300", label: "5 min" }];
const CHAIN_RANGES = [{ value: "3600", label: "1 hour" }, { value: "21600", label: "6 hours" }, { value: "86400", label: "24 hours" }];
const H = 240, M = { l: 52, r: 16, t: 12, b: 24 };

export function PowerChart({ measured }: { measured: Pt[] }) {
  const s = useStore();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [liveRange, setLiveRange] = useState("60"), [chainRange, setChainRange] = useState("3600");
  const [now, setNow] = useState(Date.now());
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width)); wrap.current && ro.observe(wrap.current); return () => ro.disconnect(); }, []);
  useEffect(() => { let raf = 0, last = 0; const tick = (t: number) => { if (t - last > 50) { last = t; setNow(Date.now()); } raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, []);

  const fromPico = s.meterHist.length > 0 && (s.mode === "replay" || now - s.pico.lastAt < 300000);
  const range = fromPico ? liveRange : chainRange;
  const span = Number(range) * 1000;
  const t0 = now - span;
  const live = fromPico && !!s.meter && (s.mode === "replay" || now - s.pico.lastAt < 8000);
  const all: Pt[] = useMemo(() => fromPico ? s.meterHist.map((m) => ({ at: m.at, w: m.watts })) : s.chain.rows.filter((r) => r.time).map((r) => ({ at: r.time! * 1000, w: r.sensors.avgW })), [s.meterHist, s.chain.rows, fromPico]);
  const gap = fromPico ? 6000 : Infinity;
  const inView = all.filter((p) => p.at >= t0 - 10000);
  const meas = !fromPico ? [] : measured.filter((p) => p.at >= t0);

  const peak = Math.max(0, ...inView.map((p) => p.w), ...meas.map((p) => p.w));
  const target = niceMax(Math.max(peak, 900));
  const [ymax, setYmax] = useState(target);
  const yRef = useRef(target);
  useEffect(() => { const c = animate(yRef.current, target, { duration: 0.5, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => { yRef.current = v; setYmax(v); } }); return () => c.stop(); }, [target]);

  const iw = Math.max(10, width - M.l - M.r), ih = H - M.t - M.b;
  const X = (t: number) => M.l + ((t - t0) / span) * iw;
  const Y = (w: number) => M.t + ih - (w / ymax) * ih;
  const endAt = live ? now : (inView[inView.length - 1]?.at ?? now) + (fromPico ? 2000 : 0);

  // stepped path; a gap over 6 s breaks the line, so a silent Pico is never drawn as if it were still reporting
  let d = "", area = "";
  inView.forEach((p, i) => {
    const prev = inView[i - 1];
    const x = Math.max(M.l, X(p.at));
    if (!prev || p.at - prev.at > gap) { if (prev) { const xe = X(prev.at + 2000); d += `H${xe}`; area += `H${xe}V${Y(0)}Z`; } d += `M${x},${Y(p.w)}`; area += `M${x},${Y(0)}V${Y(p.w)}`; }
    else { d += `H${x}V${Y(p.w)}`; area += `H${x}V${Y(p.w)}`; }
  });
  const last = inView[inView.length - 1];
  if (last) { const xe = Math.min(M.l + iw, X(endAt)); d += `H${xe}`; area += `H${xe}V${Y(0)}Z`; }

  const nearest = (x: number) => { const t = t0 + ((x - M.l) / iw) * span; let b: Pt | null = null; for (const p of inView) if (p.at >= t0 && (!b || Math.abs(p.at - t) < Math.abs(b.at - t))) b = p; return b; };
  const hp = hover !== null ? nearest(hover) : null;
  const shown = hp ?? last ?? null;
  const ticks = [0, 1, 2, 3, 4].map((i) => (ymax / 4) * i);
  const xt = [1, 2 / 3, 1 / 3, 0].map((f) => Math.round(Number(range) * f));
  const lab = (v: number) => v === 0 ? "now" : v >= 3600 ? `${+(v / 3600).toFixed(1)}h ago` : v >= 120 ? `${Math.round(v / 60)}m ago` : `${v}s ago`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="num text-4xl font-semibold">{shown ? fmtW(shown.w) : "—"}</div>
          <div className="mt-1 text-sm text-mute">{hp ? new Date(hp.at).toLocaleString() : live ? `${s.meter?.mode ?? ""} · live` : shown ? (fromPico ? "last reading" : `from on-chain reports · ${new Date(shown.at).toLocaleTimeString()}`) : "no data"}</div>
        </div>
        <Segmented id={fromPico ? "range-live" : "range-chain"} options={fromPico ? LIVE_RANGES : CHAIN_RANGES} value={range} onChange={fromPico ? setLiveRange : setChainRange} />
      </div>
      <div ref={wrap} className="relative">
        <svg width={width} height={H} role="img" aria-label="Power over time" className="block touch-pan-y select-none"
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = e.clientX - r.left; setHover(x >= M.l && x <= M.l + iw ? x : null); }} onPointerLeave={() => setHover(null)}>
          {ticks.map((v) => <g key={v}><line x1={M.l} x2={M.l + iw} y1={Y(v)} y2={Y(v)} stroke="var(--line)" strokeDasharray={v === 0 ? undefined : "2 4"} /><text x={M.l - 10} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--faint)">{fmtW(v)}</text></g>)}
          {xt.map((v) => <text key={v} x={X(now - v * 1000)} y={H - 4} textAnchor={v === 0 ? "end" : v === xt[0] ? "start" : "middle"} fontSize={11} fill="var(--faint)">{lab(v)}</text>)}
          {inView.length < 2 && <text x={M.l + iw / 2} y={M.t + ih / 2} textAnchor="middle" fontSize={13} fill="var(--mute)">{inView.length === 1 ? "Waiting for another report" : "No power data yet"}</text>}
          <path d={area} fill="var(--fg)" opacity={0.06} />
          <path d={d} fill="none" stroke="var(--fg)" strokeWidth={1.75} strokeLinejoin="round" />
          {meas.length > 0 && <path d={meas.map((p, i) => `${i ? "L" : "M"}${X(p.at)},${Y(p.w)}`).join("")} fill="none" stroke="var(--ok)" strokeWidth={1.25} />}
          {meas.map((p) => <circle key={p.at} cx={X(p.at)} cy={Y(p.w)} r={3.5} fill="var(--card)" stroke="var(--ok)" strokeWidth={1.5} />)}
          {live && last && <circle cx={Math.min(M.l + iw, X(now))} cy={Y(last.w)} r={4} fill="var(--fg)" />}
          {hp && hover !== null && <g><line x1={X(hp.at)} x2={X(hp.at)} y1={M.t} y2={M.t + ih} stroke="var(--faint)" /><circle cx={X(hp.at)} cy={Y(hp.w)} r={4} fill="var(--card)" stroke="var(--fg)" strokeWidth={1.75} /></g>}
        </svg>
      </div>
      <div className="mt-3 flex gap-5 text-xs text-mute">
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-fg" />{fromPico ? "Meter output" : "Average power per report"}</span>
        {measured.length > 0 && <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-card shadow-[inset_0_0_0_1.5px_var(--ok)]" />Measured by the ESP</span>}
      </div>
    </div>
  );
}
