// Mohar dashboard. Static page, no backend, no trackers. It starts from an ENS name, finds the meter's contracts from
// the name's records, reads them from the device chain, and checks the meter's key against the one published in ENS.
// The only settings are RPC URLs. No account, ledger or paymaster address is written in this file.
import { rpc, ethCall, RpcDead, RpcError, encodeCall, decodeArgs, selector, namehash, dnsEncode, explainRevert, fromHex, toHex, keccak } from "./lib/abi.js";

const CONFIG = {
  ensRpc: "https://ethereum-sepolia-rpc.publicnode.com",
  ensChainId: 11155111n,
  // ENS's own Universal Resolver proxy on Sepolia (docs.ens.domains/learn/deployments). It is part of ENS, not a meter.
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  chains: {
    local: { label: "Local chain", rpc: "http://127.0.0.1:18545" },
    devnet: { label: "EF devnet", rpc: "https://altmempool.forshtat.com" },
  },
  coinType: 0x80000539n, // ENSIP-11 coin type for chain 1337
  pulsesPerKwh: 3200,
};
const RECORDS = ["mohar.chainId", "mohar.ledger", "mohar.paymaster", "mohar.pq.scheme", "mohar.pq.root", "mohar.pq.pubSeed",
  "mohar.policy", "mohar.operator", "mohar.deviceType", "mohar.maintenance.status", "mohar.log"];
const MODES = ["RUN", "INSPECT", "CREDIT_STOP", "SAFE_STOP"];
const MODE_CLASS = ["run", "inspect", "credit", "safe"];
const MODE_NOTE = [
  "Normal: credit covers usage and there is no inspection hold.",
  "Inspection hold: only the operator can clear it. An AI decision cannot.",
  "Credit exhausted, usage accruing as arrears. Nothing is disconnected: the meter keeps counting and the ledger keeps recording.",
  "The meter had no valid decision, so it chose caution. It keeps counting.",
];
const REASONS = { 0: "none", 1: "peak above the meter's limit", 2: "3 or more glitches on the pulse line", 3: "pulse line stuck low", 4: "AI decision: inspect",
  10: "credit exhausted", 11: "inspection hold on the ledger", 20: "no valid decision", 21: "chain unreachable", 22: "one-time keys used up", 24: "starting up" };
const MODELS = { 0: "none", 1: "qwen3.8-flash (0G)" };
const REPORT_EVENT = "Report(uint64,uint64,uint64,uint256,uint256,uint8,uint8,uint8,uint8,uint32,bytes32,string)";
const REPORT_TYPES = ["uint64", "uint64", "uint256", "uint256", "uint8", "uint8", "uint8", "uint8", "uint32", "bytes32", "string"];

const $ = (id) => document.getElementById(id);
class UserError extends Error {}

// ---------------------------------------------------------------- small DOM helpers (text only: ENS records are untrusted)
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === "class") n.className = v; else n.setAttribute(k, v); }
  for (const k of kids) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}
const field = (label, value, cls = "") => el("div", {}, el("dt", {}, label), el("dd", cls ? { class: cls } : {}, value));
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
const short = (a) => (a && a.length > 20 ? a.slice(0, 8) + "…" + a.slice(-6) : a);
const status = (t) => { $("status").textContent = t; };
function showError(msg) { const e = $("error"); e.textContent = msg; e.hidden = !msg; }

function formatEth(wei) {
  const neg = wei < 0n; if (neg) wei = -wei;
  const whole = wei / 10n ** 18n, frac = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole + (frac ? "." + frac.slice(0, 9) : "") + " ETH";
}
const num = (b) => Number(b).toLocaleString("en-US");
const kwh = (pulses) => (Number(pulses) / CONFIG.pulsesPerKwh).toFixed(4) + " kWh";
const hexAddr = (h) => "0x" + h.slice(-40).toLowerCase();
const isAddr = (s) => /^0x[0-9a-fA-F]{40}$/.test(s ?? "");

// ---------------------------------------------------------------- settings
function loadSettings() {
  const q = new URLSearchParams(location.search);
  $("ensRpc").value = q.get("ensRpc") ?? CONFIG.ensRpc;
  const pick = $("chainPick");
  for (const [k, c] of Object.entries(CONFIG.chains)) pick.append(el("option", { value: k }, c.label));
  pick.append(el("option", { value: "custom" }, "Custom"));
  const chain = q.get("chain");
  if (chain && CONFIG.chains[chain]) { pick.value = chain; $("chainRpc").value = CONFIG.chains[chain].rpc; }
  else if (chain && /^https?:/.test(chain)) { pick.value = "custom"; $("chainRpc").value = chain; }
  else { pick.value = "local"; $("chainRpc").value = CONFIG.chains.local.rpc; }
  pick.addEventListener("change", () => { if (CONFIG.chains[pick.value]) $("chainRpc").value = CONFIG.chains[pick.value].rpc; });
  if (q.get("name")) $("name").value = q.get("name");
  for (const [param, id] of [["ledger", "ovLedger"], ["account", "ovAccount"], ["paymaster", "ovPaymaster"], ["root", "ovRoot"], ["chainid", "ovChain"]]) if (q.get(param)) $(id).value = q.get(param);
  if (q.get("ledger") || q.get("account") || q.get("paymaster") || q.get("root") || q.get("chainid")) $("testing").open = true;
  return q.get("go") === "1";
}

// ---------------------------------------------------------------- ENS
async function ensRead(ensRpc, name, data) {
  const out = await ethCall(ensRpc, CONFIG.universalResolver, encodeCall("resolve(bytes,bytes)", [dnsEncode(name), data]));
  const [result] = decodeArgs(["bytes", "address"], out);
  return result;
}
async function ensText(ensRpc, name, key) {
  try { return decodeArgs(["string"], await ensRead(ensRpc, name, encodeCall("text(bytes32,string)", [namehash(name), key])))[0]; }
  catch (e) { if (e instanceof RpcDead) throw e; return null; }
}
async function ensAddr(ensRpc, name, coinType) {
  try {
    const [b] = decodeArgs(["bytes"], await ensRead(ensRpc, name, encodeCall("addr(bytes32,uint256)", [namehash(name), coinType])));
    return b && b.length === 42 ? b : null;
  } catch (e) { if (e instanceof RpcDead) throw e; return null; }
}

async function resolveName(ensRpc, name) {
  let chainId;
  try { chainId = BigInt(await rpc(ensRpc, "eth_chainId")); }
  catch (e) { throw new UserError(`Cannot reach the ENS network RPC (${ensRpc}). Check the URL in Network settings.`); }
  if (chainId !== CONFIG.ensChainId) throw new UserError(`The ENS RPC is chain ${chainId}, not Sepolia (${CONFIG.ensChainId}). Names are looked up on Sepolia.`);

  let found;
  try { found = decodeArgs(["address", "bytes32", "uint256"], await ethCall(ensRpc, CONFIG.universalResolver, encodeCall("findResolver(bytes)", [dnsEncode(name)]))); }
  catch (e) { if (e instanceof RpcDead) throw new UserError(`Cannot reach the ENS network RPC (${ensRpc}).`); found = ["0x" + "0".repeat(40), null, 0n]; }
  const [resolver, , offset] = found;
  if (/^0x0{40}$/.test(resolver)) throw new UserError(`Unknown name: no resolver is registered for ${name}.`);

  status("Reading the name's records from ENS…");
  const rec = {};
  const values = await Promise.all(RECORDS.map((k) => ensText(ensRpc, name, k)));
  RECORDS.forEach((k, i) => { rec[k] = values[i] || null; });
  const account = await ensAddr(ensRpc, name, CONFIG.coinType);
  const any = Object.values(rec).some(Boolean) || account;
  if (!any) {
    if (offset > 0n) throw new UserError(`Unknown name: ${name} is not registered. Only its parent's resolver answered, and it has no records for this name.`);
    throw new UserError(`${name} exists, but has no mohar records (no ledger, paymaster or account).`);
  }
  return { resolver, records: rec, account };
}

// ---------------------------------------------------------------- chain reads
async function readDevice(chainRpc, ids, ensRoot, ensPub) {
  let chainId;
  try { chainId = BigInt(await rpc(chainRpc, "eth_chainId")); }
  catch { throw new UserError(`Cannot reach the device chain RPC (${chainRpc}). Is the chain running? You can change the URL in Network settings.`); }
  if (ids.expectChainId !== null && chainId !== ids.expectChainId) {
    throw new UserError(`Wrong chain: this RPC is chain ${chainId}, but the name's mohar.chainId says ${ids.expectChainId}.`);
  }
  const code = await rpc(chainRpc, "eth_getCode", [ids.ledger, "latest"]);
  if (!code || code === "0x") throw new UserError(`There is no contract at the ledger address ${ids.ledger} on this chain. The name may point at a different chain, or the chain was reset.`);

  const call = (to, data) => ethCall(chainRpc, to, data);
  const st = decodeArgs(["uint256", "bool", "uint64", "uint64", "uint256", "uint256", "uint256", "uint8", "uint8"], await call(ids.ledger, encodeCall("status()")));
  const ledger = { credit: st[0], hold: st[1], lastSeq: st[2], lastTotal: st[3], tariff: st[4], earned: st[5], arrears: st[6], lastMode: Number(st[7]), ledgerMode: Number(st[8]) };
  const machine = hexAddr(await call(ids.ledger, encodeCall("machine()")));
  const operator = hexAddr(await call(ids.ledger, encodeCall("operator()")));
  const account = ids.account ?? machine;

  let key = { root: null, pubSeed: null };
  try {
    key.root = (await call(account, encodeCall("root()"))).toLowerCase();
    key.pubSeed = "0x" + (await call(account, encodeCall("pubSeed()"))).slice(2, 34).toLowerCase();
  } catch { /* not a Mohar account */ }

  let quota = null;
  if (ids.paymaster) {
    try {
      const w = decodeArgs(["uint256"], await call(ids.paymaster, encodeCall("policyOf(address)", [account])))[0];
      const paused = decodeArgs(["uint256"], await call(ids.paymaster, encodeCall("paused()")))[0] !== 0n;
      quota = { remaining: w >> 192n, daily: (w >> 128n) & 0xffffffffffffffffn, paused };
    } catch { /* paymaster not readable */ }
  }

  const reports = await readReports(chainRpc, ids.ledger);
  return { chainId, ledger, machine, operator, account, key, quota, reports };
}

async function readReports(chainRpc, ledger) {
  const topic0 = keccak(REPORT_EVENT);
  const head = BigInt(await rpc(chainRpc, "eth_blockNumber"));
  let logs = null;
  for (const span of [null, 20000n, 2000n]) {
    try {
      const from = span === null ? "0x0" : "0x" + (head > span ? head - span : 0n).toString(16);
      logs = await rpc(chainRpc, "eth_getLogs", [{ address: ledger, topics: [topic0], fromBlock: from, toBlock: "latest" }], 30000);
      break;
    } catch (e) { if (e instanceof RpcDead) throw e; }
  }
  if (!logs) return [];
  return logs.slice(-10).reverse().map((l) => {
    const d = decodeArgs(REPORT_TYPES, l.data);
    return { seq: BigInt(l.topics[1]), total: d[0], usage: d[1], charged: d[2], owed: d[3], mode: Number(d[4]), reason: Number(d[5]), confidence: Number(d[6]),
      model: Number(d[7]), salt: Number(d[8]), sensors: decodeSensors(d[9]), requestId: d[10], block: BigInt(l.blockNumber), tx: l.transactionHash };
  });
}

/** Layout (big-endian): 0-3 valid pulses, 4-5 glitches, 6-7 stuck-low, 8-9 avg W, 10-11 peak W, 12-15 window ms, 16-19 longest gap ms, 20-27 cumulative pulses. */
export function decodeSensors(hex) {
  const b = fromHex(hex);
  const u = (from, to) => b.slice(from, to).reduce((a, x) => (a << 8n) | BigInt(x), 0n);
  return { validPulses: u(0, 4), glitches: u(4, 6), stuckLow: u(6, 8), avgWatts: u(8, 10), peakWatts: u(10, 12), windowMs: u(12, 16), longestGapMs: u(16, 20), cumulative: u(20, 28), empty: b.every((x) => x === 0) };
}

// ---------------------------------------------------------------- rendering
function renderIdentity(name, ens, dev, ids, override) {
  document.querySelector("#identity h2 small").textContent = ens ? "from ENS" : "testing override, ENS skipped";
  const body = $("identityBody"); clear(body);
  const g = el("dl", { class: "grid" });
  g.append(field("Name", name));
  g.append(field("Account (meter)", el("span", { class: "addr" }, dev.account)));
  g.append(field("Ledger", el("span", { class: "addr" }, ids.ledger)));
  g.append(field("Paymaster", el("span", { class: "addr" }, ids.paymaster ?? "not in ENS")));
  g.append(field("Operator (clears holds)", el("span", { class: "addr" }, dev.operator)));
  g.append(field("Chain", `${dev.chainId}`));
  if (ens) {
    const r = ens.records;
    for (const k of ["mohar.deviceType", "mohar.pq.scheme", "mohar.policy", "mohar.maintenance.status", "mohar.log"]) if (r[k]) g.append(field(k, r[k]));
  }
  body.append(g);

  const chk = $("rootCheck"); clear(chk);
  const ensRoot = override.root ?? ens?.records["mohar.pq.root"] ?? null;
  const ensPub = ens?.records["mohar.pq.pubSeed"] ?? null;
  const add = (cls, text) => chk.append(el("div", { class: "check " + cls }, text));
  if (!dev.key.root) add("unknown", "The account does not expose a post-quantum key (root()), so ENS and chain can't be compared.");
  else if (!ensRoot) add("unknown", "ENS has no mohar.pq.root record for this name, so the meter's key is not published there.");
  else if (ensRoot.toLowerCase() === dev.key.root) add("ok", `Key check passed: the key published in ENS (mohar.pq.root) equals the key the account verifies against on-chain (${short(dev.key.root)}).`);
  else add("bad", `KEY MISMATCH: ENS says the meter's key is ${short(ensRoot)}, but the account on-chain verifies against ${short(dev.key.root)}. Do not trust this meter's identity until this is explained.`);
  if (ensPub && dev.key.pubSeed) {
    if (ensPub.toLowerCase() === dev.key.pubSeed) add("ok", "Public seed (mohar.pq.pubSeed) matches the account.");
    else add("bad", `PUBLIC SEED MISMATCH: ENS ${ensPub}, account ${dev.key.pubSeed}.`);
  }
  if (ens?.account) {
    if (ens.account.toLowerCase() === dev.machine) add("ok", "The account in ENS is the machine bound in the ledger.");
    else add("bad", `ACCOUNT MISMATCH: ENS lists ${short(ens.account)}, but the ledger is bound to ${short(dev.machine)}.`);
  }
}

function renderMeter(dev) {
  const L = dev.ledger;
  const box = $("modeBox"); clear(box);
  box.append(el("span", { class: "pill " + MODE_CLASS[L.lastMode] }, MODES[L.lastMode] ?? "UNKNOWN"));
  box.append(el("span", { class: "hint" }, " last mode the meter reported"));
  box.append(el("p", { class: "note" }, MODE_NOTE[L.lastMode] ?? ""));
  if (L.ledgerMode !== L.lastMode) box.append(el("p", { class: "note" }, `The ledger's own view right now: ${MODES[L.ledgerMode]}. ${MODE_NOTE[L.ledgerMode]}`));
  if (L.arrears > 0n) box.append(el("p", { class: "note" }, `Credit exhausted, usage accruing as arrears: ${formatEth(L.arrears)} owed. The next top-up pays this first.`));

  const g = $("meterBody"); clear(g);
  const pulses = (wei) => (L.tariff > 0n ? ` (${num(wei / L.tariff)} pulses)` : "");
  g.append(field("Pulse count", num(L.lastTotal)));
  g.append(field("Consumption", kwh(L.lastTotal)));
  g.append(field("Credit", formatEth(L.credit) + pulses(L.credit)));
  g.append(field("Arrears", formatEth(L.arrears) + pulses(L.arrears)));
  g.append(field("Charged so far", formatEth(L.earned)));
  g.append(field("Tariff", formatEth(L.tariff) + " per pulse"));
  g.append(field("Inspection hold", L.hold ? "SET (operator must clear)" : "none", L.hold ? "bad" : ""));
  g.append(field("Reports", num(L.lastSeq)));
  if (dev.quota) {
    g.append(field("Gas quota left", `${num(dev.quota.remaining)} of ${num(dev.quota.daily)} per day`));
    g.append(field("Paymaster", dev.quota.paused ? "PAUSED" : "active"));
  }
}

function renderLatest(dev) {
  const g = $("latestBody"); clear(g);
  const r = dev.reports[0];
  if (!r) { g.append(field("Reports", "none yet")); return; }
  const s = r.sensors;
  g.append(field("Report #", `${r.seq}`));
  g.append(field("Mode", MODES[r.mode] ?? r.mode));
  g.append(field("Reason", REASONS[r.reason] ?? `code ${r.reason}`));
  g.append(field("Pulses in this report", num(r.usage)));
  g.append(field("Consumption in it", kwh(r.usage)));
  g.append(field("Total", `${num(r.total)} pulses = ${kwh(r.total)}`));
  if (s.empty) g.append(field("Window statistics", "none in this report"));
  else {
    g.append(field("Window", `${(Number(s.windowMs) / 1000).toFixed(0)} s, ${num(s.validPulses)} pulses`));
    g.append(field("Average load", `${num(s.avgWatts)} W`));
    g.append(field("Peak load", `${num(s.peakWatts)} W`));
    g.append(field("Longest silence", `${(Number(s.longestGapMs) / 1000).toFixed(1)} s`));
    const flags = [];
    if (s.glitches > 0n) flags.push(`${s.glitches} glitch${s.glitches > 1n ? "es" : ""}`);
    if (s.stuckLow > 0n) flags.push(`${s.stuckLow} stuck-low event${s.stuckLow > 1n ? "s" : ""}`);
    g.append(field("Anomaly status", flags.length ? flags.join(", ") : "none", flags.length ? "bad" : ""));
  }
  g.append(field("Decision", r.requestId ? MODELS[r.model] ?? `model ${r.model}` : "no model decision"));
  g.append(field("0G request ID", r.requestId || "none (no decision)", "addr"));
  g.append(field("Charged / owed", `${formatEth(r.charged)} / ${formatEth(r.owed)}`));
}

function renderHistory(dev) {
  const tb = document.querySelector("#histTable tbody"); clear(tb);
  if (!dev.reports.length) { tb.append(el("tr", {}, el("td", { colspan: "7" }, "No reports yet."))); return; }
  for (const r of dev.reports) {
    tb.append(el("tr", {}, el("td", {}, r.seq), el("td", {}, MODES[r.mode] ?? r.mode), el("td", {}, num(r.total)), el("td", {}, `${num(r.usage)} (${kwh(r.usage)})`),
      el("td", {}, formatEth(r.charged)), el("td", {}, REASONS[r.reason] ?? r.reason), el("td", { class: "mono small" }, r.requestId || "-")));
  }
}

// ---------------------------------------------------------------- lookup
let current = null;

async function lookup() {
  showError(""); $("out").hidden = true; $("banner").hidden = true;
  const name = $("name").value.trim().toLowerCase();
  const ensRpc = $("ensRpc").value.trim(), chainRpc = $("chainRpc").value.trim();
  const ov = { ledger: $("ovLedger").value.trim(), account: $("ovAccount").value.trim(), paymaster: $("ovPaymaster").value.trim(), root: $("ovRoot").value.trim() || null, chain: $("ovChain").value.trim() };
  try {
    if (!ov.ledger && !name.includes(".")) throw new UserError("Enter a full name such as meter-001.mohar.eth.");
    let ens = null, ids;
    if (ov.ledger) {
      if (!isAddr(ov.ledger) || (ov.account && !isAddr(ov.account)) || (ov.paymaster && !isAddr(ov.paymaster))) throw new UserError("A testing override address is not a valid address.");
      ids = { ledger: ov.ledger.toLowerCase(), account: ov.account ? ov.account.toLowerCase() : null, paymaster: ov.paymaster ? ov.paymaster.toLowerCase() : null, expectChainId: /^\d+$/.test(ov.chain) ? BigInt(ov.chain) : null };
      const b = $("banner"); b.textContent = "TESTING OVERRIDE: ENS was skipped. The addresses below came from the Testing only fields, not from a name."; b.hidden = false;
    } else {
      status("Looking up the name on ENS (Sepolia)…");
      ens = await resolveName(ensRpc, name);
      const r = ens.records;
      if (!isAddr(r["mohar.ledger"])) throw new UserError(`${name} has no valid mohar.ledger record, so there is no meter to show.`);
      ids = { ledger: r["mohar.ledger"].toLowerCase(), account: ens.account ? ens.account.toLowerCase() : null, paymaster: isAddr(r["mohar.paymaster"]) ? r["mohar.paymaster"].toLowerCase() : null,
        expectChainId: /^\d+$/.test(r["mohar.chainId"] ?? "") ? BigInt(r["mohar.chainId"]) : null };
    }
    status("Reading the meter from the device chain…");
    const dev = await readDevice(chainRpc, ids);
    current = { name, ens, ids, dev, chainRpc, ensRpc };
    renderIdentity(name, ens, dev, ids, ov);
    renderMeter(dev); renderLatest(dev); renderHistory(dev);
    $("out").hidden = false;
    status(`Updated ${new Date().toLocaleTimeString()}.`);
    updateWalletNote();
  } catch (e) {
    if (e instanceof UserError) showError(e.message);
    else if (e instanceof RpcDead) showError(e.message + " Check the RPC URLs in Network settings.");
    else if (e instanceof RpcError) showError("The node refused the request: " + e.message);
    else showError("Something unexpected went wrong: " + (e.message ?? e));
    status("");
  }
}

// ---------------------------------------------------------------- wallet actions
function updateWalletNote() {
  $("walletNote").textContent = window.ethereum ? "A wallet was found. Each action asks it to confirm, on the right network." : "No wallet found in this browser. Install one to use these actions; reading works without it.";
  for (const id of ["btnTopup", "btnClear", "btnRecord"]) $(id).disabled = !window.ethereum;
}
function out(text) { const p = $("actionOut"); p.textContent = text; p.hidden = false; }
async function wallet(chainRpcUrl, expectedChain, to, data, value) {
  const [from] = await window.ethereum.request({ method: "eth_requestAccounts" });
  const walletChain = BigInt(await window.ethereum.request({ method: "eth_chainId" }));
  if (walletChain !== expectedChain) throw new UserError(`Your wallet is on chain ${walletChain}. Switch it to chain ${expectedChain} first, then try again.`);
  try { await ethCall(chainRpcUrl, to, data, from, value); } // simulate first, so a rejection shows the contract's real error
  catch (e) { if (e instanceof RpcError) throw new UserError(explainRevert(typeof e.data === "string" ? e.data : e.data?.data)); throw e; }
  return window.ethereum.request({ method: "eth_sendTransaction", params: [{ from, to, data, ...(value ? { value: "0x" + value.toString(16) } : {}) }] });
}
async function act(fn) {
  $("actionOut").hidden = true;
  try { await fn(); } catch (e) { out(e instanceof UserError ? e.message : (e.message ?? String(e))); }
}
function parseEth(s) {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(s.trim());
  if (!m) throw new UserError("Enter an amount like 0.001");
  return BigInt(m[1]) * 10n ** 18n + BigInt((m[2] ?? "").padEnd(18, "0") || "0");
}

$("btnTopup").addEventListener("click", () => act(async () => {
  if (!current) throw new UserError("Look up a meter first.");
  const wei = parseEth($("topupAmount").value);
  const hash = await wallet(current.chainRpc, current.dev.chainId, current.ids.ledger, encodeCall("topUp()"), wei);
  out(`Top-up sent: ${hash}\nRefreshing in a few seconds…`);
  setTimeout(lookup, 4000);
}));
$("btnClear").addEventListener("click", () => act(async () => {
  if (!current) throw new UserError("Look up a meter first.");
  const hash = await wallet(current.chainRpc, current.dev.chainId, current.ids.ledger, encodeCall("clearHold()"));
  out(`Clear-hold sent: ${hash}\nRefreshing in a few seconds…`);
  setTimeout(lookup, 4000);
}));
$("btnRecord").addEventListener("click", () => act(async () => {
  if (!current || !current.ens) throw new UserError("Look up a name on ENS first (the testing override has no name).");
  const key = $("recKey").value.trim(), value = $("recVal").value;
  if (!key) throw new UserError("Enter a record key.");
  const data = encodeCall("setText(bytes,string,string)", [dnsEncode(current.name), key, value]);
  const hash = await wallet(current.ensRpc, CONFIG.ensChainId, current.ens.resolver, data);
  out(`Record edit sent: ${hash}\nRefreshing in a few seconds…`);
  setTimeout(lookup, 8000);
}));

// ---------------------------------------------------------------- live serial panel (local only)
let serialBuf = "";
$("btnSerial").addEventListener("click", async () => {
  const st = $("serialState");
  if (!("serial" in navigator)) { st.textContent = "Web Serial isn't available in this browser. Use Chrome or Edge."; return; }
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    st.textContent = "Connected. Showing what the device prints.";
    const reader = port.readable.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      serialBuf += value;
      let i;
      while ((i = serialBuf.indexOf("\n")) >= 0) { liveLine(serialBuf.slice(0, i).trim()); serialBuf = serialBuf.slice(i + 1); }
    }
  } catch (e) { st.textContent = "Not connected: " + (e.message ?? e); }
});
function liveLine(line) {
  if (!line) return;
  const log = $("serialLog");
  log.textContent = (log.textContent + line + "\n").split("\n").slice(-20).join("\n");
  const g = $("liveBody");
  let m;
  if (line.startsWith("METER {")) {            // the Pico meter simulator
    try { const j = JSON.parse(line.slice(6)); clear(g); g.append(field("Source", "Pico meter simulator"), field("Pulses", num(j.pulses)), field("Load setting", `${j.watts} W (${j.mode})`), field("Glitches", num(j.glitches)), field("Energy", kwh(j.pulses))); } catch { /* partial line */ }
  } else if ((m = /^METER valid=(\d+) glitches=(\d+) stuck=(\d+).*total=(\d+)/.exec(line))) {   // the board's meter command
    clear(g); g.append(field("Source", "Meter board"), field("Valid pulses since boot", num(m[1])), field("Glitches", m[2]), field("Stuck-low", m[3]), field("Total", `${num(m[4])} (${kwh(m[4])})`));
  } else if ((m = /^CP mode=(\w+).*total=(\d+)/.exec(line))) {
    clear(g); g.append(field("Source", "Meter board checkpoint"), field("Mode", m[1]), field("Total", `${num(m[2])} (${kwh(m[2])})`));
  }
}

// ---------------------------------------------------------------- start
$("lookup").addEventListener("submit", (e) => { e.preventDefault(); lookup(); });
const autostart = loadSettings();
updateWalletNote();
if (autostart) lookup();
window.__mohar = { lookup, decodeSensors, liveLine, state: () => current }; // for the tests in docs/handoff/dev-8.md
