import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "../store";
import { evOf, REASONS } from "../lib/events";
import { Badge, Card, Empty, ErrorBox, H, ModePill, Mono, Row, fmtKwh, short, kwh } from "../components/ui";
import { usePipeline } from "../components/Pipeline";
import { arrearsText, creditText } from "./Overview";
import { simulateSetText, RECORDS, ENS_FALLBACKS, archiveOf } from "../lib/ens";
import { getReceipt } from "../lib/chain";
import { encodeCall } from "../lib/abi.js";
import { Permissions } from "./Permissions";

const MODE = ["RUN", "INSPECT", "CREDIT_STOP", "SAFE_STOP"];
const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12 } };

export function AI() {
  const { s, cp } = usePipeline(); const e = (n: string) => evOf(cp, n);
  const air = e("ai_response"), aq = e("ai_request"), dec = e("decision"), lc = e("local_check"), ss = e("sign_start"), sm = e("submitted"), w = e("window");
  const steps = [["Meter window collected", w], ["Fixed checks run", lc], ["0G inference requested", aq], ["0G answered", air], ["State decided", dec], ["Report signed", e("sign_done")], ["Report submitted", sm]] as const;
  const history = s.chain.rows.filter((r) => r.requestId || r.reason === 20).slice(-12).reverse();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">AI insights</h1>
      <Card>
        <H right={<Badge k="AI RESPONSE" />}>Latest assessment</H>
        <div className="grid sm:grid-cols-2 gap-x-8">
          <div><Row k="Provider">0G Private Computer</Row><Row k="Model">qwen3.8-flash</Row><Row k="Recommendation">{air ? air.answer : "—"}</Row><Row k="Request ID"><Mono>{air?.rid || "—"}</Mono></Row></div>
          <div><Row k="Latency">{air ? `${air.latencyMs} ms` : "—"}</Row><Row k="Confidence">Not provided</Row><Row k="Reason">Policy-based yes/no: this model returns one word, not an explanation</Row><Row k="Final firmware state"><ModePill mode={dec?.mode} /></Row></div>
        </div>
        {dec && <div className="mt-3 rounded-xl bg-mid p-3 text-sm">AI side: <b>{air?.answer ?? "not asked"}</b> · Fixed check: <b>{lc?.result ?? "—"}</b> · Ledger hold: <b>{dec.ledgerHold ? "set" : "none"}</b> · Ledger view: <b>{MODE[dec.ledgerMode]}</b> → Final: <b>{dec.mode}</b><div className="text-xs text-mute mt-1">{REASONS[dec.reason]}. The AI can only add caution; it can’t clear a hold or override credit.</div></div>}
      </Card>
      <Card>
        <H>Decision timeline (real device events)</H>
        {!cp ? <Empty>No checkpoint yet.</Empty> : <ol className="space-y-1.5 text-sm">{steps.map(([l, ev]) => <li key={l} className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${ev ? "bg-lime" : "bg-line"}`} /><span className={ev ? "" : "text-mute"}>{l}</span><span className="ml-auto text-xs text-mute">{ev ? new Date(ev.at).toLocaleTimeString() : "not yet"}{ev && cp.source === "replay" ? " (replay)" : ""}</span></li>)}</ol>}
        {ss && !sm && <div className="mt-2 text-xs text-mute">Signing in progress…</div>}
      </Card>
      <Card><H right={<Badge k="ON-CHAIN CONFIRMED" />}>Decision history from the ledger</H>
        {history.length === 0 ? <Empty>No reports carrying an AI request ID yet.</Empty> : history.map((r) => <Row key={r.seq} k={`#${r.seq}`}><ModePill mode={MODE[r.mode]} /> <span className="text-xs text-mute ml-2">{REASONS[r.reason] ?? r.reason}</span> {r.requestId ? <Mono className="ml-2">{short(r.requestId, 10, 4)}</Mono> : <span className="text-xs text-mute ml-2">no decision made</span>}</Row>)}
      </Card>
    </div>
  );
}

async function walletSend(to: string, data: string, value?: bigint) {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet found in this browser.");
  const [from] = await eth.request({ method: "eth_requestAccounts" });
  return eth.request({ method: "eth_sendTransaction", params: [{ from, to, data, ...(value ? { value: "0x" + value.toString(16) } : {}) }] });
}

export function Ledger() {
  const s = useStore(); const L = s.chain.ledger; const [msg, setMsg] = useState<string>(); const [amt, setAmt] = useState("100");
  if (s.ids.from === "none") return <Empty>No ledger known. Resolve a name or add a test ledger in Settings.</Empty>;
  if (s.chain.status === "error" && !L) return <ErrorBox title="Cannot read the chain">{s.chain.error}</ErrorBox>;
  if (!L) return <Empty>Reading the ledger…</Empty>;
  const act = async (f: () => Promise<any>) => { setMsg(undefined); try { setMsg("Sent: " + (await f())); } catch (e: any) { setMsg(e?.message ?? String(e)); } };
  const tops = s.chain.holds.filter((h) => h.kind === "TopUp").reverse(), hold = s.chain.holds.filter((h) => h.kind !== "TopUp").reverse();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Credit and ledger</h1>
      {L.arrears > 0n || L.ledgerMode === 2 ? (
        <Card className="border-sky/40"><div className="font-semibold">Credit exhausted · CREDIT_STOP</div><p className="text-sm text-mute mt-1">Your available credit has run out. The meter keeps recording consumption, and it accumulates as arrears. A top-up pays the arrears first; anything left becomes credit. This is a ledger state, not an electricity disconnection.</p></Card>
      ) : null}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><div className="text-xs text-mute">Credit</div><div className="metric text-3xl mt-2">{creditText(L).split(" ")[0]}<span className="text-sm text-mute ml-1"> pulses</span></div><div className="text-xs text-mute mt-1">demo credit · {L.credit.toString()} wei</div></Card>
        <Card><div className="text-xs text-mute">Arrears</div><div className="metric text-3xl mt-2">{arrearsText(L).split(" ")[0]}<span className="text-sm text-mute ml-1"> pulses</span></div></Card>
        <Card><div className="text-xs text-mute">Charged so far</div><div className="metric text-3xl mt-2">{L.tariff > 0n ? (L.earned / L.tariff).toString() : "—"}<span className="text-sm text-mute ml-1"> pulses</span></div></Card>
        <Card><div className="text-xs text-mute">Tariff</div><div className="metric text-xl mt-2">{L.tariff.toString()} wei</div><div className="text-xs text-mute mt-1">per pulse (devnet ETH, not rupees)</div></Card>
      </div>
      <Card><H>State</H>
        <Row k="Last report">#{L.lastSeq} · <ModePill mode={MODE[L.lastMode]} /></Row>
        <Row k="Inspection hold">{L.hold ? "Set — only the operator can clear it" : "None"}</Row>
        <Row k="Sponsored transactions left (paymaster quota)">{s.chain.quota ? `${s.chain.quota.remaining} of ${s.chain.quota.daily}` : "unknown"}</Row>
      </Card>
      <Card><H>Operator actions (through your wallet)</H>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Pulses to add" value={amt} onChange={(e) => setAmt(e.target.value)} className="w-24 rounded-xl border border-line bg-mid px-3 py-2 text-sm" />
          <button onClick={() => act(() => walletSend(s.ids.ledger!, "0xdc29f1de", BigInt(amt || "0") * L.tariff))} className="rounded-full bg-lime px-4 py-2 text-sm font-bold text-black">Top up {amt} pulses</button>
          <button onClick={() => act(() => walletSend(s.ids.ledger!, "0x4687aa98"))} className="rounded-full border border-line px-4 py-2 text-sm">Clear hold (operator only)</button>
        </div>
        {msg && <div className="mt-2 text-xs text-mute break-all">{msg}</div>}
        <p className="mt-2 text-xs text-mute">Needs a wallet connected to the Mohar devnet (chain 1337). The ledger itself decides who may clear a hold.</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><H>Top-ups</H>{tops.length === 0 ? <Empty>None in the recent history.</Empty> : tops.slice(0, 8).map((t, i) => <Row key={i} k={`block ${t.block}`}>{t.args.amount.toString()} wei, paid {t.args.paidArrears.toString()} wei of arrears</Row>)}</Card>
        <Card><H>Holds</H>{hold.length === 0 ? <Empty>None in the recent history.</Empty> : hold.slice(0, 8).map((t, i) => <Row key={i} k={`block ${t.block}`}>{t.kind === "HoldSet" ? `Hold set by report #${t.args.seq}` : "Hold cleared by the operator"}</Row>)}</Card>
      </div>
    </div>
  );
}

export function Identity() {
  const s = useStore(); const E = s.ens; const [from, setFrom] = useState(""), [key, setKey] = useState("mohar.maintenance.status"), [val, setVal] = useState("serviced"), [res, setRes] = useState<{ ok: boolean; message: string }>();
  const root = E.data?.records["mohar.pq.root"]; const acct = s.chain.accountRoot;
  const match = root && acct ? root.toLowerCase() === acct.toLowerCase() : undefined;
  const dev = s.deviceKey?.root;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">Identity and access</h1><Badge k="SEPOLIA" /><span className="text-xs text-mute">ENS records live on Sepolia; the meter’s contracts are on the Mohar devnet. Neither chain reads the other: this page does.</span></div>
      {E.status === "loading" && <Empty>Resolving {s.settings.ensName} on Sepolia…</Empty>}
      {E.status === "error" && <ErrorBox title={`Could not resolve ${s.settings.ensName}`}>{E.error}</ErrorBox>}
      {E.data && (<>
        <Card><H>{E.data.name}</H><Row k="Resolver"><Mono>{E.data.resolver}</Mono></Row><Row k="Account (chain 1337)"><Mono>{E.data.account ?? "—"}</Mono></Row>
          {RECORDS.map((k) => <Row key={k} k={k}>{E.data!.records[k] ? <Mono>{E.data!.records[k]}</Mono> : <span className="text-mute">not set</span>}{k === "mohar.log" && (archiveOf(E.data!.records[k]).archived ? <> <Badge k="ARCHIVED" /></> : <span className="ml-2 text-xs text-warn" data-testid="archive-state">not archived yet</span>)}</Row>)}</Card>
        <Card><H>Key consistency</H>
          <Row k="Root published in ENS"><Mono>{short(root, 12, 8)}</Mono></Row><Row k="Root held by the account contract"><Mono>{short(acct, 12, 8)}</Mono></Row><Row k="Root the device reports"><Mono>{short(dev, 12, 8)}</Mono></Row>
          {match === false && <div className="mt-2 rounded-xl bg-bad/15 p-3 text-sm text-bad">Warning: the root in ENS does not match the account contract. Do not trust this meter’s identity until it is explained.</div>}
          {match === true && <div className="mt-2 text-sm text-lime">ENS and the account contract agree.</div>}
        </Card>
      </>)}
      <Permissions />
      <Card><H>Security notes</H><Row k="Signature scheme">Hash-based, WOTS-like, custom — <b>experimental and unaudited</b></Row><Row k="Keys">256 one-time keys; the seed never leaves the ESP8266</Row><Row k="Physical limit">Flash on this chip is readable by someone holding the board</Row><Row k="Revocation">The fleet owner can revoke the device’s sponsorship at any time</Row></Card>
    </div>
  );
}

export function Audit() {
  const s = useStore(); const [q, setQ] = useState(""), [open, setOpen] = useState<number>(), [rc, setRc] = useState<any>();
  const rows = s.chain.rows.slice().reverse().filter((r) => !q || JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v)).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Activity and audit</h1>
      <input aria-label="Search" placeholder="Search by sequence, hash, request ID, state…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-xl border border-line bg-mid px-3 py-2 text-sm" />
      {s.chain.status === "error" && <ErrorBox title="Cannot read the chain">{s.chain.error}</ErrorBox>}
      {rows.length === 0 ? <Empty>No reports found on the ledger.</Empty> : rows.map((r) => (
        <Card key={r.seq} className="cursor-pointer" onClick={async () => { setOpen(open === r.seq ? undefined : r.seq); setRc(undefined); if (open !== r.seq) setRc(await getReceipt(s.settings.chainRpc, r.tx)); }}>
          <div className="flex flex-wrap items-center gap-3"><b>#{r.seq}</b><ModePill mode={MODE[r.mode]} /><span className="text-sm">{r.total} pulses · {fmtKwh(r.total)} kWh</span><span className="text-xs text-mute ml-auto">{r.time ? new Date(r.time * 1000).toLocaleString() : `block ${r.block}`}</span></div>
          {open === r.seq && (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <Row k="Why">{REASONS[r.reason] ?? r.reason}</Row><Row k="New usage / charged / owed">{r.usage} pulses · {r.charged.toString()} wei · {r.owed.toString()} wei</Row>
              <Row k="Window (from the report’s sensors word)">{r.sensors.valid} valid · {r.sensors.glitches} glitches · {r.sensors.stuck} stuck · {r.sensors.avgW} W avg · {r.sensors.peakW} W peak · {(r.sensors.windowMs / 1000).toFixed(0)} s</Row>
              <Row k="AI request ID"><Mono>{r.requestId || "none"}</Mono></Row><Row k="Transaction"><Mono>{r.tx}</Mono></Row>
              <Row k="Frames">{rc?.frameReceipts ? ["account", "paymaster", "ledger", "settle"].map((n, i) => `${n}: ${rc.frameReceipts[i]?.status === "0x1" ? "ok" : "failed"}`).join(" · ") : "loading…"}</Row>
              <Row k="Verification">Rebuilt from the ledger’s Report event and the transaction receipt <Badge k="ON-CHAIN CONFIRMED" /></Row>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export function Usage() {
  const s = useStore(); const [range, setRange] = useState<"all" | "today" | "7d" | "30d">("all");
  const secs = { all: 1e12, today: 86400, "7d": 7 * 86400, "30d": 30 * 86400 }[range]; const nowS = Math.floor(s.now / 1000);
  const rows = s.chain.rows.filter((r) => r.time && nowS - r.time <= secs);
  const data = rows.map((r) => ({ time: new Date(r.time! * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), kwh: Number(kwh(r.total).toFixed(4)), usage: Number((r.usage / 3200 * 1000).toFixed(1)), avgW: r.sensors.avgW }));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Usage</h1>
      <div className="flex gap-2">{(["all", "today", "7d", "30d"] as const).map((r) => <button key={r} onClick={() => setRange(r)} className={`rounded-full border px-4 py-1.5 text-sm ${range === r ? "border-lime bg-lime/10" : "border-line"}`}>{r === "all" ? "All recorded" : r === "today" ? "Today" : r === "7d" ? "7 days" : "30 days"}</button>)}</div>
      {data.length < 2 ? <Empty>Not enough confirmed reports in this period to draw a trend. Each point is one on-chain report.</Empty> : (<>
        <Card><H right={<Badge k="ON-CHAIN CONFIRMED" />}>Cumulative energy (kWh)</H><div className="h-56"><ResponsiveContainer><LineChart data={data}><CartesianGrid stroke="var(--line)" strokeDasharray="3 3" /><XAxis dataKey="time" stroke="var(--mute)" fontSize={11} /><YAxis stroke="var(--mute)" fontSize={11} width={50} /><Tooltip {...tip} /><Line dataKey="kwh" stroke="#D7FEFA" dot={false} /></LineChart></ResponsiveContainer></div></Card>
        <Card><H>Energy added per report (Wh) and average power</H><div className="h-52"><ResponsiveContainer><BarChart data={data}><CartesianGrid stroke="var(--line)" strokeDasharray="3 3" /><XAxis dataKey="time" stroke="var(--mute)" fontSize={11} /><YAxis stroke="var(--mute)" fontSize={11} width={50} /><Tooltip {...tip} /><Bar dataKey="usage" name="Wh" fill="#7fb8b2" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      </>)}
      <p className="text-xs text-mute">Cost isn’t shown: the ledger’s credit is devnet ETH (“demo credit”), and no rupee tariff is defined. No forecast is shown without enough history.</p>
    </div>
  );
}
