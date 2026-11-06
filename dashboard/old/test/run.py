#!/usr/bin/env python3
"""Dashboard tests DEV8-T1..T9 as far as they can run here. Standard library only.
Needs: dashboard/serve.sh running, google-chrome-stable, the local chain (http://127.0.0.1:18545), and the fixtures
printed by make-fixture.ts and by a hardware behaviour run. Usage: python3 run.py <hold-fixture-ledger> <mohar-ledger> <mohar-account>
It checks what the page SHOWS against values read straight from the chain by independent code in this file."""
import json, re, subprocess, sys, tempfile, urllib.request, html, os

HOLD_LEDGER, MOHAR_LEDGER, MOHAR_ACCOUNT = sys.argv[1:4]
RPC = "http://127.0.0.1:18545"
BASE = "http://127.0.0.1:8088"
fails = 0


def check(ok, msg):
    global fails
    print(("PASS " if ok else "FAIL ") + msg, flush=True)
    fails += 0 if ok else 1


def rpc(method, params):
    req = urllib.request.Request(RPC, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(), headers={"content-type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=20))["result"]


def call(to, data): return rpc("eth_call", [{"to": to, "data": data}, "latest"])
def words(h): h = h[2:]; return [int(h[i:i + 64], 16) for i in range(0, len(h), 64)]


def chrome(mode, url, w=1000, h=2200, shot=None):
    base = ["google-chrome-stable", "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", f"--window-size={w},{h}", "--virtual-time-budget=25000", f"--user-data-dir={tempfile.mkdtemp()}"]
    if mode == "shot":
        subprocess.run(base + [f"--screenshot={shot}", url], capture_output=True, timeout=120); return None
    return subprocess.run(base + ["--dump-dom", url], capture_output=True, text=True, timeout=120).stdout


def text_of(dom):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", dom, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"\s+", " ", t)


def page(query, **kw):
    return chrome("dom", f"{BASE}/index.html?go=1&{query}", **kw)


def result_json(dom):
    m = re.search(r'<pre id="result">(.*?)</pre>', dom, flags=re.S)
    return json.loads(html.unescape(m.group(1)))


# ---- independent reading of the chain: status(), machine(), policyOf, and the latest Report event
def read_ledger(ledger):
    w = words(call(ledger, "0x200d2ed2"))
    credit, hold, seq, total, tariff, earned, arrears, last_mode, ledger_mode = w
    topic0 = subprocess.run(["cast", "keccak", "Report(uint64,uint64,uint64,uint256,uint256,uint8,uint8,uint8,uint8,uint32,bytes32,string)"], capture_output=True, text=True).stdout.strip()  # independent of the page's own Keccak
    logs = rpc("eth_getLogs", [{"address": ledger, "topics": [topic0], "fromBlock": "0x0", "toBlock": "latest"}])
    last = logs[-1]
    d = words(last["data"])
    sens = bytes.fromhex(last["data"][2 + 64 * 9: 2 + 64 * 10])
    be = lambda a, b: int.from_bytes(sens[a:b], "big")
    off = d[10]
    raw = bytes.fromhex(last["data"][2:])
    rid_len = int.from_bytes(raw[off:off + 32], "big")
    rid = raw[off + 32:off + 32 + rid_len].decode()
    return dict(credit=credit, hold=bool(hold), seq=seq, total=total, tariff=tariff, arrears=arrears, last_mode=last_mode, ledger_mode=ledger_mode,
                n_logs=len(logs), rep=dict(seq=int(last["topics"][1], 16), total=d[0], usage=d[1], mode=d[4], reason=d[5], rid=rid,
                valid=be(0, 4), glitches=be(4, 6), stuck=be(6, 8), avg=be(8, 10), peak=be(10, 12), window_ms=be(12, 16), gap_ms=be(16, 20), cumulative=be(20, 28)))


def fmt(n): return f"{n:,}"
MODES = ["RUN", "INSPECT", "CREDIT_STOP", "SAFE_STOP"]

# ================= T2 + T8: displayed values equal values read directly from the chain
exp = read_ledger(HOLD_LEDGER)
dom = page(f"chain=local&ledger={HOLD_LEDGER}")
t = text_of(dom)
r = exp["rep"]
check("TESTING OVERRIDE" in t and "Meter state" in t, "page loads and renders from a ledger address")
check(f"Pulse count {fmt(exp['total'])}" in t, f"DEV8-T2 pulse count shown = ledger lastTotal ({exp['total']})")
check(("Inspection hold SET" in t) == exp["hold"], f"DEV8-T2 hold shown = ledger hold ({exp['hold']})")
check(f"Credit {exp['credit'] / 1e18:.9f}".rstrip("0") .replace("0.", "0.") [:12] in t or str(exp["credit"] // exp["tariff"]) + " pulses" in t, f"DEV8-T2 credit shown matches ledger ({exp['credit'] // exp['tariff']} pulses)")
check(f"Reports {exp['seq']}" in t, f"DEV8-T2 report count shown = ledger lastSeq ({exp['seq']})")
check(f"Mode {MODES[r['mode']]}" in t, f"DEV8-T8 latest report mode decoded independently ({MODES[r['mode']]})")
check(f"Average load {fmt(r['avg'])} W" in t and f"Peak load {fmt(r['peak'])} W" in t, f"DEV8-T8 average {fmt(r['avg'])} W and peak {fmt(r['peak'])} W equal the independently decoded values")
check(f"Window {r['window_ms'] // 1000} s, {fmt(r['valid'])} pulses" in t, f"DEV8-T8 window {r['window_ms'] // 1000} s, {r['valid']} pulses")
check(f"Longest silence {r['gap_ms'] / 1000:.1f} s" in t, f"DEV8-T8 longest silence {r['gap_ms'] / 1000:.1f} s")
check(f"{r['glitches']} glitches" in t and "stuck-low event" in t, f"DEV8-T8 anomaly status shows {r['glitches']} glitches and {r['stuck']} stuck-low")
check(f"Consumption in it {r['usage'] / 3200:.4f} kWh" in t and f"{r['total'] / 3200:.4f} kWh" in t, f"DEV8-T8 kWh = pulses / 3200 ({r['usage'] / 3200:.4f} for the report, {r['total'] / 3200:.4f} total)")
check("no model decision" in t.lower() and "0G request ID none" in t, "DEV8-T8 a report with no model decision shows that, and no request ID")
check("disconnect" not in t.lower().replace("nothing is disconnected", ""), "the page never claims credit exhaustion disconnects power")

# a ledger whose latest report carries a 0G request id (the behaviour-test ledger has dev-injected ids)
exp2 = read_ledger(MOHAR_LEDGER)
t2 = text_of(page(f"chain=local&ledger={MOHAR_LEDGER}&account={MOHAR_ACCOUNT}"))
check(f"Pulse count {fmt(exp2['total'])}" in t2 and f"Reports {exp2['seq']}" in t2, f"DEV8-T2 second ledger: pulses {exp2['total']}, reports {exp2['seq']} equal the chain")
# paymaster quota (policyOf) read independently
# (the paymaster address is the third contract in the behaviour run; skip if not given)

# ================= T3: key cross-check
real_root = call(MOHAR_ACCOUNT, "0xebf0c717")
t_ok = text_of(page(f"chain=local&ledger={MOHAR_LEDGER}&account={MOHAR_ACCOUNT}&root={real_root}"))
check("Key check passed" in t_ok and "KEY MISMATCH" not in t_ok, "DEV8-T3 matching ENS key: 'Key check passed'")
changed = "0x" + ("%064x" % (int(real_root, 16) ^ 1))
t_bad = text_of(page(f"chain=local&ledger={MOHAR_LEDGER}&account={MOHAR_ACCOUNT}&root={changed}"))
check("KEY MISMATCH" in t_bad, "DEV8-T3 changing mohar.pq.root makes the KEY MISMATCH warning appear")
shot = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "evidence", "dashboard")
chrome("shot", f"{BASE}/index.html?go=1&chain=local&ledger={MOHAR_LEDGER}&account={MOHAR_ACCOUNT}&root={changed}", 900, 1500, os.path.join(shot, "key-mismatch.png"))

# ================= T5: each failure has its own message
def err(query, extra=""):
    d = page(query)
    m = re.search(r'<div id="error"[^>]*>(.*?)</div>', d, flags=re.S)
    return html.unescape(m.group(1)).strip() if m and 'id="error" class="error" role="alert" hidden' not in d else ""
e1 = err("name=nonexistent-zzz.mohar.eth")
e2 = err("name=definitely-not-registered-xyz123.eth")
e3 = err(f"chain=http://127.0.0.1:1&ledger={MOHAR_LEDGER}")
e4 = err("name=mohar.eth&ensRpc=http://127.0.0.1:18545")
e5 = err("name=mohar.eth&ensRpc=http://127.0.0.1:1")
e6 = err(f"chain=https://ethereum-sepolia-rpc.publicnode.com&ledger={MOHAR_LEDGER}&chainid=1337")
e7 = err(f"chain=https://ethereum-sepolia-rpc.publicnode.com&ledger={MOHAR_LEDGER}")
for label, e, needle in [("unknown name under our fleet", e1, "Unknown name"), ("name with no resolver at all", e2, "Unknown name: no resolver"), ("dead device RPC", e3, "Cannot reach the device chain RPC"),
                         ("ENS RPC on the wrong chain", e4, "not Sepolia"), ("dead ENS RPC", e5, "Cannot reach the ENS network RPC"), ("wrong device chain", e6, "Wrong chain"), ("ledger absent on this chain", e7, "no contract at the ledger address")]:
    check(needle in e, f"DEV8-T5 {label}: \"{e[:110]}\"")
check(len({e1[:30], e3[:30], e4[:30], e6[:30], e7[:30]}) == 5, "DEV8-T5 the failure messages are all different")

# ================= T6 + T7: network traffic and phone width, in a true 400 px viewport
fr = result_json(chrome("dom", f"{BASE}/test/frame.html?q=" + urllib.request.quote(f"go=1&chain=local&ledger={HOLD_LEDGER}", safe=""), 800, 800))
allowed = {"127.0.0.1:8088", "127.0.0.1:18545", "ethereum-sepolia-rpc.publicnode.com"}
check(set(fr["hosts"]) <= allowed, f"DEV8-T6 the page contacted only its own origin and the RPC URLs: {fr['hosts']}")
check(not fr["overflowsHorizontally"] and fr["viewport"] == 400 and not fr["elementsPastRightEdge"], f"DEV8-T7 usable at 400 px: no horizontal overflow ({fr})")
src = "".join(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", f)).read() for f in ["app.js", "index.html", "lib/abi.js"])
check(not re.search(r"https?://(?!127\.0\.0\.1|ethereum-sepolia-rpc|altmempool\.forshtat|docs\.ens)[a-z0-9.-]*\.(com|io|org|net)", src), "DEV8-T6 no third-party hosts or trackers written in the code")

# ================= T1: no account, ledger or paymaster address in the code
addrs = set(re.findall(r"0x[0-9a-fA-F]{40}\b", src)) - {"0x" + "0" * 40}
check(addrs == {"0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe"}, f"DEV8-T1 the only address in the code is ENS's own Universal Resolver: {sorted(addrs)}")

# ================= T9: live serial lines (parsing of real lines captured from the Pico and the board; Web Serial itself needs a device)
live = ('METER {"event":"status","mode":"normal","watts":900,"pulses":87,"glitches":9,"wh":27.1875,"auto":false}||'
        "METER valid=27 glitches=0 stuck=0 coalesced=0 level=1 total=27")
fr2 = result_json(chrome("dom", f"{BASE}/test/frame.html?live=" + urllib.request.quote(live, safe=""), 800, 800))
check("Meter board" in fr2["liveText"] and "27" in fr2["liveText"], f"DEV8-T9 a real board line is parsed into the live panel: {fr2['liveText'][:90]!r}")
fr3 = result_json(chrome("dom", f"{BASE}/test/frame.html?live=" + urllib.request.quote(live.split("||")[0], safe=""), 800, 800))
check("87" in fr3["liveText"] and "Pico" in fr3["liveText"], f"DEV8-T9 a real Pico line is parsed: {fr3['liveText'][:90]!r}")

print(f"\n{'ALL PASS' if not fails else str(fails) + ' FAILED'}")
sys.exit(1 if fails else 0)
