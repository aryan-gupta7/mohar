import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { ChevronRight } from "lucide-react";
import type { Status } from "../lib/events";
import { Title } from "../landing/kit";

export const PULSES_PER_KWH = 3200;
export const kwh = (pulses: number) => pulses / PULSES_PER_KWH;
export const fmtKwh = (pulses: number) => kwh(pulses).toFixed(3);
export const short = (s?: string | null, a = 8, b = 6) => (s ? (s.length > a + b + 3 ? `${s.slice(0, a)}…${s.slice(-b)}` : s) : "—");
export const ago = (t: number, now: number) => { if (!t) return "never"; const s = Math.max(0, Math.round((now - t) / 1000)); return s < 2 ? "just now" : s < 90 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };

/** Small provenance tag. Used only where the source changes the meaning of a number. */
export type TagKind = "Simulated" | "Replay" | "Stale" | "Sepolia" | "Devnet" | "Estimated" | "Archived" | "Testing";
const TAG: Record<TagKind, string> = { Simulated: "text-mute", Replay: "text-accent", Stale: "text-warn", Sepolia: "text-mute", Devnet: "text-mute", Estimated: "text-mute", Archived: "text-ok", Testing: "text-warn" };
export const Tag = ({ k, title }: { k: TagKind; title?: string }) => (
  <span title={title} className={`inline-flex items-center px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] shadow-[inset_0_0_0_1px_var(--line)] ${TAG[k]}`}>{k}</span>
);

export const Card = ({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) => (
  <div onClick={onClick} className={`surface p-5 ${className}`}>{children}</div>
);
export const H = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="mb-5 flex items-center justify-between gap-2 border-b border-line pb-3"><h2 className="font-mono text-[12px] font-medium uppercase tracking-[0.1em] text-mute">{children}</h2>{right}</div>
);
export const Page = ({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) => (
  <div className="mx-auto w-full max-w-4xl space-y-6">
    <div className="flex flex-wrap items-center gap-3"><Title as="h1" className="text-4xl font-semibold leading-none tracking-[-0.045em] md:text-5xl">{title}</Title>{aside}</div>
    {children}
  </div>
);

export function Stat({ label, value, unit, note, tone }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute">{label}</div>
      <div className={`num mt-1 text-3xl font-semibold ${tone ?? ""}`}>{value}{unit && <span className="ml-1 text-sm font-normal text-mute">{unit}</span>}</div>
      {note && <div className="mt-1 truncate text-xs text-faint">{note}</div>}
    </div>
  );
}

export const StatusDot = ({ s }: { s: Status }) => (
  <span className={`relative inline-block h-2 w-2 shrink-0 ${s === "COMPLETED" ? "bg-ok" : s === "FAILED" ? "bg-bad" : s === "PROCESSING" ? "bg-accent" : "bg-transparent shadow-[inset_0_0_0_1.5px_var(--faint)]"}`}>
    {s === "PROCESSING" && <span className="absolute -inset-1 animate-ping bg-accent/40" />}
  </span>
);

export const ModePill = ({ mode }: { mode?: string }) => {
  const m = mode ?? "—";
  const c = m === "RUN" ? "text-ok" : m === "INSPECT" ? "text-warn" : m === "CREDIT_STOP" ? "text-warn" : m === "SAFE_STOP" ? "text-bad" : "text-mute";
  const label = m === "CREDIT_STOP" ? "Credit stop" : m === "SAFE_STOP" ? "Safe stop" : m === "—" ? m : m[0] + m.slice(1).toLowerCase();
  return <span className={`inline-flex items-center gap-2 font-mono text-[12px] font-medium uppercase tracking-[0.08em] ${c}`}><span className="h-2 w-2 bg-current" />{label}</span>;
};

export const ErrorBox = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="surface flex gap-3 p-4 text-bad"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div><div className="text-sm font-medium">{title}</div>{children && <div className="mt-0.5 text-sm text-mute">{children}</div>}</div></div>
);
export const Empty = ({ children }: { children: ReactNode }) => <div className="py-8 text-center text-sm text-mute">{children}</div>;
export const Mono = ({ children, className = "" }: { children: ReactNode; className?: string }) => <span className={`font-mono text-xs break-all ${className}`}>{children}</span>;
export const Row = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 border-t border-line py-2.5 first:border-0"><span className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">{k}</span><span className="text-right text-sm">{children}</span></div>
);
export const Button = ({ variant = "solid", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }) => (
  <button {...p} className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.08em] transition-colors disabled:opacity-40 ${variant === "solid" ? "bg-accent text-white hover:bg-fg hover:text-bg" : "shadow-[inset_0_0_0_1px_var(--fg)] hover:bg-fg hover:text-bg"} ${className}`} />
);
export const inputCls = "w-full bg-transparent px-3 py-2 text-sm shadow-[inset_0_0_0_1px_var(--line)] placeholder:text-faint focus:shadow-[inset_0_0_0_1px_var(--fg)] focus:outline-none";

export const Long = ({ text }: { text: string }) => (
  <Collapsible className="max-w-[60ch] text-right">
    <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs text-mute hover:text-fg"><ChevronRight size={12} className="transition-transform group-data-[state=open]:rotate-90" />{text.slice(0, 40)}…</CollapsibleTrigger>
    <CollapsibleContent className="mt-1 text-left font-mono text-[11px] leading-relaxed text-mute">{text}</CollapsibleContent>
  </Collapsible>
);
