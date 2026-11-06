// Motion pieces. Rule: nothing animates to fake progress. Every animation follows a prop that changed because a real
// event (a METER/EV line, an RPC read) arrived. Inspired by OriginKit "Rolling counter" and "Shuttle segmented control".
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef } from "react";

export function CountUp({ value, digits = 0, className }: { value: number; digits?: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduce) { mv.set(value); first.current = false; return; }
    const c = animate(mv, value, { duration: 0.6, ease: "easeOut" });
    return () => c.stop();
  }, [value]);
  return <motion.span className={className}>{text}</motion.span>;
}

/** Odometer: each digit is a column that rolls to its value. */
export function Odometer({ value, className = "" }: { value: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span aria-label={value} className={`inline-flex ${className}`} style={{ lineHeight: 1 }}>
      {[...value].map((ch, i) => /\d/.test(ch) ? (
        <span key={value.length - i} aria-hidden className="relative inline-block overflow-hidden" style={{ height: "1em", width: "0.62em" }}>
          <motion.span className="absolute inset-x-0 top-0 flex flex-col" initial={false} animate={{ y: `${-Number(ch) * 10}%` }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 20 }} style={{ height: "10em" }}>
            {Array.from({ length: 10 }, (_, d) => <span key={d} style={{ height: "1em", lineHeight: 1 }} className="text-center">{d}</span>)}
          </motion.span>
        </span>
      ) : <span key={`${i}-${ch}`} aria-hidden className="inline-block" style={{ width: ch === "." ? "0.3em" : undefined, textAlign: "center" }}>{ch}</span>)}
    </span>
  );
}

/** A row of options with one sliding highlight behind the chosen one. */
export function Segmented<T extends string>({ options, value, onChange, id, className = "" }: { options: { value: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void; id: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div role="radiogroup" className={`flex flex-wrap gap-1 ${className}`}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={`relative rounded-full px-3.5 py-1.5 text-sm transition-colors ${value === o.value ? "text-bg" : "text-mute hover:text-fg"}`}>
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-accent" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }} />}
          <span className="relative">{o.label}{o.hint && <span className={`ml-1.5 text-xs ${value === o.value ? "opacity-60" : "text-faint"}`}>{o.hint}</span>}</span>
        </button>
      ))}
    </div>
  );
}
