"""ENS-3: discovery and permission demo, against the live Sepolia resolver. Headless Firefox. Reads only; sends nothing.
   uv run --no-project --with selenium python dashboard/test/ens3.py      (after npm run build)"""
import os, re, subprocess, sys, time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHOTS = os.path.join(ROOT, "docs", "evidence", "dashboard")
BASE = "http://127.0.0.1:8098/"; Q = "?ensName=meter-001.mohar.eth&chainRpc=https://altmempool.forshtat.com"
fails = 0
def check(ok, msg):
    global fails; print(("PASS " if ok else "FAIL ") + msg, flush=True); fails += 0 if ok else 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8098", "--bind", "127.0.0.1", "--directory", os.path.join(ROOT, "dashboard", "dist")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
o = Options(); o.add_argument("-headless")
d = webdriver.Firefox(options=o); d.set_window_size(1440, 1500)
txt = lambda: d.find_element(By.TAG_NAME, "body").text
def preset(label):
    for b in d.find_elements(By.TAG_NAME, "button"):
        if b.text.strip() == label: b.click(); break
    else: raise SystemExit("no preset " + label)
    for _ in range(40):
        r = d.find_elements(By.CSS_SELECTOR, "[data-testid=edit-result]")
        if r and ("ALLOWED" in r[0].text or "REJECTED" in r[0].text): return r[0].text
        time.sleep(1)
    return ""
try:
    d.get(BASE + Q + "#identity")
    for _ in range(40):
        if "Who can change what" in txt() and "meter-001.mohar.eth" in txt() and "Try this edit" in txt(): break
        time.sleep(1)
    time.sleep(8); b = txt(); d.save_screenshot(os.path.join(SHOTS, "ens3-panel.png"))
    check("meter-001.mohar.eth" in b and "Resolver" in b and "Account (chain 1337)" in b, "ENS3-T1 the name alone leads to live machine data (resolver, account, records)")
    check("Sepolia identity records" in b and "do not control the meter" in b, "panel separates Sepolia identity records from the Mohar devnet contracts")
    cases = [("Maintenance → maintenance status", "ALLOWED", None), ("Maintenance → cryptographic root", "REJECTED", "EACUnauthorizedAccountRoles"),
             ("Uploader → 0G log", "ALLOWED", None), ("Uploader → operating policy", "REJECTED", "EACUnauthorizedAccountRoles"),
             ("Stranger → maintenance status", "REJECTED", "EACUnauthorizedAccountRoles")]
    for label, want, err in cases:
        r = preset(label); print("     ", label, "->", r.replace("\n", " | ")[:200])
        d.save_screenshot(os.path.join(SHOTS, "ens3-" + re.sub(r"\W+", "-", label.lower()) + ".png"))
        ok = want in r and "Simulated against the live contract" in r and "Nothing is sent" in r and (err is None or (err in r and "0x4b27a133" in r))
        check(ok, f"ENS3-T2 {label}: {want}" + (f" with the contract's real error {err} (0x4b27a133)" if err else ""))
    # T3: the maintenance record shown is the live one
    live = subprocess.run(["node", "ens/04-read.ts"], capture_output=True, text=True, cwd=ROOT).stdout
    m = re.search(r"mohar.maintenance.status\s+(.+)", live).group(1).strip()
    check(m in txt(), f"ENS3-T3 the page shows the live mohar.maintenance.status ('{m}'): a later edit shows up with no code change")
    check("Mohar meter-001" in txt() or "prepaid electricity meter" in txt(), "ENS3-T4 the agent-context record resolves and describes the machine")
finally:
    d.quit(); srv.terminate()
# T5: no machine address in the code (persona addresses live in public/demo-roles.json, which is configuration)
machine = ["0xdfa2765aba66e1949eec8851d99e3829eb6c4276", "0xde1a12a99add47ccc79b1ccd2eb48f90b0b551d1", "0xee2271689fd1ea51f9953b31fa8fd85002e35ba6", "0x81407d1c7c9f482a1cdcc00110e7a0dad374758a"]
hits = subprocess.run("grep -ril -E '%s' src index.html" % "|".join(m[2:] for m in machine), shell=True, capture_output=True, text=True, cwd=os.path.join(ROOT, "dashboard")).stdout.split()
check(not hits, f"ENS3-T5 no account, ledger, paymaster or resolver address is hard-coded in src/ (hits: {hits})")
print(f"\n{'ALL PASS' if not fails else str(fails) + ' FAILED'}"); sys.exit(1 if fails else 0)
