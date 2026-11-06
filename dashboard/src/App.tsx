import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Provider, useStore } from "./store";
import { Console } from "./pages/Console";
import { Overview } from "./pages/Overview";
import { Ledger, Identity, Activity } from "./pages/More";
import { Button, Card, H, Page, Tag, inputCls } from "./components/ui";
import { TooltipProvider } from "./components/ui/tooltip";

const PAGES = [
  { id: "overview", label: "Overview" },
  { id: "console", label: "Console" },
  { id: "ledger", label: "Ledger" },
  { id: "identity", label: "Identity" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

function Settings() {
  const { settings, setSettings, ens, chain, ids, refreshEns } = useStore();
  const f = (k: keyof typeof settings, label: string, ph?: string) => (
    <label className="block text-sm"><span className="text-mute">{label}</span><input value={settings[k] as string} placeholder={ph} onChange={(e) => setSettings({ [k]: e.target.value } as any)} className={`${inputCls} mt-1.5 font-mono text-xs`} /></label>
  );
  return (
    <Page title="Settings">
      <Card>
        <H>Network</H>
        <div className="grid gap-4 sm:grid-cols-2">{f("ensName", "Meter name (Sepolia)")}{f("chainRpc", "Devnet RPC")}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[["Local chain", "http://127.0.0.1:18545"], ["EF devnet", "https://altmempool.forshtat.com"]].map(([n, u]) => <Button key={n} variant="ghost" onClick={() => setSettings({ chainRpc: u })}>{n}</Button>)}
          <Button variant="ghost" onClick={refreshEns}>Re-resolve</Button>
        </div>
        <div className="mt-3 text-xs text-faint">Chain {chain.status}{chain.chainId ? ` · id ${chain.chainId}` : ""}{chain.error ? ` · ${chain.error}` : ""} · ENS {ens.status} · addresses from {ids.from}</div>
      </Card>
      <Card>
        <H right={<Tag k="Testing" />}>Manual addresses</H>
        <div className="grid gap-4 sm:grid-cols-3">{f("manualLedger", "Ledger", "0x…")}{f("manualAccount", "Account", "0x…")}{f("manualPaymaster", "Paymaster", "0x…")}</div>
        <div className="mt-3 text-xs text-faint">Only used when the name has no records.</div>
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
  const live = s.mode === "live" ? "bg-ok" : s.mode === "replay" ? "bg-warn" : "bg-faint";
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-6 px-4">
          <a href="#overview" onClick={() => go("overview")} className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"><span className="h-2.5 w-2.5 rounded-full bg-fg" />mohar</a>
          <nav aria-label="Pages" className="-mx-2 flex flex-1 gap-1 overflow-x-auto">
            {PAGES.map((p) => <button key={p.id} aria-current={page === p.id ? "page" : undefined} onClick={() => go(p.id)} className={`rounded-full px-3 py-1.5 text-sm transition-colors ${page === p.id ? "bg-fg/[.07] text-fg" : "text-mute hover:text-fg"}`}>{p.label}</button>)}
          </nav>
          <span title={s.mode === "live" ? "Live hardware" : s.mode === "replay" ? "Replay" : "No device"} className={`h-2 w-2 shrink-0 rounded-full ${live}`} />
          <button aria-label="Toggle theme" onClick={() => s.setSettings({ theme: dark ? "light" : "dark" })} className="text-mute hover:text-fg">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>
      <main id="main-content" className="px-4 pb-20 pt-6">{el}</main>
    </div>
  );
}
export default function App() { return <Provider><TooltipProvider delayDuration={150}><Shell /></TooltipProvider></Provider>; }
