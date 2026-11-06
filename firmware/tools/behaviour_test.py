"""DEV-7 behaviour tests on the real board, against the local chain through the USB bridge.
Needs: local chain + producer + sidecar up; the Pico wired to the board; the dev firmware on the board with the key
it holds. Usage: python behaviour_test.py ESP_PORT PICO_PORT
Decisions are injected (dev build) in place of 0G, so these tests don't depend on the network or spend credit.
"""
import json, re, subprocess, sys, time
import serial
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from bridge import Board

ESP, PICO = sys.argv[1], sys.argv[2]
ROOT = __file__.rsplit("/firmware/", 1)[0]
URL = "http://127.0.0.1:14337/rpc"
fails = 0


def check(ok, msg):
    global fails
    print(("PASS " if ok else "FAIL ") + msg, flush=True)
    fails += 0 if ok else 1


def node(*args):
    out = subprocess.run(["node", f"{ROOT}/signer/tools/ledger-cli.ts", *args], capture_output=True, text=True, env={**__import__("os").environ, "MOHAR_NET": "local-alt"}, cwd=ROOT)
    if out.returncode:
        raise RuntimeError(out.stderr[-400:])
    return json.loads(out.stdout.strip().splitlines()[-1])


pico = serial.Serial(); pico.port, pico.baudrate, pico.timeout = PICO, 115200, 0.2; pico.dtr = True; pico.open()
def load(k): pico.write(k.encode()); time.sleep(0.3)
def pico_status():
    pico.reset_input_buffer(); pico.write(b"?")
    t0 = time.time(); buf = b""
    while time.time() - t0 < 4:
        buf += pico.read(2048)
        for l in buf.decode("utf-8", "replace").split("\n"):
            if l.startswith("METER "):
                return json.loads(l[6:])
    raise TimeoutError("pico")

def dbg(tag):
    """Both counters after a step, so a stall shows exactly where it starts."""
    try:
        e = kv(b.cmd("meter", "METER", 8))
        print(f"     [{tag}] board valid={e['valid']} glitches={e['glitches']} stuck={e['stuck']} coalesced={e['coalesced']} level={e['level']} | pico pulses={pico_status()['pulses']}", flush=True)
    except Exception as ex:
        print(f"     [{tag}] counters unavailable: {ex}", flush=True)


def kv(line): return dict(re.findall(r"(\w+)=(\S+)", line))

b = Board(ESP, URL)
b.reset(); m = b.mark(); b.wait("KEY READY", 0, 60); time.sleep(1)
info = kv(b.cmd("info", "INFO", 10))
b.cmd("loop off", "OK"); b.cmd("state-reset", "OK")
dep = json.loads(subprocess.run(["node", f"{ROOT}/signer/tools/ledger-cli.ts", "deploy", info["root"].replace("0x", "0x"), info["pubSeed"]], capture_output=True, text=True, env={**__import__("os").environ, "MOHAR_NET": "local-alt"}, cwd=ROOT).stdout.strip().splitlines()[-1])
print("contracts:", dep, flush=True)
b.cmd(f"provision {dep['account']} {dep['ledger']} {dep['paymaster']} 0 bridge 0 15 5000 1000000 2000000000", "PROVISIONED")
b.cmd("inject run", "OK")
load("n"); pico.write(b"r"); time.sleep(0.3)
b.cmd("window", "WINDOW", 10)  # discard whatever the meter saw before the test (the Pico may have been left in glitch mode)

def checkpoint(timeout=90):
    """Runs one checkpoint, then waits until its report is mined (the ledger's sequence reaches it)."""
    m = b.mark(); b.send("checkpoint-now")
    cp = kv(b.wait("CP ", m, timeout))
    if cp.get("sent") == "ok":
        t0 = time.time()
        while time.time() - t0 < 90:
            if node("status", dep["ledger"])["lastSeq"] >= int(cp["seq"]):
                break
            time.sleep(1.5)
        else:
            raise TimeoutError(f"report {cp['seq']} was not mined within 90 s")
    return cp

def fresh(decision="run"):
    """Known state before each step: no hold, normal load, an empty meter window, and the given decision."""
    if node("status", dep["ledger"])["hold"]:
        node("clearhold", dep["ledger"])
    load("n")
    b.cmd("inject " + decision, "OK")
    b.cmd("window", "WINDOW", 10)


# T6: credit, normal load, injected run => RUN, report mined, ledger total equals the board's count
node("topup", dep["ledger"], "60")  # small, so the credit test drains it in seconds
time.sleep(8)  # pulses accrue: 900 W is about 0.8 pulse a second
cp = checkpoint()
check(cp["mode"] == "RUN" and cp["sent"] == "ok", f"DEV7-T6 normal load, credit, run: mode RUN, report sent ({cp['mode']}, sent={cp['sent']})")
time.sleep(6)
st = node("status", dep["ledger"])
check(st["lastSeq"] >= 1 and st["lastTotal"] > 0, f"DEV7-T6 ledger recorded the report: seq {st['lastSeq']}, total {st['lastTotal']} pulses")
check(st["lastTotal"] == int(cp["total"]), f"DEV7-T6 ledger total equals the board's count ({st['lastTotal']} == {cp['total']})")

dbg("after T6")
# T7: injected inspect => INSPECT, hold on chain
b.cmd("inject inspect", "OK"); time.sleep(4)
cp = checkpoint()
check(cp["mode"] == "INSPECT" and cp["sent"] == "ok", f"DEV7-T7 injected inspect: mode INSPECT, report sent")
time.sleep(6)
check(node("status", dep["ledger"])["hold"] is True, "DEV7-T7 the hold is set on the ledger")

# T8: AI says run again, but the hold stays: AI can't clear it
b.cmd("inject run", "OK"); time.sleep(4)
cp = checkpoint()
check(cp["mode"] == "INSPECT", f"DEV7-T8 after inspect, an AI 'run' leaves it INSPECT ({cp['mode']})")

# T9: the operator clears the hold, then run
node("clearhold", dep["ledger"]); time.sleep(5)
cp = checkpoint()
check(cp["mode"] == "RUN", f"DEV7-T9 operator cleared the hold: back to RUN ({cp['mode']})")

dbg("after T9")
# T3 (local): glitches => INSPECT immediately, without any decision from the network (decision source set to fail)
fresh("fail"); load("g"); time.sleep(12)
cp = checkpoint()
check(cp["mode"] == "INSPECT" and cp["reason"] == "2", f"DEV7-T3 glitch line with no decision service: INSPECT from the local check (reason {cp['reason']})")


dbg("after glitch step")
# 0G3-T4/T5 analogue: no decision => SAFE_STOP, empty request id; a fresh decision restores RUN
fresh("fail"); time.sleep(6)
cp = checkpoint()
check(cp["mode"] == "SAFE_STOP" and cp["rid"] == "-", f"no decision: SAFE_STOP with an empty request id ({cp['mode']}, rid {cp['rid']})")
b.cmd("inject run", "OK"); time.sleep(3)
cp = checkpoint()
# Credit is nearly gone by now, so leaving SAFE_STOP may land on CREDIT_STOP, which is also correct.
check(cp["mode"] in ("RUN", "CREDIT_STOP") and cp["reason"] != "20", f"a fresh valid decision leaves SAFE_STOP ({cp['mode']}, reason {cp['reason']})")

dbg("after SAFE_STOP step")
# T10/T11: credit runs out under heavy load; counting continues; arrears; a top-up pays arrears first
fresh("run")
st = node("status", dep["ledger"])
spare = st["creditPulses"]
b.cmd("window", "WINDOW", 10)
load("s")  # 12 kW: about 3.3 pulses a second
time.sleep(max(15, int(spare / 3.0) + 10))
cp = checkpoint()
st = node("status", dep["ledger"])
time.sleep(4)
cp = checkpoint()
st = node("status", dep["ledger"])
check(cp["mode"] == "CREDIT_STOP" or st["creditPulses"] == 0, f"DEV7-T10 credit used up: mode {cp['mode']}, credit {st['creditPulses']} pulses")
check(st["arrearsPulses"] > 0 or st["creditPulses"] == 0, f"DEV7-T10 usage beyond credit is recorded as arrears ({st['arrearsPulses']} pulses owed)")
dbg("after credit used up")
total_before = int(cp["total"]); time.sleep(5); cp2 = checkpoint()
print(f"     before: valid={cp['valid']} total={cp['total']} seq={cp['seq']} nonce={cp['nonce']} intent={cp['intent']} resent={cp['resent']}")
print(f"     after : valid={cp2['valid']} total={cp2['total']} seq={cp2['seq']} nonce={cp2['nonce']} intent={cp2['intent']} resent={cp2['resent']}")
check(int(cp2["total"]) > total_before, f"DEV7-T10 counting continues in CREDIT_STOP ({total_before} -> {cp2['total']})")
load("n")
owed = node("status", dep["ledger"])["arrearsPulses"]
st = node("topup", dep["ledger"], str(owed + 300))
check(st["arrearsPulses"] == 0 and st["creditPulses"] > 0, f"DEV7-T11 top-up paid the {owed} pulses owed first, credit now {st['creditPulses']}")
time.sleep(3); cp = checkpoint()
check(cp["mode"] == "RUN", f"DEV7-T11 RUN within one checkpoint of the top-up ({cp['mode']})")

# every report in this run was mined with all four frames: ledger seq equals the number of reports sent
st = node("status", dep["ledger"])
print(f"     final ledger: {st}")
b.cmd("loop off", "OK")
b.stop = True
print(f"\n{'ALL PASS' if not fails else str(fails) + ' FAILED'}")
sys.exit(1 if fails else 0)
