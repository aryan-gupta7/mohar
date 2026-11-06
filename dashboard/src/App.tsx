import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Provider, useStore } from "./store";
import { Console } from "./pages/Console";
import { Overview } from "./pages/Overview";
import { Ledger, Identity, Activity } from "./pages/More";
import { Button, Card, H, Page, inputCls } from "./components/ui";
import { Segmented } from "./components/motion";
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

function Settings() {
  const { settings, setSettings, ens, chain, ids, refreshEns, resetMeter } = useStore();
  const [link, setLink] = useState(""), [note, setNote] = useState<string>(), [copied, setCopied] = useState(false);
  const f = (k: keyof typeof settings, label: string, ph?: string) => (
    <label className="block text-sm"><span className="text-mute">{label}</span><input value={settings[k] as string} placeholder={ph} onChange={(e) => setSettings({ [k]: e.target.value } as any)} className={`${inputCls} mt-1.5 font-mono text-xs`} /></label>
  );
  const apply = () => {
    try {
      const q = new URL(link.trim()).searchParams, p: any = {};
      for (const k of ["chainRpc", "manualLedger", "manualAccount", "manualPaymaster", "ensName", "forceManual"]) if (q.get(k)) p[k] = q.get(k);
      if (!Object.keys(p).length) return setNote("That link has no meter settings.");
      setSettings(p); setNote("Applied."); setLink("");
    } catch { setNote("That isn't a link."); }
  };
  const share = () => {
    const q = new URLSearchParams(); const s = settings as any;
    for (const k of ["chainRpc", "manualLedger", "manualAccount", "manualPaymaster"]) if (s[k]) q.set(k, s[k]);
    if (s.manualLedger) q.set("forceManual", "1");
    navigator.clipboard?.writeText(`${location.origin}${location.pathname}?${q}#overview`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  const ok = chain.status === "ok";
  return (
    <Page title="Connect" aside={<span className={`text-sm ${ok ? "text-ok" : chain.status === "error" ? "text-bad" : "text-mute"}`}>{ok ? `Connected · block ${chain.head}` : chain.status === "error" ? "Can't reach the chain" : chain.status === "loading" ? "Connecting…" : "Not connected"}</span>}>
      <Card>
        <H>Network</H>
        <Segmented id="net" options={NETS} value={NETS.find((n) => n.value === settings.chainRpc)?.value ?? ""} onChange={(v) => setSettings({ chainRpc: v })} />
        <div className="mt-4">{f("chainRpc", "RPC address")}</div>
        {chain.error && <div className="mt-2 text-xs text-bad">{chain.error}</div>}
      </Card>
      <Card>
        <H>Meter</H>
        <div className="flex gap-2"><input aria-label="Setup link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a dashboard link to fill everything in" className={inputCls} /><Button onClick={apply} disabled={!link}>Apply</Button></div>
        {note && <div className="mt-2 text-xs text-mute">{note}</div>}
        <div className="mt-5 grid gap-4 sm:grid-cols-3">{f("manualLedger", "Ledger", "0x…")}{f("manualAccount", "Account", "0x…")}{f("manualPaymaster", "Paymaster", "0x…")}</div>
        <label className="mt-4 flex items-center gap-2 text-sm text-mute"><input type="checkbox" checked={(settings as any).forceManual === "1"} onChange={(e) => setSettings({ forceManual: e.target.checked ? "1" : "" } as any)} />Use these addresses instead of the meter's name</label>
        <div className="mt-5 flex flex-wrap gap-2"><Button variant="ghost" onClick={resetMeter}>Reset to default meter</Button><Button variant="ghost" onClick={share}>{copied ? "Copied" : "Copy setup link"}</Button></div>
        <div className="mt-3 text-xs text-faint">Addresses in use: {ids.from === "none" ? "none" : ids.from === "ens" ? "from the name" : "entered above"}</div>
      </Card>
      <Card>
        <H>Name</H>
        <div className="flex gap-2"><div className="flex-1">{f("ensName", "Meter name on Sepolia")}</div><Button variant="ghost" onClick={refreshEns} className="self-end">Look up</Button></div>
        <div className="mt-2 text-xs text-faint">{ens.status === "ok" ? "Resolved" : ens.status === "error" ? ens.error : ens.status}</div>
      </Card>
    </Page>
  );
}

function Shell() {
  const [page, setPage] = useState<string>(location.hash.slice(1) || "overview");
  const s = useStore();
  useEffect(() => { const h = () => setPage(location.hash.slice(1) || "overview"); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  const go = (id: string) => { setPage(id); location.hash = id; };
  const el = { overview: <Overview />, console: <Console />, ledger: <Ledger />, identity: <Identity />, activity: <Activity />, settings: <Settings /> }[page] ?? <Overview />;
  const dark = s.settings.theme === "dark";
  const live = s.mode === "replay" ? "bg-warn" : s.mode === "live" || s.chain.status === "ok" ? "bg-ok" : s.chain.status === "error" ? "bg-bad" : "bg-faint";
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-6 px-4">
          <a href="#overview" onClick={() => go("overview")} className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"><span className="h-2.5 w-2.5 rounded-full bg-fg" />mohar</a>
          <nav aria-label="Pages" className="-mx-2 flex flex-1 gap-1 overflow-x-auto">
            {PAGES.map((p) => <button key={p.id} aria-current={page === p.id ? "page" : undefined} onClick={() => go(p.id)} className={`rounded-full px-3 py-1.5 text-sm transition-colors ${page === p.id ? "bg-fg/[.07] text-fg" : "text-mute hover:text-fg"}`}>{p.label}</button>)}
          </nav>
          <span title={s.mode === "replay" ? "Replay" : s.mode === "live" ? "Live hardware" : s.chain.status === "ok" ? "Chain connected" : s.chain.status === "error" ? "Chain unreachable" : "Not connected"} className={`h-2 w-2 shrink-0 rounded-full ${live}`} />
          <button aria-label="Toggle theme" onClick={() => s.setSettings({ theme: dark ? "light" : "dark" })} className="text-mute hover:text-fg">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>
      <main id="main-content" className="px-4 pb-20 pt-6">{el}</main>
    </div>
  );
}
export default function App() { return <Provider><TooltipProvider delayDuration={150}><Shell /></TooltipProvider></Provider>; }
