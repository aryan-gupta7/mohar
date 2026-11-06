// After React Bits "Count Up". Eases to a new value only when the real value changes; never runs on a timer.
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
