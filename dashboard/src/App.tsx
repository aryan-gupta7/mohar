import { useEffect, useState } from "react";
import { Activity, Bot, Gauge, Home, IdCard, Layers, Moon, Receipt, Settings as Cog, Sun, TerminalSquare, Wallet, MoreHorizontal } from "lucide-react";
import { Provider, useStore } from "./store";
import { Console } from "./pages/Console";
import { Overview } from "./pages/Overview";
import { Meter } from "./pages/Meter";
import { Report } from "./pages/Report";
import { AI, Ledger, Identity, Audit, Usage } from "./pages/More";
import { Badge, Card, H } from "./components/ui";

const PAGES = [
  { id: "console", label: "Demo Console", icon: TerminalSquare, el: <Console />, mobile: false },
  { id: "overview", label: "Overview", icon: Home, el: <Overview />, mobile: true },
  { id: "meter", label: "Meter", icon: Gauge, el: <Meter />, mobile: true },
  { id: "report", label: "Verified report", icon: Receipt, el: <Report />, mobile: false },
  { id: "ai", label: "AI insights", icon: Bot, el: <AI />, mobile: true },
  { id: "ledger", label: "Credit & ledger", icon: Wallet, el: <Ledger />, mobile: true },
  { id: "usage", label: "Usage", icon: Layers, el: <Usage />, mobile: false },
  { id: "identity", label: "Identity & access", icon: IdCard, el: <Identity />, mobile: false },
  { id: "audit", label: "Activity & audit", icon: Activity, el: <Audit />, mobile: false },
  { id: "settings", label: "Settings", icon: Cog, el: null, mobile: false },
] as const;

function Settings() {
  const { settings, setSettings, ens, chain, ids, refreshEns } = useStore();
  const f = (k: keyof typeof settings, label: string, ph?: string) => (
    <label className="block text-sm"><span className="text-xs text-mute">{label}</span><input value={settings[k] as string} placeholder={ph} onChange={(e) => setSettings({ [k]: e.target.value } as any)} className="mt-1 w-full rounded-xl border border-line bg-mid px-3 py-2 font-mono text-xs" /></label>
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card><H>Network</H><div className="grid gap-3 sm:grid-cols-2">{f("ensName", "Machine name (looked up on Sepolia)")}{f("chainRpc", "Mohar devnet RPC")}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">{[["Local chain", "http://127.0.0.1:18545"], ["EF devnet", "https://altmempool.forshtat.com"]].map(([n, u]) => <button key={n} onClick={() => setSettings({ chainRpc: u })} className="rounded-full border border-line px-3 py-1">{n}</button>)}<button onClick={refreshEns} className="rounded-full border border-line px-3 py-1">Re-resolve name</button></div>
        <p className="mt-2 text-xs text-mute">Chain: {chain.status}{chain.chainId ? ` · id ${chain.chainId}` : ""}{chain.error ? ` · ${chain.error}` : ""}. ENS: {ens.status}. Addresses come from: {ids.from}.</p></Card>
      <Card><H right={<Badge k="TESTING ONLY" />}>Manual addresses</H><p className="text-xs text-mute mb-2">Used only when the name has no published records. A real session discovers everything from the name.</p>
        <div className="grid gap-3 sm:grid-cols-3">{f("manualLedger", "Ledger", "0x…")}{f("manualAccount", "Account", "0x…")}{f("manualPaymaster", "Paymaster", "0x…")}</div></Card>
    </div>
  );
}

function Shell() {
  const [page, setPage] = useState<string>(location.hash.slice(1) || "console");
  const s = useStore(); const [more, setMore] = useState(false);
  useEffect(() => { const h = () => setPage(location.hash.slice(1) || "console"); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  const go = (id: string) => { setPage(id); location.hash = id; setMore(false); };
  const cur = PAGES.find((p) => p.id === page) ?? PAGES[0];
  return (
    <div className="flex min-h-full">
      <aside className="hidden md:flex w-60 shrink-0 flex-col gap-1 bg-graph/60 border-r border-line p-4 sticky top-0 h-screen">
        <div className="mb-4 flex items-center gap-2"><div className="h-8 w-8 rounded-xl bg-lime" /><div><div className="font-bold leading-none">mohar</div><div className="text-[10px] text-mute">Console</div></div></div>
        {PAGES.map((p) => <button key={p.id} onClick={() => go(p.id)} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-left ${page === p.id ? "bg-lime text-black font-semibold" : "text-mute hover:bg-card hover:text-text"}`}><p.icon size={16} />{p.label}</button>)}
        <div className="mt-auto space-y-2 text-[11px] text-mute">
          <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${s.mode === "live" ? "bg-lime" : s.mode === "replay" ? "bg-warn" : "bg-line"}`} />{s.mode === "live" ? "Live hardware" : s.mode === "replay" ? "REPLAY" : "No device"}</div>
          <button onClick={() => s.setSettings({ theme: s.settings.theme === "dark" ? "light" : "dark" })} className="flex items-center gap-2 underline">{s.settings.theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}{s.settings.theme === "dark" ? "Light" : "Dark"} mode</button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-4 md:px-8 py-5 pb-28 md:pb-8 max-w-[1300px]">
        {cur.id === "settings" ? <Settings /> : cur.el}
      </main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-line bg-mid/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {more && <div className="absolute bottom-full inset-x-2 mb-2 card p-2 grid grid-cols-2 gap-1">{PAGES.filter((p) => !p.mobile).map((p) => <button key={p.id} onClick={() => go(p.id)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-left hover:bg-card"><p.icon size={16} />{p.label}</button>)}</div>}
        <div className="flex">{PAGES.filter((p) => p.mobile).map((p) => <button key={p.id} onClick={() => go(p.id)} className={`flex-1 py-2 text-[10px] flex flex-col items-center gap-0.5 ${page === p.id ? "text-lime" : "text-mute"}`}><p.icon size={20} />{p.label.split(" ")[0]}</button>)}
          <button onClick={() => setMore(!more)} className={`flex-1 py-2 text-[10px] flex flex-col items-center gap-0.5 ${more ? "text-lime" : "text-mute"}`}><MoreHorizontal size={20} />More</button></div>
      </nav>
    </div>
  );
}
export default function App() { return <Provider><Shell /></Provider>; }
