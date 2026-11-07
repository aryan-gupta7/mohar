"""0G3-T4 and T5 on the real board: block 0G, expect SAFE_STOP with an empty request ID and the pulses still counted;
restore 0G, expect a fresh valid decision with a real request ID.
Needs the dev firmware (the `zgblock` command) and the board on USB. Usage: python zg_safe_stop_test.py /dev/ttyACM1 [log file]
Opening the port resets the board; the test waits for the first checkpoint, then blocks 0G before the next one."""
import json, sys, time
import serial

port = sys.argv[1]
logfile = sys.argv[2] if len(sys.argv) > 2 else "zg_safe_stop_test.log"
s = serial.Serial(); s.port, s.baudrate, s.timeout = port, 115200, 0.3; s.dtr = True; s.open()
log = []
def line():
    l = s.readline().decode("utf-8", "replace").rstrip()
    if l: log.append(f"{time.strftime('%H:%M:%S')} {l}")
    return l
def until(pred, secs):
    t0 = time.time()
    while time.time() - t0 < secs:
        l = line()
        if l and pred(l): return l
def cmd(c):
    s.write((c + "\n").encode()); r = until(lambda l: l.strip() == "OK", 8); print(f">> {c}: {r}", flush=True)
def next_cp(secs=240):
    t0 = time.time()
    while time.time() - t0 < secs:
        l = line()
        if l and any(k in l for k in ('"e":"ai_response', '"e":"decision', '"e":"submitted')): print(log[-1][:300], flush=True)
        if l and l.startswith("CP mode"): print(log[-1][:400], flush=True); return l
print("waiting for the first checkpoint after boot", flush=True)
until(lambda l: l.startswith("CP mode"), 150)
cmd("zgblock on"); print("T4: 0G blocked", flush=True); t4 = next_cp()
cmd("zgblock off"); print("T5: 0G restored", flush=True); t5 = next_cp()
open(logfile, "w").write("\n".join(log))
ok4 = bool(t4) and "mode=SAFE_STOP" in t4 and "rid=-" in t4
ok5 = bool(t5) and "mode=SAFE_STOP" not in t5 and "rid=-" not in t5
print(json.dumps({"T4": ok4, "T5": ok5}))
sys.exit(0 if ok4 and ok5 else 1)
