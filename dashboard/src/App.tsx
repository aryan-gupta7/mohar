import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Provider, useStore } from "./store";
import { Console } from "./pages/Console";
import { Overview } from "./pages/Overview";
import { Ledger, Identity, Activity } from "./pages/More";
import { Button, Card, H, Page, inputCls } from "./components/ui";
import { Segmented } from "./components/motion";
import { Landing } from "./landing/Landing";
import { TooltipProvider } from "./components/ui/tooltip";

const PAGES = [
  { id: "overview", label: "Overview" },
  { id: "console", label: "Console" },
  { id: "ledger", label: "Ledger" },
  { id: "identity", label: "Identity" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Connect" },
];

const NETS = [{ value: "https://altmempool.forshtat.com", label: "EF devnet" }, { value: "http://127.0.0.1:18545", label: "Local chain" }];

type Draft = { chainRpc: string; manualLedger: string; manualAccount: string; manualPaymaster: string; forceManual: string };

function Settings() {
  const { settings, setSettings, ens, chain, ids, refreshEns } = useStore();
  const [d, setD] = useState<Draft>({ chainRpc: settings.chainRpc, manualLedger: settings.manualLedger, manualAccount: settings.manualAccount, manualPaymaster: settings.manualPaymaster, forceManual: (settings as any).forceManual ?? "" });
  const [link, setLink] = useState(""), [note, setNote] = useState<string>(), [copied, setCopied] = useState(false);
  // The fields are prefilled from public/meter.json when nothing is set yet. Nothing is applied until Connect is pressed.
  useEffect(() => {
    if (settings.manualLedger) return;
    fetch("meter.json", { cache: "no-store" }).then((r) => r.json()).then((j) => setD((x) => (x.manualLedger ? x : { ...x, ...j }))).catch(() => {});
  }, []); // eslint-disable-line
  const field = (k: keyof Draft, label: string, ph?: string) => (
    <label className="block text-sm"><span className="text-mute">{label}</span><input value={d[k]} placeholder={ph} onChange={(e) => setD({ ...d, [k]: e.target.value })} className={`${inputCls} mt-1.5 font-mono text-xs`} /></label>
  );
  const apply = () => {
    try {
      const q = new URL(link.trim()).searchParams, p: any = {};
      for (const k of ["chainRpc", "manualLedger", "manualAccount", "manualPaymaster", "forceManual"]) if (q.get(k)) p[k] = q.get(k);
      if (!Object.keys(p).length) return setNote("That link has no meter settings.");
      setD({ ...d, ...p }); setNote("Filled in. Press Connect."); setLink("");
    } catch { setNote("That isn't a link."); }
  };
  const connect = () => { setSettings({ ...d, forceManual: d.manualLedger ? "1" : d.forceManual } as any); setNote("Connecting…"); };
  const share = () => {
    const q = new URLSearchParams(); for (const [k, v] of Object.entries(d)) if (v) q.set(k, v);
    navigator.clipboard?.writeText(`${location.origin}${location.pathname}?${q}#overview`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  const ok = chain.status === "ok";
  return (
    <Page title="Connect" aside={<span className={`text-sm ${ok ? "text-ok" : chain.status === "error" ? "text-bad" : "text-mute"}`}>{ok ? `Connected · block ${chain.head}` : chain.status === "error" ? "Can't reach the chain" : chain.status === "loading" ? "Connecting…" : "Not connected"}</span>}>
      <Card>
        <H>Network</H>
        <Segmented id="net" options={NETS} value={NETS.find((n) => n.value === d.chainRpc)?.value ?? ""} onChange={(v) => setD({ ...d, chainRpc: v })} />
        <div className="mt-4">{field("chainRpc", "RPC address")}</div>
      </Card>
      <Card>
        <H>Meter</H>
        <div className="grid gap-4 sm:grid-cols-3">{field("manualLedger", "Ledger", "0x…")}{field("manualAccount", "Account", "0x…")}{field("manualPaymaster", "Paymaster", "0x…")}</div>
        <div className="mt-5 flex flex-wrap items-center gap-2"><Button onClick={connect} disabled={!d.manualLedger || !d.chainRpc}>Connect</Button><Button variant="ghost" onClick={share}>{copied ? "Copied" : "Copy link"}</Button></div>
        {chain.error && <div className="mt-3 text-xs text-bad">{chain.error}</div>}
        {note && <div className="mt-3 text-xs text-mute">{note}</div>}
        <div className="mt-5 flex gap-2"><input aria-label="Setup link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a dashboard link" className={inputCls} /><Button variant="ghost" onClick={apply} disabled={!link}>Fill in</Button></div>
        <div className="mt-3 text-xs text-faint">Addresses in use: {ids.from === "none" ? "none" : ids.from === "ens" ? "from the meter's name" : "entered here"}</div>
      </Card>
      <Card>
        <H>Name</H>
        <div className="flex gap-2"><label className="block flex-1 text-sm"><span className="text-mute">Meter name on Sepolia</span><input value={settings.ensName} onChange={(e) => setSettings({ ensName: e.target.value })} className={`${inputCls} mt-1.5 font-mono text-xs`} /></label><Button variant="ghost" onClick={refreshEns} className="self-end">Look up</Button></div>
        <div className="mt-2 text-xs text-faint">{ens.status === "ok" ? "Resolved" : ens.status === "error" ? ens.error : ens.status}</div>
      </Card>
    </Page>
  );
}

function Shell() {
  const [page, setPage] = useState<string>(location.hash.slice(1));
  const s = useStore();
  useEffect(() => { const h = () => setPage(location.hash.slice(1)); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  const go = (id: string) => { setPage(id); location.hash = id; };
  if (!page) return <Landing />;
  const el = { overview: <Overview />, console: <Console />, ledger: <Ledger />, identity: <Identity />, activity: <Activity />, settings: <Settings /> }[page] ?? <Overview />;
  const dark = s.settings.theme === "dark";
  const live = s.mode === "replay" ? "bg-warn" : s.mode === "live" || s.chain.status === "ok" ? "bg-ok" : s.chain.status === "error" ? "bg-bad" : "bg-faint";
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-6 px-4">
          <a href="#" onClick={(e) => { e.preventDefault(); history.pushState(null, "", location.pathname + location.search); setPage(""); window.scrollTo(0, 0); }} className="flex items-center gap-2 font-mono text-[12px] font-medium uppercase tracking-[0.14em]"><span className="h-2.5 w-2.5 bg-accent" />Mohar</a>
          <nav aria-label="Pages" className="-mx-2 flex flex-1 gap-1 overflow-x-auto">
            {PAGES.map((p) => <button key={p.id} aria-current={page === p.id ? "page" : undefined} onClick={() => go(p.id)} className={`border-b-2 px-3 py-2 font-mono text-[12px] uppercase tracking-[0.08em] transition-colors ${page === p.id ? "border-accent text-fg" : "border-transparent text-mute hover:text-fg"}`}>{p.label}</button>)}
          </nav>
          <span title={s.mode === "replay" ? "Replay" : s.mode === "live" ? "Live hardware" : s.chain.status === "ok" ? "Chain connected" : s.chain.status === "error" ? "Chain unreachable" : "Not connected"} className={`h-2 w-2 shrink-0 ${live}`} />
          <button aria-label="Toggle theme" onClick={() => s.setSettings({ theme: dark ? "light" : "dark" })} className="text-mute hover:text-fg">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>
      <main id="main-content" className="px-4 pb-20 pt-6">{el}</main>
    </div>
  );
}
export default function App() { return <Provider><TooltipProvider delayDuration={150}><Shell /></TooltipProvider></Provider>; }
