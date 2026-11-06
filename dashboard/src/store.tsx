import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { parseLine, groupCheckpoints, evOf, type EvLine, type MeterLine, type Checkpoint, type Source } from "./lib/events";
import { LineReader, serialSupported } from "./lib/serial";
import { getBlockNumber, getChainId, getReceipt, getTxStatus, readAccountRoot, readQuota, readReports, readStatus, type LedgerStatus, type ReportRow } from "./lib/chain";
import { resolveName, UserError, type Resolved } from "./lib/ens";

export type Settings = { chainRpc: string; ensName: string; manualLedger: string; manualAccount: string; manualPaymaster: string; theme: "dark" | "light" };
const DEFAULTS: Settings = { chainRpc: "http://127.0.0.1:18545", ensName: "meter-001.mohar.eth", manualLedger: "", manualAccount: "", manualPaymaster: "", theme: "light" };
const load = (): Settings => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("mohar.settings") ?? "{}"), ...Object.fromEntries(new URLSearchParams(location.search)) } as Settings; } catch { return DEFAULTS; }
};

export type ChainState = {
  status: "idle" | "loading" | "ok" | "error"; error?: string; chainId?: number; head?: number; ledger?: LedgerStatus; rows: ReportRow[]; holds: any[];
  quota?: { remaining: number; daily: number } | null; accountRoot?: string; lastOkAt?: number;
};
export type EnsState = { status: "idle" | "loading" | "ok" | "error"; error?: string; data?: Resolved };
export type Link = { connected: boolean; lastAt: number; error?: string };
export type Ids = { ledger?: string; account?: string; paymaster?: string; from: "ens" | "manual" | "none" };

type Ctx = {
  settings: Settings; setSettings: (s: Partial<Settings>) => void;
  meter: MeterLine | null; meterHist: MeterLine[]; evs: EvLine[]; cps: Checkpoint[]; deviceKey?: { root: string; pubSeed: string };
  pico: Link; esp: Link; mode: "live" | "replay" | "none"; serial: boolean;
  chain: ChainState; ens: EnsState; ids: Ids; receipts: Record<string, any>; txInfo: Record<string, any>;
  connectPico: () => Promise<void>; connectEsp: () => Promise<void>; disconnect: () => void; sendPico: (c: string) => Promise<void>;
  startReplay: (url: string, speed?: number) => Promise<void>; stopReplay: () => void; replayName?: string;
  refreshChain: () => Promise<void>; refreshEns: () => Promise<void>; now: number;
};
const C = createContext<Ctx>(null as any);
export const useStore = () => useContext(C);

export function Provider({ children }: { children: ReactNode }) {
  const [settings, setS] = useState<Settings>(load);
  const setSettings = (p: Partial<Settings>) => setS((s) => { const n = { ...s, ...p }; try { localStorage.setItem("mohar.settings", JSON.stringify(n)); } catch { /* */ } return n; });
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);

  const [meter, setMeter] = useState<MeterLine | null>(null);
  const [meterHist, setMeterHist] = useState<MeterLine[]>([]);
  const [evs, setEvs] = useState<EvLine[]>([]);
  const [deviceKey, setKey] = useState<{ root: string; pubSeed: string }>();
  const [pico, setPico] = useState<Link>({ connected: false, lastAt: 0 });
  const [esp, setEsp] = useState<Link>({ connected: false, lastAt: 0 });
  const [mode, setMode] = useState<"live" | "replay" | "none">("none");
  const [replayName, setReplayName] = useState<string>();
  const [now, setNow] = useState(Date.now());
  const picoR = useRef<LineReader>(); const espR = useRef<LineReader>(); const replayT = useRef<any[]>([]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const ingest = useCallback((raw: string, source: Source, which: "pico" | "esp" | "replay") => {
    const at = Date.now();
    const r = parseLine(raw, at, source);
    if (r.meter) { setMeter(r.meter); setMeterHist((h) => [...h.slice(-1800), r.meter!]); setPico((p) => ({ ...p, lastAt: at })); }
    if (r.ev) { setEvs((e) => [...e.slice(-600), r.ev!]); setEsp((p) => ({ ...p, lastAt: at })); }
    if (r.key) setKey(r.key);
    if (r.cp) setEsp((p) => ({ ...p, lastAt: at }));
    void which;
  }, []);

  const connectPico = async () => {
    const r = new LineReader((l) => ingest(l, "live", "pico"), (why) => setPico({ connected: false, lastAt: 0, error: why }));
    try { await r.open(115200, true); picoR.current = r; setMode("live"); setPico({ connected: true, lastAt: Date.now() }); await r.write("?"); }
    catch (e: any) { setPico({ connected: false, lastAt: 0, error: e?.message ?? "Could not open the port" }); }
  };
  const connectEsp = async () => {
    const r = new LineReader((l) => ingest(l, "live", "esp"), (why) => setEsp({ connected: false, lastAt: 0, error: why }));
    try { await r.open(115200, false); espR.current = r; setMode("live"); setEsp({ connected: true, lastAt: Date.now() }); }
    catch (e: any) { setEsp({ connected: false, lastAt: 0, error: e?.message ?? "Could not open the port" }); }
  };
  const sendPico = async (c: string) => { if (!picoR.current?.opened) throw new Error("The Pico is not connected"); await picoR.current.write(c); };
  const disconnect = () => { picoR.current?.close(); espR.current?.close(); setPico({ connected: false, lastAt: 0 }); setEsp({ connected: false, lastAt: 0 }); if (mode === "live") setMode("none"); };

  const stopReplay = () => { replayT.current.forEach(clearTimeout); replayT.current = []; if (mode === "replay") setMode("none"); setReplayName(undefined); };
  const startReplay = async (url: string, speed = 1) => {
    stopReplay();
    const text = await (await fetch(url)).text();
    setMeter(null); setMeterHist([]); setEvs([]); setMode("replay"); setReplayName(url.split("/").pop());
    const t0 = Date.now();
    for (const line of text.split("\n")) {
      const m = /^\+(\d+)\s(.*)$/.exec(line);
      if (!m) continue;
      const delay = Number(m[1]) / speed;
      replayT.current.push(setTimeout(() => {
        const body = m[2];
        if (body.startsWith("REPLAY-CHAIN ")) { try { setReplayChain(JSON.parse(body.slice(13))); } catch { /* */ } }
        else ingest(body, "replay", "replay");
        setPico((p) => ({ ...p, lastAt: Date.now() })); setEsp((p) => ({ ...p, lastAt: Date.now() }));
      }, delay));
    }
    void t0;
  };

  // ?replay=<file> starts a recorded run on load (used by the tests and for demos without hardware)
  useEffect(() => { const q = new URLSearchParams(location.search); const f = q.get("replay"); if (f) void startReplay(`replay/${f}`, Number(q.get("speed") ?? 20)); }, []); // eslint-disable-line

  // ---- chain-side data recorded inside a replay file only, shown with the REPLAY badge
  const [replayChain, setReplayChain] = useState<any>(null);
  useEffect(() => { if (mode !== "replay") setReplayChain(null); }, [mode]);

  // ---- ENS
  const [ens, setEns] = useState<EnsState>({ status: "idle" });
  const refreshEns = useCallback(async () => {
    if (!settings.ensName) return setEns({ status: "idle" });
    setEns({ status: "loading" });
    try { setEns({ status: "ok", data: await resolveName(settings.ensName) }); }
    catch (e: any) { setEns({ status: "error", error: e instanceof UserError ? e.message : `ENS lookup failed: ${e?.message ?? e}` }); }
  }, [settings.ensName]);
  useEffect(() => { void refreshEns(); }, [refreshEns]);

  const ids: Ids = useMemo(() => {
    const r = ens.data?.records;
    const fromEns = { ledger: r?.["mohar.ledger"] ?? undefined, account: ens.data?.account ?? undefined, paymaster: r?.["mohar.paymaster"] ?? undefined };
    // TESTING ONLY: ?forceManual=1 lets the manual fields win over ENS, to show the root-mismatch warning with a different account.
    const force = (settings as any).forceManual === "1" && settings.manualLedger;
    if (fromEns.ledger && !force) return { ...fromEns, from: "ens" as const };
    if (settings.manualLedger) return { ledger: settings.manualLedger, account: settings.manualAccount || undefined, paymaster: settings.manualPaymaster || undefined, from: "manual" as const };
    return { from: "none" as const };
  }, [ens.data, settings.manualLedger, settings.manualAccount, settings.manualPaymaster]);

  // ---- chain
  const [chain, setChain] = useState<ChainState>({ status: "idle", rows: [], holds: [] });
  const lastSeqRef = useRef(-1);
  const refreshChain = useCallback(async () => {
    if (!ids.ledger) return setChain((c) => ({ ...c, status: "idle" }));
    try {
      const [chainId, head, ledger] = await Promise.all([getChainId(settings.chainRpc), getBlockNumber(settings.chainRpc), readStatus(settings.chainRpc, ids.ledger)]);
      let rows = undefined as ReportRow[] | undefined, holds: any[] | undefined;
      if (ledger.lastSeq !== lastSeqRef.current) { const r = await readReports(settings.chainRpc, ids.ledger); rows = r.rows; holds = r.holds; lastSeqRef.current = ledger.lastSeq; }
      const quota = ids.paymaster && ids.account ? await readQuota(settings.chainRpc, ids.paymaster, ids.account) : null;
      const accountRoot = ids.account ? await readAccountRoot(settings.chainRpc, ids.account).catch(() => undefined) : undefined;
      setChain((c) => ({ status: "ok", chainId, head, ledger, rows: rows ?? c.rows, holds: holds ?? c.holds, quota, accountRoot, lastOkAt: Date.now() }));
    } catch (e: any) { setChain((c) => ({ ...c, status: "error", error: e?.message ?? String(e) })); }
  }, [ids.ledger, ids.account, ids.paymaster, settings.chainRpc]);
  useEffect(() => { lastSeqRef.current = -1; setChain({ status: ids.ledger ? "loading" : "idle", rows: [], holds: [] }); void refreshChain(); }, [ids.ledger, settings.chainRpc]); // eslint-disable-line
  useEffect(() => { const t = setInterval(() => void refreshChain(), 4000); return () => clearInterval(t); }, [refreshChain]);

  // ---- receipts of the hashes the device reports having sent
  const [receipts, setReceipts] = useState<Record<string, any>>({});
  const [txInfo, setTxInfo] = useState<Record<string, any>>({});
  const hashes = useMemo(() => evs.filter((e) => e.e === "submitted" && e.result === "ok" && e.hash).map((e) => e.hash as string), [evs]);
  useEffect(() => {
    if (mode === "replay") return;
    let dead = false;
    const t = setInterval(async () => {
      for (const h of hashes.slice(-6)) {
        if (receipts[h]) continue;
        const r = await getReceipt(settings.chainRpc, h);
        if (r && !dead) setReceipts((x) => ({ ...x, [h]: r }));
        if (!txInfo[h]) { const s = await getTxStatus(settings.chainRpc, h); if (s && !dead) setTxInfo((x) => ({ ...x, [h]: s })); }
      }
    }, 2500);
    return () => { dead = true; clearInterval(t); };
  }, [hashes, settings.chainRpc, receipts, txInfo, mode]);
  const mergedReceipts = replayChain?.receipts ? { ...receipts, ...replayChain.receipts } : receipts;
  const mergedChain: ChainState = replayChain?.ledger ? { ...chain, status: "ok", ledger: { ...replayChain.ledger, credit: BigInt(replayChain.ledger.credit), arrears: BigInt(replayChain.ledger.arrears), tariff: BigInt(replayChain.ledger.tariff), earned: 0n }, rows: chain.rows } : chain;

  const cps = useMemo(() => groupCheckpoints(evs), [evs]);
  const v: Ctx = {
    settings, setSettings, meter, meterHist, evs, cps, deviceKey, pico, esp, mode, serial: serialSupported(), chain: mergedChain, ens, ids,
    receipts: mergedReceipts, txInfo, connectPico, connectEsp, disconnect, sendPico, startReplay, stopReplay, replayName, refreshChain, refreshEns, now,
  };
  return <C.Provider value={v}>{children}</C.Provider>;
}
export { evOf };
