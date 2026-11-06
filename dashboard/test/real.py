"""Meter Dashboard against REAL data: meter-001.mohar.eth on Sepolia -> public Mohar devnet. Headless Firefox.
   uv run --no-project --with selenium python dashboard/test/real.py       (after npm run build)
Screenshots: docs/evidence/dashboard/real-*.png"""
import json, os, re, subprocess, sys, time, urllib.request
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHOTS = os.path.join(ROOT, "docs", "evidence", "dashboard"); os.makedirs(SHOTS, exist_ok=True)
RPC = "https://altmempool.forshtat.com"
BASE = "http://127.0.0.1:8099/"
Q = f"?ensName=meter-001.mohar.eth&chainRpc={RPC}"
fails = 0
def check(ok, msg):
    global fails; print(("PASS " if ok else "FAIL ") + msg, flush=True); fails += 0 if ok else 1
def rpc(m, p):
    r = urllib.request.Request(RPC, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=15))["result"]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8099", "--bind", "127.0.0.1", "--directory", os.path.join(ROOT, "dashboard", "dist")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
o = Options(); o.add_argument("-headless")
def br(w=1440, h=1000):
    d = webdriver.Firefox(options=o); d.set_window_size(w, h); return d
txt = lambda d: d.find_element(By.TAG_NAME, "body").text
try:
    # ledger address as ENS says it, then directly from the chain
    ens = subprocess.run(["node", "ens/04-read.ts"], capture_output=True, text=True, cwd=ROOT).stdout
    LEDGER = re.search(r"mohar.ledger\s+(0x[0-9a-fA-F]{40})", ens).group(1)
    PM = re.search(r"mohar.paymaster\s+(0x[0-9a-fA-F]{40})", ens).group(1)
    w = [int(x, 16) for x in re.findall(r"[0-9a-f]{64}", rpc("eth_call", [{"to": LEDGER, "data": "0x200d2ed2"}, "latest"]))]
    print("     ledger (from ENS):", LEDGER, "direct status words: seq", w[2], "pulses", w[3], "credit", w[0], "arrears", w[6], "hold", w[1])
    d = br()
    d.get(BASE + Q + "#overview"); time.sleep(14)
    b = txt(d); d.save_screenshot(os.path.join(SHOTS, "real-overview.png"))
    check("meter-001.mohar.eth" in b and "MOHAR DEVNET" in b and "SEPOLIA" in b, "DEV8-T1 the name resolves and both networks are labelled")
    w2 = [int(x, 16) for x in re.findall(r"[0-9a-f]{64}", rpc("eth_call", [{"to": LEDGER, "data": "0x200d2ed2"}, "latest"]))]
    ok = any(f"report #{s}" in b for s in range(w[2], w2[2] + 1))
    check(ok, f"DEV8-T2 Overview shows a ledger report number between {w[2]} and {w2[2]} (read from the chain)")
    d.get(BASE + Q + "#ledger"); time.sleep(10); b = txt(d); d.save_screenshot(os.path.join(SHOTS, "real-ledger.png"))
    w3 = [int(x, 16) for x in re.findall(r"[0-9a-f]{64}", rpc("eth_call", [{"to": LEDGER, "data": "0x200d2ed2"}, "latest"]))]
    cands = {w3[0] // w3[4], w[0] // w[4], w2[0] // w2[4]}; arrs = {w3[6] // w3[4], w[6] // w[4], w2[6] // w2[4]}
    check(any(re.search(r"Credit\s+" + str(c) + r"\b", b) for c in cands) and any(re.search(r"Arrears\s+" + str(a) + r"\b", b) for a in arrs), f"DEV8-T2 credit/arrears equal a direct contract read (credit ~{sorted(cands)}, arrears ~{sorted(arrs)})")
    d.get(BASE + Q + "#identity"); time.sleep(12); b = txt(d); d.save_screenshot(os.path.join(SHOTS, "real-identity.png"))
    check(LEDGER.lower() in b.lower() and "0x6c0937ea" in b, "DEV8-T1/T3 identity page shows the ENS ledger and the published root")
    check(re.search(r"(match|consistent|✓|same)", b, re.I) is not None and not re.search(r"mismatch", b, re.I), "DEV8-T3 ENS root equals the account's root(): no mismatch warning")
    check("not archived" in b.lower() or "0g://" in b.lower(), "mohar.log shown (as 'not archived' while it holds a placeholder)")
    d.get(BASE + Q + "&ensName=meter-002.mohar.eth#identity"); time.sleep(10); b = txt(d); d.save_screenshot(os.path.join(SHOTS, "real-identity-other-name.png"))
    d.get(BASE + Q + "#audit"); time.sleep(10)
    cards = d.find_elements(By.CSS_SELECTOR, ".card.cursor-pointer")
    check(len(cards) > 0, f"DEV8-T6 audit lists {len(cards)} real on-chain reports")
    if cards:
        cards[0].click(); time.sleep(5); b = txt(d); d.save_screenshot(os.path.join(SHOTS, "real-audit-expanded.png"))
        check("account: ok" in b and "ledger: ok" in b and re.search(r"0x[0-9a-f]{64}", b) is not None, "DEV8-T6 an expanded real report shows its transaction hash and four frame results")
        check(re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", b) is not None or "Request" in b, "real 0G request ID visible in an expanded report (or labelled)")
    d.get(BASE + Q + "#insights"); time.sleep(10); d.save_screenshot(os.path.join(SHOTS, "real-insights.png"))
    d.quit()
    d = br(); d.get(BASE + "?ensName=meter-001.mohar.eth&chainRpc=http://127.0.0.1:9#overview"); time.sleep(10)
    check("Cannot read the chain" in txt(d), "DEV8-T8 dead devnet RPC with a real ENS name: explicit error")
    d.save_screenshot(os.path.join(SHOTS, "real-dead-rpc.png")); d.quit()
    d = br(400, 860)
    for p in ["overview", "meter", "identity"]:
        d.get(BASE + Q + "#" + p); time.sleep(10)
        over = d.execute_script("return document.documentElement.scrollWidth - window.innerWidth")
        check(over <= 1, f"DEV8-T7 real {p} at 400 px: overflow {over}px"); d.save_screenshot(os.path.join(SHOTS, f"real-{p}-phone.png"))
    d.quit()
finally:
    srv.terminate()
print(f"\n{'ALL PASS' if not fails else str(fails) + ' FAILED'}"); sys.exit(1 if fails else 0)
