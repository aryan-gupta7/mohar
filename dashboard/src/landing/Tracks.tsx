import type { ReactNode } from "react";
import { Stage, Mono, seg, ease, clamp } from "./kit";

type Req = { ask: string; did: string; proof: string };

/** A pinned screen. First the track and what it is used for, large; then the heading settles at the top and the graphic takes over. */
function Track({ id, no, sponsor, award, use, reqs, children }: { id: string; no: string; sponsor: string; award: string; use: string; reqs: Req[]; children: (q: number) => ReactNode }) {
  return (
    <>
      <Stage id={id} height={520}>
        {(p) => {
          const t = ease(seg(p, 0.06, 0.2)), g = seg(p, 0.2, 0.3), q = seg(p, 0.26, 0.98);
          return (
            <div className="relative mx-auto h-full max-w-6xl px-6 md:px-10">
              <div className="absolute inset-x-6 md:inset-x-10" style={{ top: `calc(${(1 - t) * 34}vh + ${t * 40}px)` }}>
                <Mono className="text-accent">Track {no} · {sponsor}</Mono>
                <h2 className="mt-3 max-w-4xl font-semibold leading-[0.98] tracking-[-0.045em]" style={{ fontSize: `clamp(${28 + (1 - t) * 20}px, ${3 + (1 - t) * 3}vw, ${44 + (1 - t) * 40}px)` }}>{award}</h2>
                <p className="mt-4 max-w-2xl text-base leading-snug text-mute md:text-lg" style={{ opacity: 1 - t * 0.35 }}>{use}</p>
              </div>
              <div className="absolute inset-x-6 bottom-8 top-[230px] md:inset-x-10 md:top-[250px]" style={{ opacity: g, transform: `translateY(${(1 - g) * 24}px)` }}>{children(q)}</div>
            </div>
          );
        }}
      </Stage>
      <div className="mx-auto max-w-6xl px-6 pb-28 pt-6 md:px-10">
        <Mono className="text-mute">What the track asks, and what we did</Mono>
        <div className="mt-4 border-t border-fg">
          {reqs.map((r) => (
            <div key={r.ask} className="grid gap-2 border-b border-line py-4 md:grid-cols-[1fr_1.4fr_220px] md:gap-8">
              <div className="text-[15px] font-medium">{r.ask}</div>
              <div className="text-[15px] leading-snug text-mute">{r.did}</div>
              <div className="font-mono text-[11px] uppercase leading-snug tracking-[0.06em] text-faint md:text-right">{r.proof}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const MONO = "JetBrains Mono Variable, monospace";
const Box = ({ x, y, w, h, on, children, dash }: { x: number; y: number; w: number; h: number; on?: boolean; dash?: boolean; children?: ReactNode }) => (
  <g transform={`translate(${x} ${y})`}><rect width={w} height={h} fill={on ? "var(--fg)" : "none"} stroke="var(--fg)" strokeDasharray={dash ? "4 4" : undefined} />{children}</g>
);

/* ---------------- Ethereum Foundation ---------------- */
function EfScene({ q }: { q: number }) {
  const sign = seg(q, 0, 0.12), travel = ease(seg(q, 0.14, 0.4)), frames = seg(q, 0.5, 0.82), mined = seg(q, 0.86, 0.98);
  const fr = [["VERIFY", "MoharAccount", "signature · 89,161 of 90,000 gas"], ["VERIFY", "QuotaPaymaster", "quota · 7,556 of 9,900 gas"], ["SENDER", "MachineLedger", "records the report"], ["DEFAULT", "QuotaPaymaster", "settle · quota minus one"]];
  const scene2 = 1 - seg(q, 0.44, 0.52);
  return (
    <svg viewBox="0 0 1000 400" className="h-full w-full" fontFamily={MONO} fontSize="12">
      {/* the signed bytes: 67 chains and 8 merkle siblings */}
      <g transform="translate(0 150)">
        {Array.from({ length: 75 }, (_, k) => <rect key={k} x={k * 3.4} y={k < 67 ? 0 : 8} width="2.4" height={k < 67 ? 36 : 20} fill="var(--fg)" opacity={clamp(sign * 80 - k) > 0 ? 1 : 0.1} />)}
        <text y="64" fill="var(--mute)">one report, signed by</text><text y="80" fill="var(--mute)">the device · 2,400 bytes</text>
      </g>
      <g opacity={scene2}>
        {/* the packet */}
        <rect x={260 + travel * 150} y="162" width="16" height="12" fill="var(--accent)" />
        <line x1="260" x2="420" y1="168" y2="168" stroke="var(--faint)" strokeDasharray="3 4" />
        {/* two doors */}
        <g transform="translate(430 30)">
          <Box x={0} y={0} w={300} h={110} />
          <text x="14" y="26" fill="var(--mute)">PUBLIC MEMPOOL · CANONICAL RULES</text>
          <text x="14" y="52" fill="var(--fg)" fontSize="13">eth_sendRawTransaction</text>
          <text x="14" y="94" fill="var(--bad)" opacity={seg(travel, 0.85, 1)} fontWeight="700">REFUSED · StorageReadNonSender</text>
          <line x1="-20" x2="0" y1="138" y2="55" stroke="var(--bad)" opacity={seg(travel, 0.7, 1)} />
        </g>
        <g transform="translate(430 230)">
          <Box x={0} y={0} w={300} h={110} on={seg(travel, 0.85, 1) > 0.5} />
          <text x="14" y="26" fill={seg(travel, 0.85, 1) > 0.5 ? "var(--bg)" : "var(--mute)"}>ALT MEMPOOL · ERC-8421 RULES</text>
          <text x="14" y="52" fill={seg(travel, 0.85, 1) > 0.5 ? "var(--bg)" : "var(--fg)"} fontSize="13">eth_sendFrameTransaction</text>
          <text x="14" y="94" fill={seg(travel, 0.85, 1) > 0.5 ? "var(--bg)" : "var(--faint)"} fontWeight="700">{seg(travel, 0.85, 1) > 0.5 ? "ADMITTED · every rule check passes" : "…"}</text>
        </g>
        <text x="760" y="70" fill="var(--mute)" opacity={seg(travel, 0.85, 1)}>The paymaster reads its own</text>
        <text x="760" y="88" fill="var(--mute)" opacity={seg(travel, 0.85, 1)}>quota storage. Only the alt</text>
        <text x="760" y="106" fill="var(--mute)" opacity={seg(travel, 0.85, 1)}>mempool allows that.</text>
        <text x="760" y="268" fill="var(--fg)" opacity={seg(travel, 0.85, 1)}>Same bytes. Same signature.</text>
      </g>
      {/* four frames */}
      <g opacity={seg(q, 0.46, 0.54)} transform="translate(340 40)">
        {fr.map(([m, who, what], k) => { const f = seg(frames, k * 0.25, k * 0.25 + 0.25); return (
          <g key={k} transform={`translate(${(k % 2) * 330} ${Math.floor(k / 2) * 130})`}>
            <Box x={0} y={0} w={310} h={110} on={f > 0.5}>
              <text x="14" y="26" fill={f > 0.5 ? "var(--bg)" : "var(--accent)"}>FRAME {k} · {m}</text>
              <text x="14" y="58" fill={f > 0.5 ? "var(--bg)" : "var(--fg)"} fontSize="20" fontWeight="700" fontFamily="Inter Variable, sans-serif">{who}</text>
              <text x="14" y="88" fill={f > 0.5 ? "var(--bg)" : "var(--mute)"}>{what}</text>
            </Box>
          </g>); })}
        <g opacity={mined} transform="translate(0 270)">
          <rect width="640" height="52" fill="var(--accent)" /><text x="16" y="32" fill="#fff" fontSize="14" fontWeight="700">MINED · block 2010 · balance 0 · quota 10 to 9 · public devnet</text>
        </g>
      </g>
    </svg>
  );
}

/* ---------------- ENS ---------------- */
const NAME = "meter-001.mohar.eth";
const RECS = [["mohar.ledger", "where reports are recorded"], ["mohar.paymaster", "who pays the gas"], ["mohar.pq.root", "the device's key root"], ["mohar.policy", "what the AI is told"], ["mohar.operator", "who clears holds"], ["mohar.maintenance.status", "service visits"], ["mohar.log", "the 0G episode log"]];
function EnsScene({ q }: { q: number }) {
  const typed = Math.floor(seg(q, 0, 0.14) * NAME.length), recs = seg(q, 0.16, 0.42), perm = seg(q, 0.55, 0.98);
  const tests = [
    { who: "maintenance key", rec: 5, ok: true, note: "allowed" },
    { who: "maintenance key", rec: 2, ok: false, note: "EACUnauthorizedAccountRoles" },
    { who: "uploader key", rec: 6, ok: true, note: "allowed" },
  ];
  const ti = Math.min(2, Math.floor(perm * 3)), tq = perm * 3 - ti;
  const t = tests[ti];
  return (
    <svg viewBox="0 0 1000 400" className="h-full w-full" fontFamily={MONO} fontSize="12">
      <text x="0" y="30" fontSize="30" fontWeight="700" fontFamily="Inter Variable, sans-serif" fill="var(--fg)" letterSpacing="-1">{NAME.slice(0, typed)}<tspan fill="var(--accent)">{typed < NAME.length ? "|" : ""}</tspan></text>
      <text x="0" y="52" fill="var(--mute)">ENSv2 · Sepolia</text>
      {RECS.map(([k, d], i) => { const on = recs * RECS.length > i; return (
        <g key={k} transform={`translate(0 ${80 + i * 38})`} opacity={on ? 1 : 0}>
          <line x1="0" x2="470" y1="0" y2="0" stroke="var(--line)" />
          <rect x="0" y="12" width="8" height="8" fill={perm > 0 && ((t.rec === i)) ? (t.ok ? "var(--ok)" : "var(--bad)") : "var(--fg)"} />
          <text x="20" y="21" fill="var(--fg)">{k}</text><text x="470" y="21" textAnchor="end" fill="var(--faint)">{d}</text>
        </g>); })}
      {/* the dashboard reads the name; no address lives in its code */}
      <g opacity={seg(q, 0.3, 0.45)} transform="translate(520 90)">
        <Box x={0} y={0} w={190} h={70}><text x="14" y="28" fill="var(--mute)">DASHBOARD CODE</text><text x="14" y="52" fill="var(--fg)" fontSize="16" fontWeight="700" fontFamily="Inter Variable, sans-serif">0 addresses</text></Box>
        <line x1="190" x2="270" y1="35" y2="35" stroke="var(--accent)" strokeWidth="2" /><Box x={270} y={0} w={170} h={70}><text x="14" y="28" fill="var(--mute)">THE CHAIN</text><text x="14" y="52" fill="var(--fg)">ledger · account</text></Box>
        <text x="0" y="100" fill="var(--mute)">It finds the ledger, account and</text><text x="0" y="118" fill="var(--mute)">paymaster from the name alone.</text>
      </g>
      {/* permission test */}
      <g opacity={seg(q, 0.5, 0.6)} transform="translate(520 250)">
        <text x="0" y="0" fill="var(--mute)">TRY THE EDIT, AGAINST THE LIVE RESOLVER</text>
        <g transform="translate(0 16)"><Box x={0} y={0} w={150} h={34}><text x="12" y="22" fill="var(--fg)">{t.who}</text></Box><line x1="150" x2={150 + 80 * ease(clamp(tq * 2))} y1="17" y2="17" stroke="var(--fg)" /><text x="240" y="21" fill="var(--fg)">{RECS[t.rec][0].replace("mohar.", "")}</text></g>
        <g transform="translate(0 70)" opacity={seg(tq, 0.5, 0.7)}><rect width="9" height="9" fill={t.ok ? "var(--ok)" : "var(--bad)"} /><text x="18" y="9" fill={t.ok ? "var(--ok)" : "var(--bad)"} fontWeight="700">{t.ok ? "ALLOWED" : "REFUSED"} · {t.note}</text></g>
        <text x="0" y="112" fill="var(--faint)">ENS permissions control ENS records only.</text>
      </g>
    </svg>
  );
}

/* ---------------- 0G ---------------- */
function OgScene({ q }: { q: number }) {
  const ask = seg(q, 0.02, 0.2), ladder = seg(q, 0.24, 0.5), cut = seg(q, 0.54, 0.74), log = seg(q, 0.76, 0.98);
  const rows = ["SAFE_STOP", "INSPECT", "CREDIT_STOP", "RUN"];
  const at = cut > 0.5 ? 0 : ladder > 0.45 ? 1 : 3;
  const note = cut > 0.5 ? "0G unreachable. No decision, so Safe stop. Nothing is guessed." : ladder > 0.8 ? "A later RUN answer cannot clear the hold." : ladder > 0.3 ? "AI answers INSPECT. The state moves up." : "";
  return (
    <svg viewBox="0 0 1000 400" className="h-full w-full" fontFamily={MONO} fontSize="12">
      {/* the call inside the decision loop */}
      <g transform="translate(0 20)">
        {["pulse window", "fixed checks", "0G call", "answer"].map((l, i) => { const on = ask * 4 > i; const last = i === 2 && cut > 0.1; return (
          <g key={l} transform={`translate(${i * 160} 0)`}>
            <Box x={0} y={0} w={132} h={46} on={on && !last}><text x="10" y="28" fill={on && !last ? "var(--bg)" : last ? "var(--bad)" : "var(--mute)"}>{l}</text></Box>
            {i < 3 && <line x1="132" x2="160" y1="23" y2="23" stroke="var(--fg)" />}
          </g>); })}
        {cut > 0.1 && <g><line x1="324" x2="462" y1="0" y2="46" stroke="var(--bad)" strokeWidth="2" /><line x1="462" x2="324" y1="0" y2="46" stroke="var(--bad)" strokeWidth="2" /></g>}
        <text y="74" fill="var(--mute)" opacity={ask}>qwen3.8-flash · request id kept with every decision</text>
      </g>
      {/* the ratchet */}
      <g transform="translate(0 130)" opacity={1 - seg(q, 0.76, 0.84)}>
        {rows.map((r, i) => { const on = at === i; return (
          <g key={r} transform={`translate(0 ${i * 40})`} opacity={seg(q, 0.2, 0.3)}>
            <rect width="300" height="34" fill={on ? (i === 0 ? "var(--bad)" : "var(--fg)") : "none"} stroke="var(--line)" /><text x="14" y="22" fill={on ? "var(--bg)" : "var(--mute)"}>{r}</text>
          </g>); })}
        <text x="330" y="22" fill="var(--accent)" fontWeight="700" opacity={seg(q, 0.3, 0.4)}>More caution only goes up.</text>
        <text x="330" y="46" fill="var(--fg)" opacity={seg(q, 0.3, 0.4)}>{note}</text>
        {cut > 0.5 && <g><rect x="330" y="80" width="14" height="14" fill="var(--bad)" /><text x="354" y="92" fill="var(--fg)">status LED solid · pulses still counted</text></g>}
      </g>
      {/* the episode log */}
      <g transform="translate(0 150)" opacity={seg(log, 0.1, 0.4)}>
        <text y="0" fill="var(--mute)">EPISODE LOG</text>
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={i * 24} y="14" width="16" height="16" fill="var(--fg)" />)}
        <line x1="120" x2="160" y1="22" y2="22" stroke="var(--fg)" /><Box x={160} y={0} w={180} h={44}><text x="12" y="27" fill="var(--fg)">0G Storage root</text></Box>
        <line x1="250" x2="250" y1="44" y2="84" stroke="var(--fg)" /><Box x={160} y={84} w={180} h={44}><text x="12" y="27" fill="var(--fg)">ENS · mohar.log</text></Box>
        <text y="170" fill="var(--fg)" fontWeight="700">Replay: 23 of 23 records match the chain.</text>
        <text y="190" fill="var(--mute)">A one-watt edit shows up as MISMATCH.</text>
      </g>
    </svg>
  );
}

export function Tracks() {
  return (
    <>
      <Track id="ef" no="01" sponsor="Ethereum Foundation" award="Best use of the Frame Transaction Alternative Mempool"
        use="A device holds no ETH. Its own one-time key authorises each transaction, a paymaster covers the fee from a quota, and only the alternative mempool will carry that shape."
        reqs={[
          { ask: "Submit a frame transaction through the alt mempool", did: "Four frames: account verifies the signature, paymaster approves, ledger records, paymaster settles. Mined on the public devnet with the account paying nothing.", proof: "ef-2-public.json · block 2010" },
          { ask: "Something only an alt mempool allows", did: "The canonical rules refuse the paymaster (StorageReadNonSender). The alt mempool admits the same bytes, and its rule-by-rule admission report is saved.", proof: "ef-2-public.json · ef-2-local-alt.json" },
          { ask: "Stay inside the validation budget", did: "Signature check uses 89,161 of 90,000 gas; the prefix totals exactly the 100,000 cap for an unstaked sender.", proof: "mechanism.md section 4, 8" },
          { ask: "Refuse what it should refuse", did: "Replay, over-quota, revoked device and unstaked paymaster are all rejected at submission, with the node's own message.", proof: "EF2-T5 to T9" },
        ]}>{(q) => <EfScene q={q} />}</Track>
      <Track id="ens" no="02" sponsor="ENS" award="Best use of ENSv2"
        use="A device's name is its identity. One name leads to its ledger, paymaster and key root, and each party may edit only its own records. The demo name is meter-001."
        reqs={[
          { ask: "ENS is central, not decoration", did: "The device name holds the ledger, paymaster, key root, policy and operator. The dashboard discovers them from the name.", proof: "ens-2.json · DEV8-T1" },
          { ask: "A live demo on Sepolia", did: "Identity page asks the live resolver if an edit would be accepted, from the maintenance key, the uploader key or a stranger, and shows the real answer.", proof: "ENS-3 · five live checks" },
          { ask: "No hard-coded values", did: "No account, ledger or paymaster address appears in the dashboard source. A mismatch between ENS and the account's root raises a warning.", proof: "DEV8-T1, T3" },
          { ask: "Say what ENS does not do", did: "ENS permissions control ENS records only. The devnet contracts are linked because clients read both chains.", proof: "mechanism.md 7c" },
        ]}>{(q) => <EnsScene q={q} />}</Track>
      <Track id="og" no="03" sponsor="0G" award="Physical AI: Agents with a Body"
        use="A real 0G model call sits inside the device's decision loop. Its answer can make the device more careful, and every episode is logged to 0G Storage."
        reqs={[
          { ask: "A 0G call inside the decision loop", did: "The ESP8266 calls qwen3.8-flash itself over TLS. A 0G INSPECT set a hold on the public ledger.", proof: "live-run-public.json" },
          { ask: "Episode log with a request ID per decision", did: "Every report carries its request ID. Reports are batched to 0G Storage; replay verifies proofs and matches 23 of 23 records.", proof: "0g-4.json" },
          { ask: "Safe stop if 0G is unreachable", did: "No valid answer means Safe stop with an empty request ID, and no code path invents a decision. Blocking 0G on the board is the one test still open.", proof: "0G3-T4 open · replay log" },
          { ask: "Real hardware", did: "Pico H, ESP8266, status LEDs and a power bank. Model chosen on 19 scenarios, 5 runs each, all correct, p95 1.2 s.", proof: "0g-1-qwen3.8-flash.json" },
        ]}>{(q) => <OgScene q={q} />}</Track>
    </>
  );
}
