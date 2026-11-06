// Landing helpers. Scroll-driven stage, wipe title (after UIarc "In-view title", wipe variant),
// character unfold (after OriginKit "3D text unfold"), and an outline nav (after OriginKit "Scroll progress outline").
import { motion, useInView, useMotionValueEvent, useScroll, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** progress of p inside [a, b], 0..1 */
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** A tall section with a pinned screen. `p` runs 0..1 while the screen is pinned. */
export function Stage({ id, height = 300, children, className = "" }: { id?: string; height?: number; className?: string; children: (p: number) => ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setP(Math.round(v * 500) / 500));
  return (
    <section id={id} ref={ref} style={{ height: `${height}vh` }} className={`relative ${className}`}>
      <div className="sticky top-0 h-screen overflow-hidden">{children(p)}</div>
    </section>
  );
}

/** Section title that wipes in from the left when it enters the view. */
export function Title({ children, className = "", as = "h2" }: { children: ReactNode; className?: string; as?: "h1" | "h2" }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const on = useInView(ref, { once: true, amount: 0.5 });
  const H = as;
  return (
    <H ref={ref} className={className}>
      <motion.span className="block" initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0.2 }} animate={on ? { clipPath: "inset(0 0% 0 0)", opacity: 1 } : {}} transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}>{children}</motion.span>
    </H>
  );
}

/** Characters unfold into place, left to right. */
export function Unfold({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span aria-label={text} className={`inline-block ${className}`} style={{ perspective: 1200 }}>
      {[...text].map((c, i) => (
        <motion.span key={i} aria-hidden className="inline-block" style={{ transformOrigin: "left center" }} initial={{ rotateY: -90, rotateX: 40, opacity: 0 }} animate={{ rotateY: 0, rotateX: 0, opacity: 1 }} transition={{ duration: 0.8, delay: 0.15 + i * 0.07, ease: "easeOut" }}>{c === " " ? " " : c}</motion.span>
      ))}
    </span>
  );
}

export const Mono = ({ children, className = "" }: { children: ReactNode; className?: string }) => <span className={`font-mono text-[12px] uppercase tracking-[0.08em] ${className}`}>{children}</span>;

/** Fixed outline on the right: a dashed path, nodes that fill as you pass them, the current label in ink. */
export function Outline({ items }: { items: { id: string; label: string }[] }) {
  const [cur, setCur] = useState(0);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", () => {
    let c = 0;
    items.forEach((it, i) => { const el = document.getElementById(it.id); if (el && el.getBoundingClientRect().top < window.innerHeight * 0.45) c = i; });
    setCur(c);
  });
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const gap = 30;
  return (
    <nav aria-label="Sections" className="fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 2xl:block">
      <div className="relative" style={{ height: gap * (items.length - 1) + 12, width: 150 }}>
        <svg className="absolute left-0 top-0" width="12" height={gap * (items.length - 1) + 12}>
          <line x1="6" y1="6" x2="6" y2={gap * (items.length - 1) + 6} stroke="var(--faint)" strokeDasharray="3 3" />
          <line x1="6" y1="6" x2="6" y2={6 + gap * cur} stroke="var(--fg)" strokeWidth="1.5" style={{ transition: "all .3s" }} />
          {items.map((_, i) => <rect key={i} x="2" y={2 + gap * i} width="8" height="8" fill={i <= cur ? "var(--fg)" : "var(--bg)"} stroke="var(--fg)" />)}
        </svg>
        {items.map((it, i) => <button key={it.id} onClick={() => go(it.id)} className={`absolute left-6 text-left font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${i === cur ? "text-fg" : "text-faint hover:text-fg"}`} style={{ top: gap * i - 1 }}>{it.label}</button>)}
      </div>
    </nav>
  );
}
