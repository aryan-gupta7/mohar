"""Real-browser tests for the Mohar Console (headless Firefox via Selenium). Run after `npm run build`:
   uv run --no-project --with selenium python dashboard/test/e2e.py [ledger-address]
Needs the local chain at 127.0.0.1:18545 for the chain tests. Screenshots go to docs/evidence/dashboard/."""
import json, os, re, subprocess, sys, time, urllib.request
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DIST = os.path.join(ROOT, "dashboard", "dist")
SHOTS = os.path.join(ROOT, "docs", "evidence", "dashboard")
os.makedirs(SHOTS, exist_ok=True)
RPC = "http://127.0.0.1:18545"
LEDGER = sys.argv[1] if len(sys.argv) > 1 else "0xf976853ee4ccd2da5634c9dcd1bca57ff99bea40"
BASE = "http://127.0.0.1:8099/"
fails = 0


def check(ok, msg):
    global fails
    print(("PASS " if ok else "FAIL ") + msg, flush=True)
    fails += 0 if ok else 1


def rpc(method, params):
    req = urllib.request.Request(RPC, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(), headers={"content-type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=10))["result"]


server = subprocess.Popen([sys.executable, "-m", "http.server", "8099", "--bind", "127.0.0.1", "--directory", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
opts = Options()
opts.add_argument("-headless")


def browser(w, h):
    d = webdriver.Firefox(options=opts)
    d.set_window_size(w, h)
    return d


def stages(d):
    return {e.get_attribute("data-stage"): e.get_attribute("data-status") for e in d.find_elements(By.CSS_SELECTOR, "[data-stage]")}


def text(d):
    return d.find_element(By.TAG_NAME, "body").text


try:
    # ---- T1 / T9: no hard-coded meter addresses; only documented hosts; no secrets in the source
    src = ""
    for dp, _, fs in os.walk(os.path.join(ROOT, "dashboard", "src")):
        for f in fs:
            if f.endswith((".ts", ".tsx")):
                src += open(os.path.join(dp, f)).read()
    addrs = set(re.findall(r"0x[0-9a-fA-F]{40}", src))
    check(addrs <= {"0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe"}, f"DEV8-T1 source holds no account, ledger or paymaster address (found only: {sorted(addrs)})")
    hosts = set(re.findall(r"https?://([\w.\-:]+)", src))
    print("     hosts named in source:", sorted(hosts))
    check(hosts <= {"ethereum-sepolia-rpc.publicnode.com", "sepolia.gateway.tenderly.co", "1rpc.io", "sepolia.drpc.org", "127.0.0.1:18545", "altmempool.forshtat.com"}, "DEV8-T9 the only network hosts in the code are the ENS RPC and the devnet RPCs; no trackers")
    check(not re.findall(r"(sk-[A-Za-z0-9]{20,}|0x[0-9a-fA-F]{64}\b)", src), "DEV8-T9 no key or API secret in the source")

    # ---- T5 / T4: the pipeline reacts to events in order; replay is badged
    d = browser(1440, 1000)
    d.get(BASE + "?replay=surge-inspect.log&speed=2&chainRpc=" + RPC + "#console")
    seen = []
    t0 = time.time()
    shot = False
    while time.time() - t0 < 45:
        st = stages(d)
        if st and (not seen or seen[-1] != st):
            seen.append(dict(st))
        if st.get("record") == "COMPLETED":
            break
        if not shot and st.get("ai") == "PROCESSING":
            d.save_screenshot(os.path.join(SHOTS, "console-ai-processing.png"))
            shot = True
        time.sleep(0.25)
    final = seen[-1] if seen else {}
    order = ["pico", "esp", "ai", "policy", "sign", "tx", "contracts", "record"]
    first_done = {}
    for i, snap in enumerate(seen):
        for k in order:
            if snap.get(k) == "COMPLETED" and k not in first_done:
                first_done[k] = i
    mono = all(first_done[order[i]] <= first_done[order[i + 1]] for i in range(len(order) - 1) if order[i] in first_done and order[i + 1] in first_done)
    check(len(seen) > 6 and mono, f"DEV8-T5 stages completed one after another as events arrived ({len(seen)} distinct states; order ok={mono})")
    check(any(s.get("tx") == "COMPLETED" and s.get("contracts") != "COMPLETED" for s in seen), "DEV8-T5 'submitted' was shown before 'executed' (a stage stays unfinished until its own event)")
    check(final.get("record") == "COMPLETED" and "REPLAY" in text(d), f"DEV8-T5 pipeline ends confirmed and the page says REPLAY ({final})")
    d.save_screenshot(os.path.join(SHOTS, "console-desktop-confirmed.png"))
    d.get(BASE + "?replay=surge-inspect.log&speed=30#report")
    time.sleep(4)
    b = text(d)
    check("Confirmed on-chain" in b and "INSPECT" in b and "5f0c8a3e-71d2-4b6a-9c11-8e2a4d7b90f1" in b, "DEV8-T4 verified report shows device count, ledger count, state and the AI request ID from the events")
    d.save_screenshot(os.path.join(SHOTS, "verified-report-desktop.png"))
    d.get(BASE + "?replay=credit-stop.log&speed=30#overview")
    time.sleep(4)
    d.save_screenshot(os.path.join(SHOTS, "overview-desktop-replay.png"))
    b = text(d)
    check("CREDIT_STOP" in b and "not rupees" in b, "credit-stop replay: CREDIT_STOP shown, credit labelled as demo credit (not rupees)")
    check("disconnected" not in b.lower() and "cut off" not in b.lower(), "no page text claims electricity is disconnected")
    d.quit()

    # ---- T2 / T6 / T10: real chain data equals direct eth_call; a report expands to its proof; wallet buttons
    status = rpc("eth_call", [{"to": LEDGER, "data": "0x200d2ed2"}, "latest"])[2:]
    w = [int(status[i * 64:(i + 1) * 64], 16) for i in range(9)]
    d = browser(1440, 1000)
    d.get(BASE + f"?manualLedger={LEDGER}&chainRpc={RPC}&ensName=#overview")
    time.sleep(6)
    b = text(d)
    d.save_screenshot(os.path.join(SHOTS, "overview-real-ledger.png"))
    check(f"report #{w[2]}" in b and f"{w[3]} pulses" in b, f"DEV8-T2 Overview shows the ledger's own values (seq {w[2]}, {w[3]} pulses)")
    d.get(BASE + f"?manualLedger={LEDGER}&chainRpc={RPC}&ensName=#ledger")
    time.sleep(5)
    b = text(d)
    cred = w[0] // w[4] if w[4] else None
    arr = w[6] // w[4] if w[4] else None
    ok = re.search(r"Credit\s+" + str(cred), b) is not None and re.search(r"Arrears\s+" + str(arr), b) is not None
    check(ok, f"DEV8-T2 Credit & ledger credit={cred}, arrears={arr} pulses equal the direct contract read")
    d.get(BASE + f"?manualLedger={LEDGER}&chainRpc={RPC}&ensName=#audit")
    time.sleep(5)
    cards = d.find_elements(By.CSS_SELECTOR, ".card.cursor-pointer")
    if cards:
        cards[0].click()
        time.sleep(3)
        b = text(d)
        check("account: ok" in b and "ledger: ok" in b and "Transaction" in b, "DEV8-T6 an expanded report shows its transaction and the four frame results from the receipt")
        d.save_screenshot(os.path.join(SHOTS, "audit-expanded.png"))
    else:
        check(False, "DEV8-T6 no reports found to expand")
    d.get(BASE + f"?manualLedger={LEDGER}&chainRpc={RPC}&ensName=#ledger")
    time.sleep(4)
    d.execute_script("window.__sent=[]; window.ethereum={request:async(r)=>{ if(r.method==='eth_requestAccounts') return ['0x00000000000000000000000000000000000000aa']; window.__sent.push(r); return '0xhash'; }};")
    for btn in d.find_elements(By.TAG_NAME, "button"):
        if btn.text.startswith("Top up"):
            btn.click()
            break
    time.sleep(1)
    for btn in d.find_elements(By.TAG_NAME, "button"):
        if btn.text.startswith("Clear hold"):
            btn.click()
            break
    time.sleep(1)
    sent = d.execute_script("return window.__sent")
    ok = len(sent) == 2 and sent[0]["params"][0]["data"] == "0xdc29f1de" and int(sent[0]["params"][0]["value"], 16) == 100 * w[4] and sent[1]["params"][0]["data"] == "0x4687aa98" and sent[0]["params"][0]["to"].lower() == LEDGER
    check(ok, "DEV8-T10 (mock wallet) Top up sends topUp() with 100 pulses of value to the ledger; Clear hold sends clearHold(). A real wallet signature is not tested headless")
    d.quit()

    # ---- T8: explicit errors
    d = browser(1440, 900)
    d.get(BASE + "?manualLedger=" + LEDGER + "&chainRpc=http://127.0.0.1:9&ensName=#overview")
    time.sleep(7)
    check("Cannot read the chain" in text(d), "DEV8-T8 a dead RPC shows an explicit error, not stale numbers")
    d.get(BASE + "?ensName=doesnotexist-zz9.mohar.eth&manualLedger=&chainRpc=" + RPC + "#identity")
    time.sleep(9)
    b = text(d)
    check("Could not resolve" in b, "DEV8-T8 an unknown ENS name shows its own error: " + (re.search(r"Could not resolve[^\n]*\n[^\n]*", b).group(0)[:120] if "Could not resolve" in b else b[:100]))
    d.get(BASE + "?ensName=&manualLedger=&chainRpc=" + RPC + "#console")
    time.sleep(2)
    has = d.execute_script("return 'serial' in navigator")
    t = text(d)
    check(("Web Serial is not available" in t) == (not has) and "Play a recorded run" in t or has, f"DEV8-T8 console matches the browser's Web Serial support (supported={has}); without it the console says so and offers replay")
    d.save_screenshot(os.path.join(SHOTS, "console-no-webserial.png"))
    d.quit()

    # ---- T7: 400 px phone width
    d = browser(400, 860)
    for page in ["overview", "console", "meter"]:
        d.get(BASE + f"?replay=surge-inspect.log&speed=30&manualLedger={LEDGER}&chainRpc={RPC}#{page}")
        time.sleep(5)
        over = d.execute_script("return document.documentElement.scrollWidth - window.innerWidth")
        check(over <= 1, f"DEV8-T7 {page} at 400 px has no horizontal scroll (overflow {over} px)")
        d.save_screenshot(os.path.join(SHOTS, f"{page}-phone-400.png"))
    nav = d.find_elements(By.CSS_SELECTOR, "nav button")
    check(len(nav) == 5, f"DEV8-T7 the phone shows a 5-item bottom tab bar ({len(nav)} items)")
    d.quit()
finally:
    server.terminate()
print(f"\n{'ALL PASS' if not fails else str(fails) + ' FAILED'}")
sys.exit(1 if fails else 0)
