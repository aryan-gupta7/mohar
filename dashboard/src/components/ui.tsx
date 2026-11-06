import type { ReactNode } from "react";
import { AlertTriangle, CircleDashed, Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import type { Status } from "../lib/events";

export const PULSES_PER_KWH = 3200;
export const kwh = (pulses: number) => pulses / PULSES_PER_KWH;
export const fmtKwh = (pulses: number) => kwh(pulses).toFixed(3);
export const short = (s?: string | null, a = 8, b = 6) => (s ? (s.length > a + b + 3 ? `${s.slice(0, a)}…${s.slice(-b)}` : s) : "—");
export const ago = (t: number, now: number) => { if (!t) return "never"; const s = Math.max(0, Math.round((now - t) / 1000)); return s < 2 ? "just now" : s < 90 ? `${s} s ago` : `${Math.round(s / 60)} min ago`; };

export type BadgeKind = "SIMULATED INPUT" | "LIVE HARDWARE" | "DERIVED" | "AI RESPONSE" | "LOCAL POLICY" | "SIGNED" | "MEMPOOL ACCEPTED" | "ON-CHAIN CONFIRMED" | "ARCHIVED" | "REPLAY" | "ESTIMATED" | "SEPOLIA" | "MOHAR DEVNET" | "TESTING ONLY" | "STALE";
const BADGE: Record<BadgeKind, string> = {
  "SIMULATED INPUT": "bg-sky/15 text-sky border-sky/30", "LIVE HARDWARE": "bg-lime/15 text-lime border-lime/30", DERIVED: "bg-sky/10 text-sky border-sky/25",
  "AI RESPONSE": "bg-lav/15 text-lav border-lav/30", "LOCAL POLICY": "bg-graph text-text border-line", SIGNED: "bg-lime/10 text-lime border-lime/25",
  "MEMPOOL ACCEPTED": "bg-lime/10 text-lime border-lime/25", "ON-CHAIN CONFIRMED": "bg-lime/20 text-lime border-lime/40", ARCHIVED: "bg-lav/15 text-lav border-lav/30",
  REPLAY: "bg-warn/15 text-warn border-warn/40", ESTIMATED: "bg-sky/10 text-sky border-sky/25", SEPOLIA: "bg-lav/10 text-lav border-lav/25", "MOHAR DEVNET": "bg-sky/10 text-sky border-sky/25",
  "TESTING ONLY": "bg-warn/15 text-warn border-warn/40", STALE: "bg-warn/15 text-warn border-warn/40",
};
export const Badge = ({ k, title }: { k: BadgeKind; title?: string }) => (
  <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap ${BADGE[k]}`}>{k}</span>
);

export const Card = ({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) => (
  <div onClick={onClick} className={`card p-4 ${className}`}>{children}</div>
);
export const H = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="flex items-center justify-between gap-2 mb-3"><h2 className="text-sm font-semibold text-mute uppercase tracking-wider">{children}</h2>{right}</div>
);

export function Stat({ label, value, unit, note, badge, tone }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; badge?: BadgeKind; tone?: string }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2"><div className="text-xs text-mute">{label}</div>{badge && <Badge k={badge} />}</div>
      <div className={`metric mt-2 text-3xl font-semibold ${tone ?? ""}`}>{value}{unit && <span className="ml-1 text-sm font-medium text-mute">{unit}</span>}</div>
      {note && <div className="mt-1 text-xs text-mute">{note}</div>}
    </Card>
  );
}

export const StatusIcon = ({ s, size = 16 }: { s: Status; size?: number }) => {
  if (s === "COMPLETED") return <CheckCircle2 size={size} className="text-lime" />;
  if (s === "PROCESSING") return <Loader2 size={size} className="text-lav animate-spin" />;
  if (s === "FAILED") return <XCircle size={size} className="text-bad" />;
  if (s === "UNAVAILABLE") return <MinusCircle size={size} className="text-mute" />;
  return <CircleDashed size={size} className="text-mute" />;
};

export const ModePill = ({ mode }: { mode?: string }) => {
  const m = mode ?? "—";
  const c = m === "RUN" ? "bg-lime text-black" : m === "INSPECT" ? "bg-warn text-black" : m === "CREDIT_STOP" ? "bg-sky text-black" : m === "SAFE_STOP" ? "bg-bad text-black" : "bg-line text-mute";
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold tracking-wide ${c}`}>{m}</span>;
};

export const ErrorBox = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="card p-4 border-bad/40"><div className="flex items-center gap-2 text-bad font-semibold"><AlertTriangle size={16} />{title}</div>{children && <div className="mt-1 text-sm text-mute">{children}</div>}</div>
);
export const Empty = ({ children }: { children: ReactNode }) => <div className="card p-6 text-center text-sm text-mute">{children}</div>;
export const Mono = ({ children, className = "" }: { children: ReactNode; className?: string }) => <span className={`font-mono text-xs break-all ${className}`}>{children}</span>;
export const Row = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line/60 py-2 last:border-0"><span className="text-xs text-mute">{k}</span><span className="text-sm text-right">{children}</span></div>
);
