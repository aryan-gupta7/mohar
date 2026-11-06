#!/usr/bin/env node
// Mohar control centre. One place to see every service, which port it owns, whether it is healthy, and to start, stop,
// restart and diagnose it. No dependencies.
//
//   node ctl/mohar.mjs                 status of everything (same as `status`)
//   node ctl/mohar.mjs up [service|all]      start (default: the local development stack)
//   node ctl/mohar.mjs down [service|all]    stop
//   node ctl/mohar.mjs restart <service>
//   node ctl/mohar.mjs logs <service> [lines]
//   node ctl/mohar.mjs ports           every listening port, and who owns it
//   node ctl/mohar.mjs doctor          checks everything, says what is wrong and the exact fix
//   node ctl/mohar.mjs free <port>     stops whatever is holding a port (asks no questions: read `ports` first)
//   npm run ctl -- status              the same thing through npm
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const STATE = path.join(ROOT, ".state");
const PIDS = path.join(STATE, "pids");
const LOGS = path.join(STATE, "logs");
fs.mkdirSync(PIDS, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

const ESP_PORT = "/dev/serial/by-id/usb-1a86_USB_Single_Serial_5717135611-if00";
const PICO_PORT = "/dev/serial/by-id/usb-Raspberry_Pi_Pico_E662588817693B2C-if00";
const SIDECAR_SRC_CANDIDATES = [
  process.env.SIDECAR_SRC,
  path.join(STATE, "sidecar-src"),
  "/tmp/claude-1000/-home-s1nn3r-Documents-ethglobal/6d67b437-c8d5-4b3c-b03f-6c843960dd10/scratchpad/ext/sidecar/repo",
].filter(Boolean);

const c = { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", bold: "\x1b[1m", off: "\x1b[0m" };
const tty = process.stdout.isTTY;
const paint = (col, s) => (tty ? c[col] + s + c.off : s);
const OK = paint("green", "● up"), DOWN = paint("red", "○ down"), WARN = paint("yellow", "◐ ");

const sh = (cmd, args = [], opt = {}) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: opt.timeout ?? 8000, cwd: opt.cwd ?? ROOT }).trim();
  } catch {
    return "";
  }
};
async function rpc(url, method, params = [], timeout = 6000) {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(timeout) });
    return (await r.json()).result;
  } catch {
    return undefined;
  }
}
const pidFile = (n) => path.join(PIDS, n + ".pid");
const readPid = (n) => (fs.existsSync(pidFile(n)) ? Number(fs.readFileSync(pidFile(n), "utf8")) : 0);
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };

// ---- who owns each listening port ------------------------------------------------------------------------------
function listeners() {
  const out = sh("ss", ["-H", "-ltnp"]);
  const rows = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const cols = line.trim().split(/\s+/);
    const local = cols[3] ?? "";
    const port = Number(local.slice(local.lastIndexOf(":") + 1));
    const proc = (line.match(/users:\(\("([^"]+)",pid=(\d+)/) ?? []).slice(1);
    rows.push({ port, addr: local, name: proc[0] ?? "", pid: Number(proc[1] ?? 0) });
  }
  return rows;
}
const who = (pid) => { const a = sh("ps", ["-p", String(pid), "-o", "args="]); return a ? `${pid} (${a.slice(0, 70)})` : String(pid); };
const portOwner = (port) => listeners().find((l) => l.port === port);

// ---- services ------------------------------------------------------------------------------------------------------
const bg = (name, cmd, args, opt = {}) => {
  const log = fs.openSync(path.join(LOGS, name + ".log"), "a");
  const child = spawn(cmd, args, { cwd: opt.cwd ?? ROOT, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...opt.env } });
  child.unref();
  fs.writeFileSync(pidFile(name), String(child.pid));
  return child.pid;
};
const killTree = (pid) => { try { process.kill(-pid, "SIGTERM"); } catch { try { process.kill(pid, "SIGTERM"); } catch {} } };

const SERVICES = {
  chain: {
    label: "Local chain (ethrex in Docker)", ports: [18545, 18551], group: "dev",
    note: "RPC 18545, Engine API 18551, both on 127.0.0.1",
    async status() {
      const running = sh("docker", ["ps", "--filter", "name=mohar-ethrex", "--format", "{{.Status}}"]);
      if (!running) return { up: false, detail: "container not running" };
      const n = await rpc("http://127.0.0.1:18545", "eth_blockNumber");
      return { up: n !== undefined, detail: n ? `block ${parseInt(n, 16)}` : "container up but RPC not answering", warn: n === undefined };
    },
    start: async () => { sh("bash", ["devnet/up.sh"], { timeout: 120000 }); return "started (fresh chain; contracts must be redeployed)"; },
    stop: async () => { sh("docker", ["rm", "-f", "mohar-ethrex"]); return "removed container"; },
  },
  producer: {
    label: "Block producer (drives the local chain)", ports: [], group: "dev", note: "makes a block every second; without it the chain stands still",
    async status() {
      const pid = readPid("producer");
      if (!alive(pid)) return { up: false, detail: "not running" };
      const a = await rpc("http://127.0.0.1:18545", "eth_blockNumber");
      await new Promise((r) => setTimeout(r, 2500));
      const b = await rpc("http://127.0.0.1:18545", "eth_blockNumber");
      const moving = a !== undefined && b !== undefined && b !== a;
      return { up: moving, warn: !moving, detail: moving ? `pid ${pid}, producing blocks` : `pid ${pid} but blocks are not advancing` };
    },
    start: async () => `pid ${bg("producer", "node", ["devnet/producer.ts", "1"])}`,
    stop: async () => { killTree(readPid("producer")); fs.rmSync(pidFile("producer"), { force: true }); return "stopped"; },
  },
  sidecar: {
    label: "Alt mempool sidecar (local)", ports: [14337], group: "dev", note: "ERC-8421 admission rules, RPC on 127.0.0.1:14337; bundles every 1 s locally",
    async status() {
      const id = await rpc("http://127.0.0.1:14337/rpc", "eth_chainId");
      const pid = readPid("sidecar");
      return { up: id === "0x539", detail: id === "0x539" ? `chain 1337${alive(pid) ? `, pid ${pid}` : ", (not started by this tool)"}` : alive(pid) ? "process alive, not answering yet" : "not running", warn: id !== "0x539" && alive(pid) };
    },
    start: async () => {
      const src = SIDECAR_SRC_CANDIDATES.find((p) => fs.existsSync(path.join(p, "packages/cli/bin/skandha.js")));
      return `pid ${bg("sidecar", "bash", ["devnet/sidecar.sh"], { env: src ? { SIDECAR_SRC: src } : {} })}${src ? "" : " (first run builds the sidecar: several minutes)"}`;
    },
    stop: async () => { killTree(readPid("sidecar")); const o = portOwner(14337); if (o?.pid) killTree(o.pid); fs.rmSync(pidFile("sidecar"), { force: true }); return "stopped"; },
  },
  dashboard: {
    label: "Dashboard (Mohar Console)", ports: [8088], group: "dev", note: "http://127.0.0.1:8088/ . Open it in desktop Chrome for Web Serial",
    async status() {
      const o = portOwner(8088);
      if (!o) return { up: false, detail: "not running" };
      let ok = false, title = "";
      try {
        const r = await fetch("http://127.0.0.1:8088/", { signal: AbortSignal.timeout(4000) });
        const t = await r.text();
        ok = r.ok;
        title = (t.match(/<title>([^<]*)/) ?? [])[1] ?? "";
      } catch {}
      const mine = readPid("dashboard") && alive(readPid("dashboard"));
      return { up: ok, warn: ok && !mine, detail: `${o.name || "?"} pid ${o.pid} serves "${title}"${mine ? "" : "  ← NOT started by this tool (a leftover? `free 8088` then `up dashboard`)"}` };
    },
    start: async () => {
      const o = portOwner(8088);
      if (o) return `port 8088 is already held by ${o.name} pid ${o.pid}. Run: node ctl/mohar.mjs free 8088`;
      const dir = path.join(ROOT, "dashboard");
      if (!fs.existsSync(path.join(dir, "node_modules"))) sh("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir, timeout: 240000 });
      return `pid ${bg("dashboard", "npm", ["run", "dev"], { cwd: dir })}  → http://127.0.0.1:8088/`;
    },
    stop: async () => { killTree(readPid("dashboard")); const o = portOwner(8088); if (o?.pid && o.name !== "chrome") killTree(o.pid); fs.rmSync(pidFile("dashboard"), { force: true }); return "stopped"; },
  },
};

// ---- things that are not ours to start, only to check ----------------------------------------------------------
async function externals() {
  const rows = [];
  const serial = (label, p) => {
    if (!fs.existsSync(p)) return rows.push({ name: label, up: false, detail: "not plugged in / not detected" });
    const holder = sh("bash", ["-c", `fuser ${JSON.stringify(fs.realpathSync(p))} 2>/dev/null`]).trim();
    rows.push({ name: label, up: true, warn: !!holder, detail: `${path.basename(fs.realpathSync(p))}${holder ? `  ← held by ${who(holder.split(/\s+/)[0])}. Only one program may hold a serial port` : ", free"}` });
  };
  serial("ESP8266 (device)", ESP_PORT);
  serial("Pico H (meter simulator)", PICO_PORT);
  // The hotspot's name comes from the git-ignored secrets.h, never from tracked code.
  const secretsFile = path.join(ROOT, "firmware/mohar/src/secrets.h");
  const ssid = fs.existsSync(secretsFile) ? (fs.readFileSync(secretsFile, "utf8").match(/MOHAR_WIFI_SSID\s+"([^"]*)"/) ?? [])[1] : undefined;
  const wifi = ssid ? sh("nmcli", ["-t", "-f", "SSID,CHAN,FREQ", "dev", "wifi", "list", "--rescan", "yes"], { timeout: 15000 }).split("\n").find((l) => l.startsWith(ssid + ":")) : undefined;
  if (!wifi) rows.push({ name: "Hotspot for the ESP", up: false, detail: "not visible from the laptop" });
  else {
    const chan = Number(wifi.split(":")[1]);
    rows.push({ name: "Hotspot for the ESP", up: chan <= 14, warn: chan > 14, detail: chan <= 14 ? `2.4 GHz, channel ${chan}${chan >= 12 ? " (high 2.4 GHz channel: fine for the ESP8266, but if it won't join, set the phone to channel 1, 6 or 11)" : ""}` : `5 GHz (channel ${chan}): the ESP8266 can NOT join. Switch the hotspot to 2.4 GHz` });
  }
  const pub = await rpc("https://altmempool.forshtat.com", "eth_blockNumber");
  rows.push({ name: "Public devnet (EF)", up: pub !== undefined, detail: pub ? `block ${parseInt(pub, 16)}` : "unreachable" });
  const sep = await rpc("https://ethereum-sepolia-rpc.publicnode.com", "eth_blockNumber");
  rows.push({ name: "Sepolia (ENS)", up: sep !== undefined, detail: sep ? `block ${parseInt(sep, 16)}` : "unreachable" });
  const zg = await rpc("https://evmrpc-testnet.0g.ai", "eth_blockNumber");
  rows.push({ name: "0G Galileo (Storage)", up: zg !== undefined, detail: zg ? `block ${parseInt(zg, 16)}` : "unreachable" });
  let models = false;
  try { models = (await fetch("https://router-api.0g.ai/v1/models", { signal: AbortSignal.timeout(6000) })).ok; } catch {}
  rows.push({ name: "0G Router (inference)", up: models, detail: models ? "reachable" : "unreachable" });
  const me = "0xcfb296f635254A4B3281D2e285174E98D643Ef60";
  const eth = (h) => (h === undefined ? "?" : (Number(BigInt(h)) / 1e18).toFixed(4));
  rows.push({ name: "Funds at the deployer", up: true, detail: `Sepolia ${eth(await rpc("https://ethereum-sepolia-rpc.publicnode.com", "eth_getBalance", [me, "latest"]))} ETH · devnet ${eth(await rpc("https://altmempool.forshtat.com", "eth_getBalance", [me, "latest"]))} ETH · 0G ${eth(await rpc("https://evmrpc-testnet.0g.ai", "eth_getBalance", [me, "latest"]))}` });
  return rows;
}

// ---- commands --------------------------------------------------------------------------------------------------
const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
async function status() {
  console.log(paint("bold", "\nMohar control centre") + paint("dim", `   ${new Date().toLocaleTimeString()}   (${ROOT})\n`));
  console.log(paint("bold", "Services this tool starts and stops"));
  for (const [name, s] of Object.entries(SERVICES)) {
    const st = await s.status();
    const flag = st.up ? (st.warn ? WARN + "up?" : OK) : st.warn ? WARN + "stuck" : DOWN;
    const ports = s.ports.length ? ":" + s.ports.join(",:") : "";
    console.log(`  ${pad(name, 10)} ${pad(strip(flag), 8).replace(strip(flag), flag)} ${pad(ports, 14)} ${st.detail}`);
  }
  console.log(paint("bold", "\nHardware, networks and funds (checked, not started)"));
  for (const r of await externals()) {
    const flag = r.up ? (r.warn ? WARN + "check" : OK) : DOWN;
    console.log(`  ${pad(r.name, 26)} ${pad(strip(flag), 8).replace(strip(flag), flag)} ${r.detail}`);
  }
  console.log(paint("dim", "\n  up [service|all] · down [service|all] · restart <service> · logs <service> · ports · doctor · free <port>\n"));
}
async function ports() {
  const known = { 18545: "chain RPC", 18551: "chain Engine API", 14337: "alt mempool sidecar", 8088: "dashboard", 4337: "sidecar p2p", 8008: "sidecar metrics" };
  console.log(paint("bold", "\nListening TCP ports") + paint("dim", "  (only those on 127.0.0.1 or all interfaces)\n"));
  console.log(`  ${pad("PORT", 7)}${pad("ADDRESS", 22)}${pad("PROCESS", 16)}${pad("PID", 9)}MEANING`);
  for (const l of listeners().sort((a, b) => a.port - b.port)) {
    const meaning = known[l.port] ? paint("green", known[l.port]) : paint("dim", "(not a Mohar port)");
    console.log(`  ${pad(String(l.port), 7)}${pad(l.addr, 22)}${pad(l.name || "?", 16)}${pad(String(l.pid || ""), 9)}${meaning}`);
  }
  console.log();
}
const targets = (arg, def) => (!arg ? def : arg === "all" ? Object.keys(SERVICES) : [arg]);
async function up(arg) {
  for (const n of targets(arg, ["chain", "producer", "sidecar"])) {
    const s = SERVICES[n];
    if (!s) { console.log(`unknown service ${n}`); continue; }
    if ((await s.status()).up && n !== "chain") { console.log(`  ${n}: already up`); continue; }
    console.log(`  ${n}: ${await s.start()}`);
    if (n === "chain") await new Promise((r) => setTimeout(r, 4000));
  }
  await new Promise((r) => setTimeout(r, 3000));
  await status();
}
async function down(arg) {
  for (const n of targets(arg, ["dashboard", "sidecar", "producer", "chain"]).reverse().reverse()) {
    const s = SERVICES[n];
    if (!s) { console.log(`unknown service ${n}`); continue; }
    console.log(`  ${n}: ${await s.stop()}`);
  }
}
async function doctor() {
  console.log(paint("bold", "\nDoctor\n"));
  const problems = [];
  const chain = await SERVICES.chain.status(), prod = await SERVICES.producer.status(), side = await SERVICES.sidecar.status(), dash = await SERVICES.dashboard.status();
  if (!chain.up) problems.push(["The local chain is not running", "node ctl/mohar.mjs up chain   (then redeploy contracts: a fresh chain is empty)"]);
  else if (!prod.up) problems.push(["The chain has no block producer, so transactions never get mined", "node ctl/mohar.mjs up producer"]);
  if (chain.up && !side.up) problems.push(["The alt mempool sidecar is not answering", "node ctl/mohar.mjs up sidecar   (first start can take a minute)"]);
  const o8088 = portOwner(8088);
  if (o8088 && !readPid("dashboard")) problems.push([`Port 8088 is held by ${o8088.name} pid ${o8088.pid}, not by this tool. A new dashboard cannot start`, "node ctl/mohar.mjs free 8088 && node ctl/mohar.mjs up dashboard"]);
  if (!o8088) problems.push(["The dashboard is not running", "node ctl/mohar.mjs up dashboard"]);
  if (!fs.existsSync(path.join(ROOT, "dashboard/node_modules"))) problems.push(["Dashboard dependencies are not installed", "cd dashboard && npm install   (`up dashboard` does this for you)"]);
  if (!fs.existsSync(path.join(ROOT, "contracts/out/MachineLedger.sol"))) problems.push(["Contracts are not built", "npm run build"]);
  if (!fs.existsSync(path.join(ROOT, ".secrets/deployer.key"))) problems.push(["No deployer key", "it is created on first use; fund the address it prints"]);
  if (!fs.existsSync(path.join(ROOT, "firmware/mohar/src/secrets.h"))) problems.push(["firmware/mohar/src/secrets.h is missing (Wi-Fi and 0G key)", "copy secrets.example.h to secrets.h and fill it in"]);
  for (const r of await externals()) {
    if (!r.up) problems.push([`${r.name}: ${r.detail}`, "see docs/ and the README"]);
    else if (r.warn && !r.name.includes("device") && !r.name.includes("Pico")) problems.push([`${r.name}: ${r.detail}`, "fix as described in the message"]);
  }
  for (const [n, p] of [["ESP8266", ESP_PORT], ["Pico", PICO_PORT]]) {
    const holder = fs.existsSync(p) ? sh("bash", ["-c", `fuser ${JSON.stringify(fs.realpathSync(p))} 2>/dev/null`]).trim() : "";
    if (holder) problems.push([`The ${n}'s serial port is held by ${who(holder.split(/\s+/)[0])}`, `stop that program (a running soak or test, a serial monitor, or another browser tab). The dashboard's Web Serial cannot share a port with it`]);
  }
  if (!problems.length) return console.log(paint("green", "  Nothing wrong found.\n"));
  problems.forEach(([what, fix], i) => console.log(`  ${paint("red", String(i + 1) + ".")} ${what}\n     ${paint("green", "fix:")} ${fix}\n`));
}
async function free(arg) {
  const port = Number(arg);
  const o = portOwner(port);
  if (!o) return console.log(`port ${port} is free`);
  console.log(`stopping ${o.name} pid ${o.pid} (holding port ${port})`);
  killTree(o.pid);
  await new Promise((r) => setTimeout(r, 1000));
  console.log(portOwner(port) ? "still held: it may belong to another user or to Docker. Use `down chain` for the chain." : "port is free now");
}
function logs(name, lines = 40) {
  const f = path.join(LOGS, name + ".log");
  if (!fs.existsSync(f)) return console.log(`no log for ${name} yet (${f})`);
  console.log(sh("tail", ["-n", String(lines), f]));
}

const [cmd = "status", a1, a2] = process.argv.slice(2);
({
  status, ports, doctor,
  up: () => up(a1), down: () => down(a1),
  restart: async () => { await down(a1); await up(a1); },
  logs: async () => logs(a1, a2),
  free: () => free(a1),
}[cmd] ?? (() => console.log("commands: status · up · down · restart <svc> · logs <svc> · ports · doctor · free <port>")))();
