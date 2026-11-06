import { useState } from "react";
import { useStore } from "../store";
import { evOf, REASONS } from "../lib/events";
import { Long, Button, Card, Empty, ErrorBox, H, ModePill, Mono, Page, Row, Stat, Tag, fmtKwh, short, inputCls } from "../components/ui";
import { usePipeline } from "../components/Pipeline";
import { arrearsText, creditText, MODE } from "./Overview";
import { RECORDS, archiveOf } from "../lib/ens";
import { getReceipt } from "../lib/chain";
import { Permissions } from "./Permissions";

async function walletSend(to: string, data: string, value?: bigint) {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet found in this browser.");
  const [from] = await eth.request({ method: "eth_requestAccounts" });
  return eth.request({ method: "eth_sendTransaction", params: [{ from, to, data, ...(value ? { value: "0x" + value.toString(16) } : {}) }] });
}

export function Ledger() {
  const s = useStore(); const L = s.chain.ledger; const [msg, setMsg] = useState<string>(); const [amt, setAmt] = useState("100");
  if (s.ids.from === "none") return <Page title="Ledger"><Empty>No ledger known. Resolve a name or add a test ledger in Settings.</Empty></Page>;
  if (s.chain.status === "error" && !L) return <Page title="Ledger"><ErrorBox title="Cannot read the chain">{s.chain.error}</ErrorBox></Page>;
  if (!L) return <Page title="Ledger"><Empty>Reading the ledger…</Empty></Page>;
  const act = async (f: () => Promise<any>) => { setMsg(undefined); try { setMsg("Sent " + (await f())); } catch (e: any) { setMsg(e?.message ?? String(e)); } };
  const tops = s.chain.holds.filter((h) => h.kind === "TopUp").reverse(), holds = s.chain.holds.filter((h) => h.kind !== "TopUp").reverse();
  return (
    <Page title="Ledger" aside={<Tag k="Devnet" />}>
      {(L.arrears > 0n || L.ledgerMode === 2) && <Card><div className="text-sm font-medium text-warn">Credit exhausted</div><p className="mt-1 text-sm text-mute">Usage is still recorded and builds up as arrears. A top-up pays arrears first. Nothing is disconnected.</p></Card>}
      <div className="grid grid-cols-2 gap-8 px-1 sm:grid-cols-4">
        <Stat label="Credit" value={creditText(L)} unit="pulses" />
        <Stat label="Arrears" value={arrearsText(L)} unit="pulses" tone={L.arrears > 0n ? "text-warn" : ""} />
        <Stat label="Charged" value={L.tariff > 0n ? (L.earned / L.tariff).toString() : "—"} unit="pulses" />
        <Stat label="Quota left" value={s.chain.quota ? s.chain.quota.remaining : "—"} note={s.chain.quota ? `of ${s.chain.quota.daily} sponsored` : undefined} />
      </div>
      <Card>
        <H>Status</H>
        <Row k="Last report">#{L.lastSeq} · <ModePill mode={MODE[L.lastMode]} /></Row>
        <Row k="Inspection hold">{L.hold ? "Set. Only the operator can clear it." : "None"}</Row>
        <Row k="Tariff">{L.tariff.toString()} wei per pulse</Row>
      </Card>
      <Card>
        <H>Actions</H>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Pulses to add" value={amt} onChange={(e) => setAmt(e.target.value)} className={`${inputCls} w-24`} />
          <Button onClick={() => act(() => walletSend(s.ids.ledger!, "0xdc29f1de", BigInt(amt || "0") * L.tariff))}>Top up</Button>
          <Button variant="ghost" onClick={() => act(() => walletSend(s.ids.ledger!, "0x4687aa98"))}>Clear hold</Button>
        </div>
        {msg && <div className="mt-3 break-all text-xs text-mute">{msg}</div>}
        <div className="mt-3 text-xs text-faint">Uses your wallet on the Mohar devnet (chain 1337).</div>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card><H>Top-ups</H>{tops.length === 0 ? <Empty>None yet.</Empty> : tops.slice(0, 6).map((t, i) => <Row key={i} k={`Block ${t.block}`}>{t.args.amount.toString()} wei</Row>)}</Card>
        <Card><H>Holds</H>{holds.length === 0 ? <Empty>None yet.</Empty> : holds.slice(0, 6).map((t, i) => <Row key={i} k={`Block ${t.block}`}>{t.kind === "HoldSet" ? `Set by #${t.args.seq}` : "Cleared"}</Row>)}</Card>
      </div>
    </Page>
  );
}

export function Identity() {
  const s = useStore(); const E = s.ens;
  const root = E.data?.records["mohar.pq.root"]; const acct = s.chain.accountRoot;
  const match = root && acct ? root.toLowerCase() === acct.toLowerCase() : undefined;
  return (
    <Page title="Identity" aside={<Tag k="Sepolia" title="ENS lives on Sepolia; the meter's contracts live on the Mohar devnet" />}>
      {E.status === "loading" && <Empty>Resolving {s.settings.ensName}…</Empty>}
      {E.status === "error" && <ErrorBox title={`Could not resolve ${s.settings.ensName}`}>{E.error}</ErrorBox>}
      {E.data && (<>
        <Card>
          <H>{E.data.name}</H>
          <Row k="Account"><Mono>{E.data.account ?? "—"}</Mono></Row>
          {RECORDS.map((k) => { const v = E.data!.records[k] as string | undefined; return <Row key={k} k={k.replace("mohar.", "")}>{v ? (v.length > 90 && !v.startsWith("0x") && !v.startsWith("0g://") ? <Long text={v} /> : <Mono>{v}</Mono>) : <span className="text-faint">not set</span>}{k === "mohar.log" && archiveOf(v).archived && <> <Tag k="Archived" /></>}</Row>; })}
        </Card>
        <Card>
          <H right={match === true ? <span className="text-sm text-ok">Match</span> : match === false ? <span className="text-sm text-bad">Mismatch</span> : undefined}>Key check</H>
          <Row k="In ENS"><Mono>{short(root, 12, 8)}</Mono></Row>
          <Row k="In the account contract"><Mono>{short(acct, 12, 8)}</Mono></Row>
          <Row k="Reported by the device"><Mono>{short(s.deviceKey?.root, 12, 8)}</Mono></Row>
          {match === false && <p className="mt-3 text-sm text-bad">The ENS root differs from the contract. Don't trust this meter's identity until that is explained.</p>}
        </Card>
      </>)}
      <Permissions />
      <p className="px-1 text-xs text-faint">Signatures use an experimental, unaudited hash-based scheme with 256 one-time keys. The seed never leaves the ESP8266.</p>
    </Page>
  );
}

export function Activity() {
  const { s, cp, receipt, hash, confirmed, expected } = usePipeline();
  const [q, setQ] = useState(""), [open, setOpen] = useState<number>(), [rc, setRc] = useState<any>();
  const rows = s.chain.rows.slice().reverse().filter((r) => !q || JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v)).toLowerCase().includes(q.toLowerCase()));
  const e = (n: string) => evOf(cp, n); const dec = e("decision"), air = e("ai_response"), sd = e("sign_done"), sm = e("submitted");
  const stage = !cp ? "" : !sm ? "Preparing" : sm.result !== "ok" ? "Rejected" : !receipt ? "Submitted, waiting to be mined" : confirmed ? "Confirmed on-chain" : "Mined, waiting for the ledger";
  return (
    <Page title="Activity">
      {cp && (
        <Card>
          <H right={cp.source === "replay" ? <Tag k="Replay" /> : undefined}>Current report</H>
          <div className="flex items-center justify-between"><div className="text-xl font-semibold">{stage}</div><ModePill mode={dec?.mode} /></div>
          <div className="mt-3">
            <Row k="Sequence">#{expected ?? "—"}</Row>
            <Row k="Why">{dec ? REASONS[dec.reason] : "—"}</Row>
            <Row k="AI">{air ? `${air.answer} · ${air.latencyMs} ms` : "not asked"}</Row>
            <Row k="Signed with">{sd?.result === "OK" ? `key #${sd.leaf} (${sd.leavesLeft} left)` : sd ? sd.result : "—"}</Row>
            <Row k="Transaction"><Mono>{hash ?? "—"}</Mono></Row>
            {(receipt?.frameReceipts ?? []).length > 0 && <Row k="Frames">{["account", "paymaster", "ledger", "settle"].map((n, i) => `${n} ${receipt.frameReceipts[i]?.status === "0x1" ? "ok" : "failed"}`).join(" · ")}</Row>}
          </div>
        </Card>
      )}
      <input aria-label="Search" placeholder="Search reports" value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} />
      {s.chain.status === "error" && <ErrorBox title="Cannot read the chain">{s.chain.error}</ErrorBox>}
      {rows.length === 0 ? <Empty>No reports on the ledger.</Empty> : (
        <div className="surface divide-y divide-line overflow-hidden">
          {rows.map((r) => (
            <div key={r.seq}>
              <button className="flex w-full flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3.5 text-left hover:bg-fg/[.03]" onClick={async () => { setOpen(open === r.seq ? undefined : r.seq); setRc(undefined); if (open !== r.seq) setRc(await getReceipt(s.settings.chainRpc, r.tx)); }}>
                <b className="num w-12">#{r.seq}</b><ModePill mode={MODE[r.mode]} /><span className="text-sm text-mute">{fmtKwh(r.total)} kWh</span><span className="ml-auto text-xs text-faint">{r.time ? new Date(r.time * 1000).toLocaleString() : `block ${r.block}`}</span>
              </button>
              {open === r.seq && (
                <div className="px-5 pb-4">
                  <Row k="Why">{REASONS[r.reason] ?? r.reason}</Row>
                  <Row k="New usage">{r.usage} pulses · charged {r.charged.toString()} wei · owed {r.owed.toString()} wei</Row>
                  <Row k="Window">{r.sensors.valid} valid · {r.sensors.glitches} glitches · {r.sensors.avgW} W avg · {r.sensors.peakW} W peak</Row>
                  <Row k="AI request"><Mono>{r.requestId || "none"}</Mono></Row><Row k="Transaction"><Mono>{r.tx}</Mono></Row>
                  <Row k="Frames">{rc?.frameReceipts ? ["account", "paymaster", "ledger", "settle"].map((n, i) => `${n} ${rc.frameReceipts[i]?.status === "0x1" ? "ok" : "failed"}`).join(" · ") : "loading…"}</Row>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
