"""DEV6-T7 / 0G3-T8: a long run. The board checkpoints by itself (Wi-Fi, real 0G, the chosen network) while the Pico
cycles through scenarios. The laptop is only the operator: it clears holds and tops up credit, and watches.
usage: python soak_test.py ESP_PORT PICO_PORT LEDGER MINUTES    (MOHAR_NET=public for the public devnet)
Pass criteria: no reset, every report mined (ledger sequence = checkpoints that sent ok), heap never below 8,000 bytes.
"""
import json, os, re, subprocess, sys, time
import serial
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from bridge import Board

ESP, PICO, LEDGER, MINUTES = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
NET = os.environ.get("MOHAR_NET", "local-alt")
ROOT = __file__.rsplit("/firmware/", 1)[0]


def node(*a):
    r = subprocess.run(["node", f"{ROOT}/signer/tools/ledger-cli.ts", *a], capture_output=True, text=True, env={**os.environ, "MOHAR_NET": NET}, cwd=ROOT)
    return json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 else None

pico = serial.Serial(); pico.port, pico.baudrate, pico.timeout = PICO, 115200, 0.2; pico.dtr = True; pico.open()
b = Board(ESP, "http://127.0.0.1:1/unused"); b.bridge_ok = False
b.reset(); b.wait("KEY READY", 0, 60)
pico.write(b"a")  # the Pico's automatic scenario cycle
t_start = time.time(); resets = 0; cps = 0; ok = 0; min_heap = 10**9; last_admin = 0; seen = 0
rows = []
print(f"soak: {MINUTES} min on {NET}, ledger {LEDGER}", flush=True)
while time.time() - t_start < MINUTES * 60:
    time.sleep(5)
    with b.lock:
        new = b.lines[seen:]; seen = len(b.lines)
    for _, l in new:
        if l.startswith("KEY READY") and time.time() - t_start > 20:
            resets += 1; print("!! the board reset:", l[:60], flush=True)
        if l.startswith("CP "):
            c = dict(re.findall(r"(\w+)=(\S+)", l)); cps += 1
            ok += c.get("sent") == "ok"
            if "heap" in c: min_heap = min(min_heap, int(c["heap"]))
            rows.append(l)
            print(f"  {int((time.time()-t_start)/60):2d} min  {c.get('mode')} reason={c.get('reason')} ai={c.get('ai')} seq={c.get('seq')} sent={c.get('sent')} heap={c.get('heap')} ms={c.get('ms')}", flush=True)
    if time.time() - last_admin > 150:  # operator: clear any hold, keep credit topped up
        last_admin = time.time()
        st = node("status", LEDGER)
        if st:
            if st["hold"]: node("clearhold", LEDGER)
            if st["creditPulses"] < 500: node("topup", LEDGER, "1500")
st = node("status", LEDGER)
pico.write(b"n")
b.stop = True
print(f"\nsoak finished: {cps} checkpoints, {ok} reports sent ok, resets={resets}, lowest heap seen in CP lines={min_heap}", flush=True)
print("ledger:", st, flush=True)
good = resets == 0 and st and st["lastSeq"] >= ok - 1 and min_heap >= 8000 and cps >= MINUTES * 0.8
print("SOAK PASS" if good else "SOAK CHECK FAILED", flush=True)
os.makedirs(f"{ROOT}/docs/evidence", exist_ok=True)
json.dump({"network": NET, "ledger": LEDGER, "minutes": MINUTES, "checkpoints": cps, "sentOk": ok, "resets": resets, "lowestHeap": min_heap, "finalLedger": st, "cpLines": rows}, open(f"{ROOT}/docs/evidence/soak-{NET}.json", "w"), indent=1)
