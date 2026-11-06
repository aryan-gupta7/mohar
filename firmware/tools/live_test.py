"""0G-3 / EF-3 live run: the board on Wi-Fi, real 0G decisions, real reports on the chosen network, real pulses from the Pico.
No bridge: the laptop only drives the Pico, reads the board's log, and acts as operator on the ledger.
usage: python live_test.py ESP_PORT PICO_PORT LEDGER ACCOUNT PAYMASTER   (MOHAR_NET=public for the public devnet)
Writes docs/evidence/live-run-<network>.json with every EV/CP line.
"""
import json, os, re, subprocess, sys, time
import serial
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from bridge import Board

ESP, PICO, LEDGER, ACCOUNT, PAYMASTER = sys.argv[1:6]
NET = os.environ.get("MOHAR_NET", "local-alt")
ROOT = __file__.rsplit("/firmware/", 1)[0]
fails = 0


def check(ok, msg):
    global fails
    print(("PASS " if ok else "FAIL ") + msg, flush=True)
    fails += 0 if ok else 1


def node(*a):
    r = subprocess.run(["node", f"{ROOT}/signer/tools/ledger-cli.ts", *a], capture_output=True, text=True, env={**os.environ, "MOHAR_NET": NET}, cwd=ROOT)
    if r.returncode:
        raise RuntimeError(r.stderr[-300:])
    return json.loads(r.stdout.strip().splitlines()[-1])


pico = serial.Serial(); pico.port, pico.baudrate, pico.timeout = PICO, 115200, 0.2; pico.dtr = True; pico.open()
def load(k): pico.write(k.encode()); time.sleep(0.3)
def kv(l): return dict(re.findall(r"(\w+)=(\S+)", l))

RESUME = os.environ.get("RESUME") == "1"  # continue a run: the board is already provisioned and holds state
b = Board(ESP, "http://127.0.0.1:1/unused")
b.bridge_ok = False
b.reset(); b.wait("KEY READY", 0, 60); time.sleep(1.5)
for _ in range(10):
    try: b.cmd("loop off", "OK", 4); break
    except TimeoutError: pass
if not RESUME:
    b.cmd("state-reset", "OK")
host, port, fee, tip = ("altmempoolgateway.forshtat.com", "443", "5000000000", "2500000000") if NET == "public" else ("127.0.0.1", "14337", "2000000000", "1000000")
if not RESUME: b.cmd(f"provision {ACCOUNT} {LEDGER} {PAYMASTER} 1 {host} {port} 60 5000 {tip} {fee}", "PROVISIONED")
print("wifi:", b.cmd("wifi", "WIFI", 60), flush=True)
load("n"); b.cmd("window", "WINDOW", 10)
log = []
if RESUME: print("resuming", flush=True)


def checkpoint(timeout=180):
    for attempt in range(3):
        m = b.mark(); b.send("checkpoint-now")
        cp = kv(b.wait("CP ", m, timeout))
        if cp.get("chain") != "down":
            break
        print(f"     (chain unreachable at that moment: the board went SAFE_STOP as designed; retrying, attempt {attempt + 2})", flush=True)
        time.sleep(8)
    with b.lock:
        log.extend(l for _, l in b.lines[m:] if l.startswith(("EV ", "CP ")))
    if cp.get("sent") == "ok":
        t0 = time.time()
        while time.time() - t0 < 120:
            if node("status", LEDGER)["lastSeq"] >= int(cp["seq"]): break
            time.sleep(3)
        else:
            raise TimeoutError("report not mined in 120 s")
    return cp


def step(name, scen, wait):
    load(scen); time.sleep(wait)
    cp = checkpoint()
    print(f"     {name}: mode={cp['mode']} reason={cp['reason']} ai={cp['ai']} rid={cp['rid']} seq={cp['seq']} total={cp['total']} sent={cp['sent']} ms={cp['ms']} heap={cp['heap']}", flush=True)
    return cp


node("topup", LEDGER, "0") if False else None
if not RESUME:
  cp = step("normal 900 W", "n", 20)
  check(cp["mode"] == "RUN" and cp["ai"] == "0g" and len(cp["rid"]) > 20 and cp["sent"] == "ok", "a real 0G decision (RUN) drove a RUN report, mined, with its request id on the ledger event")

if not RESUME:
  cp = step("surge 12 kW", "s", 15)
  check(cp["mode"] == "INSPECT" and cp["ai"] == "0g" and cp["reason"] == "4", "0G said INSPECT for the surge; the device moved to INSPECT (reason 4, AI)")
  check(node("status", LEDGER)["hold"] is True, "the hold is set on the ledger")
  cp = step("back to normal", "n", 12)
  check(cp["mode"] == "INSPECT", "0G is asked again; whatever it says, the ledger hold keeps the device INSPECT")

(node("clearhold", LEDGER) if node("status", LEDGER)["hold"] else None); load("n"); b.cmd("window", "WINDOW", 10); time.sleep(12)
cp = checkpoint(); print(f"     after the operator cleared the hold: mode={cp['mode']} ai={cp['ai']}", flush=True)
check(cp["mode"] == "RUN", "after the operator cleared the hold and 0G said run: RUN")

load("g"); time.sleep(20)
cp = checkpoint(); print(f"     glitch line: mode={cp['mode']} reason={cp['reason']} ai={cp['ai']}", flush=True)
check(cp["mode"] == "INSPECT" and cp["reason"] == "2" and cp["ai"] == "none", "glitches: INSPECT from the fixed check, without calling 0G")

st = node("status", LEDGER)
print("     final ledger:", st)
os.makedirs(f"{ROOT}/docs/evidence", exist_ok=True)
json.dump({"network": NET, "ledger": LEDGER, "account": ACCOUNT, "paymaster": PAYMASTER, "finalLedger": st, "log": log}, open(f"{ROOT}/docs/evidence/live-run-{NET}.json", "w"), indent=1)
b.cmd("loop off", "OK"); b.stop = True
print(f"\n{'ALL PASS' if not fails else str(fails) + ' FAILED'}")
sys.exit(1 if fails else 0)
