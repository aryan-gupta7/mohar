import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Meter3D, type Callout } from "./Meter3D";
import { Flow } from "./Flow";
import { Tracks } from "./Tracks";
import { Outline, Stage, Title, Unfold, Mono, seg, ease } from "./kit";

const OUTLINE = [
  { id: "top", label: "Meter" }, { id: "problem", label: "Problem" }, { id: "flow", label: "Flow" },
  { id: "ef", label: "Ethereum" }, { id: "ens", label: "ENS" }, { id: "og", label: "0G" }, { id: "proof", label: "Proof" }, { id: "demo", label: "Demo" },
];
const CALLOUTS: Callout[] = [
  { pos: [-0.9, 1.0, 0.6], label: "Counts its own pulses", dx: -90, dy: -50 },
  { pos: [0.98, -0.55, 0.6], label: "3,200 pulses per kWh", dx: 70, dy: 70 },
  { pos: [0.9, 1.75, 0.0], label: "Signs with its own key", dx: 70, dy: -50 },
];

function Hero({ enter }: { enter: () => void }) {
  return (
    <section id="top" className="relative h-screen min-h-[640px] overflow-hidden">
      <Meter3D onOpen={enter} callouts={CALLOUTS} />
      <div className="pointer-events-none relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pb-14 md:px-10 md:pb-20">
        <Mono className="mb-5 text-mute">ETHGlobal Mumbai 2026 · Ethereum Foundation · ENS · 0G</Mono>
        <h1 className="text-[clamp(72px,17vw,230px)] font-semibold leading-[0.82] tracking-[-0.06em]"><Unfold text="Mohar" /></h1>
        <p className="mt-6 max-w-xl text-xl font-medium leading-tight tracking-[-0.02em] md:text-3xl">A way to make any IoT device verifiable. The device signs its own readings, and anyone can check them.</p>
        <div className="pointer-events-auto mt-8 flex flex-wrap items-center gap-6">
          <button onClick={enter} className="bg-accent px-6 py-3.5 font-mono text-[13px] uppercase tracking-[0.08em] text-white hover:bg-fg">Open the live demo</button>
          <Mono className="text-mute">The demo device is a prepaid electricity meter · drag it, click it</Mono>
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <Stage id="problem" height={300}>
      {(p) => {
        const a = seg(p, 0.05, 0.4), b = ease(seg(p, 0.5, 0.78));
        const person = ["User", "Owner", "Maintainer"];
        return (
          <div className="mx-auto grid h-full max-w-6xl content-center gap-10 px-6 md:grid-cols-[1fr_1.2fr] md:px-10">
            <div>
              <Mono className="text-mute">The problem</Mono>
              <Title className="mt-4 text-4xl font-semibold leading-[1] tracking-[-0.045em] md:text-6xl">A device reports. Who believes it?</Title>
              <p className="mt-6 max-w-md text-lg leading-snug text-mute" style={{ minHeight: 110 }}>{b < 0.5 ? "Usually a vendor's server relays what a device says, and everyone who relies on it takes that server's word. Our demo: a prepaid meter in a building where tenant, owner and maintenance each have reason to doubt the reading." : "The device signs its own reading. The record sits where every party can check it, and no server has to be trusted. The same method fits any sensor or machine."}</p>
            </div>
            <svg viewBox="0 0 600 360" className="w-full" fontFamily="JetBrains Mono Variable, monospace" fontSize="11">
              <g transform="translate(0 150)"><rect width="110" height="60" fill="none" stroke="var(--fg)" /><text x="12" y="25" fill="var(--mute)">ANY</text><text x="12" y="45" fill="var(--fg)">device</text></g>
              {/* old path: through a server */}
              <g opacity={1 - b}>
                <line x1="110" x2={110 + 110 * a} y1="180" y2="180" stroke="var(--fg)" />
                <g transform="translate(220 150)" opacity={a}><rect width="120" height="60" fill="none" stroke="var(--fg)" strokeDasharray="4 4" /><text x="12" y="25" fill="var(--mute)">VENDOR</text><text x="12" y="45" fill="var(--fg)">server</text></g>
                {person.map((_, i) => <line key={i} x1="340" x2={340 + 130 * a} y1="180" y2={60 + i * 120} stroke="var(--fg)" opacity="0.5" />)}
              </g>
              {/* new path: straight to a shared record */}
              <g opacity={b}>
                <line x1="110" x2={110 + 230 * b} y1="180" y2="180" stroke="var(--accent)" strokeWidth="2" />
                <g transform="translate(340 150)"><rect width="110" height="60" fill="var(--fg)" /><text x="12" y="25" fill="var(--bg)">SHARED</text><text x="12" y="45" fill="var(--bg)">record</text></g>
                {person.map((_, i) => <line key={i} x1="440" x2="470" y1={180} y2={60 + i * 120} stroke="var(--accent)" />)}
              </g>
              {person.map((n, i) => <g key={n} transform={`translate(470 ${40 + i * 120})`} opacity={0.35 + a * 0.65}><rect width="110" height="40" fill="none" stroke="var(--fg)" /><text x="10" y="25" fill="var(--fg)">{n}</text></g>)}
                          </svg>
          </div>
        );
      }}
    </Stage>
  );
}

const NUMS: [string, string][] = [
  ["2,400", "bytes in each signature"], ["256", "one-time keys under one root"], ["89,161 / 90,000", "gas to verify it on-chain"], ["0", "ETH in the device's account"],
  ["31 of 31", "transactions byte-identical to the library"], ["3", "real power pulls, no key reused"], ["50 of 50", "TLS reads from a 51 KB chip"], ["38", "integration tests"],
];
const LIMITS = [
  "The signature scheme is custom and unaudited.",
  "The meter is simulated by a Pico. Nothing measures real electricity and nothing disconnects a supply.",
  "EIP-8141 and ERC-8421 are drafts, running only on a devnet.",
  "ESP8266 flash is readable, so someone holding the board can extract the seed.",
];

function Proof() {
  return (
    <section id="proof" className="mx-auto max-w-6xl px-6 py-32 md:px-10">
      <Mono className="text-mute">Measured, not claimed</Mono>
      <Title className="mt-4 max-w-3xl text-4xl font-semibold leading-[1] tracking-[-0.045em] md:text-6xl">The numbers behind it.</Title>
      <div className="mt-14 grid border-l border-t border-fg md:grid-cols-4">
        {NUMS.map(([n, l], i) => (
          <motion.div key={l} className="border-b border-r border-fg p-6" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.6 }} transition={{ delay: (i % 4) * 0.07, duration: 0.5 }}>
            <div className="font-mono text-3xl font-bold tracking-[-0.04em] md:text-[34px]">{n}</div>
            <div className="mt-3 text-sm leading-snug text-mute">{l}</div>
          </motion.div>
        ))}
      </div>
      <div className="mt-20 grid gap-10 md:grid-cols-[220px_1fr]">
        <Mono className="text-accent">Honest limits</Mono>
        <ul className="space-y-3">{LIMITS.map((l) => <li key={l} className="border-b border-line pb-3 text-[15px] leading-snug">{l}</li>)}</ul>
      </div>
    </section>
  );
}

function Demo({ enter }: { enter: () => void }) {
  return (
    <section id="demo" className="bg-fg text-bg">
      <div className="mx-auto flex min-h-[70vh] max-w-6xl flex-col justify-center px-6 py-24 md:px-10">
        <Mono className="text-bg/60">The demo</Mono>
        <h2 className="mt-4 text-[clamp(48px,10vw,140px)] font-semibold leading-[0.88] tracking-[-0.055em]">See it on a meter.</h2>
        <p className="mt-6 max-w-lg text-lg leading-snug text-bg/70">The demo device is a prepaid electricity meter. Live reports, the pipeline, the ledger, the identity page and the permission test, on the real devnet.</p>
        <div><button onClick={enter} className="mt-10 bg-accent px-7 py-4 font-mono text-[13px] uppercase tracking-[0.08em] text-white hover:bg-bg hover:text-fg">Open the live demo</button></div>
      </div>
    </section>
  );
}

export function Landing() {
  const [leaving, setLeaving] = useState(false);
  const enter = () => { if (leaving) return; setLeaving(true); setTimeout(() => { location.hash = "overview"; window.scrollTo(0, 0); }, 520); };
  useEffect(() => { document.documentElement.classList.add("land-root"); return () => document.documentElement.classList.remove("land-root"); }, []);
  return (
    <div className="land bg-bg text-fg">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between px-6 md:px-10">
        <span className="font-mono text-[12px] uppercase tracking-[0.12em]">Mohar</span>
        <button onClick={enter} className="font-mono text-[12px] uppercase tracking-[0.08em] underline-offset-4 hover:underline">Demo</button>
      </header>
      <Outline items={OUTLINE} />
      <Hero enter={enter} />
      <Problem />
      <Flow />
      <Tracks />
      <Proof />
      <Demo enter={enter} />
      <motion.div aria-hidden className="pointer-events-none fixed inset-0 z-50 bg-fg" initial={false} animate={{ clipPath: leaving ? "inset(0 0 0 0)" : "inset(100% 0 0 0)" }} transition={{ duration: 0.5, ease: [0.7, 0, 0.2, 1] }} />
    </div>
  );
}
