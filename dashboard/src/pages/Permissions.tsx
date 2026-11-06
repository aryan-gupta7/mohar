// ENS-3: "Who can change what". A table of records vs roles, and a Try-this-edit control that asks the LIVE Sepolia
// resolver (eth_call, from the chosen account) whether it would accept the edit, and shows the contract's real answer.
// Nothing is sent and no key is involved. If a wallet is present it can send the real edit, signed by the wallet.
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Button, Card, H, Mono, Tag, inputCls } from "../components/ui";
import { ENS, ENS_FALLBACKS } from "../lib/ens";
import { ethCall, RpcDead, RpcError, encodeCall, dnsEncode, explainRevert } from "../lib/abi.js";

type Persona = { id: string; label: string; address: string };
const POLICY = "The owner's operating policy";
// Which role may edit which record (from ENS-2's setter roles). Everything else is owner-only.
const TABLE: { key: string; who: string[]; why: string }[] = [
  { key: "mohar.maintenance.status", who: ["maintenance", "owner"], why: "set for the maintenance provider" },
  { key: "mohar.log", who: ["uploader", "owner"], why: "set for the 0G log uploader" },
  { key: "mohar.pq.root", who: ["owner"], why: "the device's cryptographic root: owner only" },
  { key: "mohar.policy", who: ["owner"], why: POLICY + ": owner only" },
  { key: "mohar.ledger", who: ["owner"], why: "where the meter's contracts are: owner only" },
];
const PRESETS: { label: string; who: string; key: string }[] = [
  { label: "Maintenance → maintenance status", who: "maintenance", key: "mohar.maintenance.status" },
  { label: "Maintenance → cryptographic root", who: "maintenance", key: "mohar.pq.root" },
  { label: "Uploader → 0G log", who: "uploader", key: "mohar.log" },
  { label: "Uploader → operating policy", who: "uploader", key: "mohar.policy" },
  { label: "Stranger → maintenance status", who: "stranger", key: "mohar.maintenance.status" },
];

async function simulate(resolver: string, name: string, key: string, value: string, from: string) {
  const data = encodeCall("setText(bytes,string,string)", [dnsEncode(name), key, value]);
  let last: any;
  for (let i = 0; i < 4; i++) {            // public RPCs are sometimes stale or drop a call: try other endpoints
    try {
      await ethCall(ENS_FALLBACKS[i % ENS_FALLBACKS.length], resolver, data, from);
      return { ok: true, selector: "", message: "Accepted: the resolver would let this account make this edit." };
    } catch (e: any) {
      if (e instanceof RpcError) {
        const d = typeof e.data === "string" ? e.data : (e.data as any)?.data;
        if (d && d !== "0x") return { ok: false, selector: String(d).slice(0, 10), message: explainRevert(d) };
        last = e;
      } else last = e;
    }
  }
  if (last instanceof RpcDead) throw last;
  return { ok: false, selector: "", message: "The resolver reverted without a reason." };
}

export function Permissions() {
  const s = useStore(); const E = s.ens.data;
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [who, setWho] = useState("maintenance"), [key, setKey] = useState("mohar.maintenance.status"), [val, setVal] = useState("inspected on site");
  const [res, setRes] = useState<{ ok: boolean; selector: string; message: string; at: string }>();
  const [busy, setBusy] = useState(false), [tx, setTx] = useState<string>();
  const [wallet, setWallet] = useState<string>();
  useEffect(() => { fetch("demo-roles.json").then((r) => r.json()).then((j) => setPersonas(j.personas)).catch(() => setPersonas([])); }, []);
  const from = personas.find((p) => p.id === who)?.address ?? "";
  const run = async (w = who, k = key) => {
    const a = personas.find((p) => p.id === w)?.address; if (!E || !a) return;
    setBusy(true); setTx(undefined); setRes(undefined); // never leave the previous answer on screen while a new question is being asked
    try { const r = await simulate(E.resolver, E.name, k, val, a); setRes({ ...r, at: new Date().toLocaleTimeString() }); }
    catch (e: any) { setRes({ ok: false, selector: "", message: "Cannot reach Sepolia: " + e.message, at: new Date().toLocaleTimeString() }); }
    setBusy(false);
  };
  const eth = (typeof window !== "undefined" ? (window as any).ethereum : undefined);
  const connect = async () => {
    const a = await eth.request({ method: "eth_requestAccounts" });
    try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + ENS.chainId.toString(16) }] }); } catch { /* the user may stay on another chain; the check below says so */ }
    setWallet(a[0]);
  };
  const sendReal = async () => {
    if (!E || !wallet) return; setBusy(true); setRes(undefined);
    try {
      const r = await simulate(E.resolver, E.name, key, val, wallet);
      setRes({ ...r, at: new Date().toLocaleTimeString() });
      if (!r.ok) { setBusy(false); return; }            // the wallet's account is not permitted: do not even ask it to sign
      const data = encodeCall("setText(bytes,string,string)", [dnsEncode(E.name), key, val]);
      setTx(await eth.request({ method: "eth_sendTransaction", params: [{ from: wallet, to: E.resolver, data }] }));
    } catch (e: any) { setRes({ ok: false, selector: "", message: "Wallet: " + (e.message ?? e), at: new Date().toLocaleTimeString() }); }
    setBusy(false);
  };
  return (
    <Card>
      <H right={<Tag k="Sepolia" />}>Who can change what</H>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-faint"><th className="py-1 pr-3 font-normal">Record</th>{["Owner", "Maintenance", "Uploader", "Stranger"].map((h) => <th key={h} className="px-2 font-normal">{h}</th>)}</tr></thead>
        <tbody>{TABLE.map((r) => <tr key={r.key} className="border-t border-line"><td className="py-2.5 pr-3"><Mono>{r.key.replace("mohar.", "")}</Mono></td>
          {["owner", "maintenance", "uploader", "stranger"].map((p) => <td key={p} className="px-2" aria-label={`${p}: ${r.who.includes(p) ? "may edit" : "may not edit"}`}>{r.who.includes(p) ? <span className="text-ok">●</span> : <span className="text-faint">–</span>}</td>)}</tr>)}</tbody>
      </table></div>

      <div className="mt-6 text-sm font-medium">Try an edit</div>
      <div className="mt-3 flex flex-wrap gap-2">{PRESETS.map((p) => <button key={p.label} disabled={!E || busy} onClick={() => { setWho(p.who); setKey(p.key); run(p.who, p.key); }} className="rounded-full px-3 py-1.5 text-xs shadow-[inset_0_0_0_1px_var(--line)] hover:bg-fg/5 disabled:opacity-40">{p.label}</button>)}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select aria-label="Account to test as" value={who} onChange={(e) => setWho(e.target.value)} className={inputCls}>{personas.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <select aria-label="Record" value={key} onChange={(e) => setKey(e.target.value)} className={inputCls}>{TABLE.map((t) => <option key={t.key}>{t.key}</option>)}</select>
        <input aria-label="New value" value={val} onChange={(e) => setVal(e.target.value)} className={inputCls} />
      </div>
      <Button disabled={!E || busy || !from} onClick={() => run()} className="mt-3">{busy ? "Asking the contract…" : "Try this edit"}</Button>
      {res && <div role="status" className={`mt-4 text-sm ${res.ok ? "text-ok" : "text-bad"}`} data-testid="edit-result">
        <b>{res.ok ? "Allowed" : "Rejected"}</b> · {res.message}{res.selector && <> <Mono>{res.selector}</Mono></>}
        <div className="mt-1 text-xs text-faint">Simulated on Sepolia at {res.at}. Nothing is sent.</div></div>}
      {eth && <div className="mt-6 border-t border-line pt-4">
        <div className="text-sm font-medium">Send it from your wallet</div>
        {!wallet ? <Button variant="ghost" onClick={connect} className="mt-2">Connect wallet</Button>
          : <div className="mt-2 flex flex-wrap items-center gap-2"><Mono>{wallet}</Mono><Button disabled={busy} onClick={sendReal}>Send edit</Button></div>}
        {tx && <div className="mt-2 text-sm">Sent <Mono>{tx}</Mono></div>}
      </div>}
    </Card>
  );
}
