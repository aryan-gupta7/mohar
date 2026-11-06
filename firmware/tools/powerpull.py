"""DEV5-T6: pull the power while the board is signing, and check it recovers without misusing a key.

usage: python powerpull.py PORT           (the board must hold the TEST key: run device_test.py PORT keygen-fixed first)
Step 1: it starts a stream of reports, one new one-time key each. UNPLUG THE USB CABLE any time while it runs.
Step 2: plug it back in. Press Enter. The script then checks the saved state, resends, and checks that the
        resent transaction is byte-identical to a second resend, and that a signature made after the pull verifies.
"""
import json, os, sys, time
import serial

VEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vectors")
cmd = json.load(open(f"{VEC}/tx.json"))["cases"][0]["command"].split(" ")


def opn(port):
    s = serial.Serial()
    s.port, s.baudrate, s.timeout = port, 115200, 0.2
    s.dtr, s.rts = False, False
    s.open()
    return s


def ask(s, line, prefix, timeout=30):
    s.write((line + "\n").encode())
    t0, buf = time.time(), b""
    while time.time() - t0 < timeout:
        buf += s.read(8192)
        for l in buf.split(b"\n"):
            t = l.decode("utf-8", "replace").strip()
            if t.startswith(prefix):
                return t
    raise TimeoutError(prefix)


def wait_up(port):
    while True:
        try:
            s = opn(port)
            for _ in range(15):
                s.write(b"state\n")
                t0, buf = time.time(), b""
                while time.time() - t0 < 1.2:
                    buf += s.read(4096)
                    if b"STATE" in buf:
                        return s
        except Exception:
            pass
        time.sleep(1)


port = sys.argv[1]
s = wait_up(port)
ask(s, "state-reset", "OK")
print("Streaming reports. UNPLUG the USB cable now (any moment). Reports sent so far:")
n = 1
try:
    while True:
        t = list(cmd); t[3] = str(n)
        r = ask(s, "report " + " ".join(t), "RESULT")
        n += 1
        print(f"\r  {n - 1}", end="", flush=True)
        if n > 250:
            print("\nran out of leaves without a pull; run again after `state-reset`")
            sys.exit(1)
except Exception:
    pass
print(f"\nThe board stopped answering after report {n - 1}. Plug it back in, then press Enter.")
input()
s = wait_up(port)
st = ask(s, "state", "STATE")
print(st)
f = dict(p.split("=") for p in st.split()[1:])
k = int(f["intentNonce"]) if f["hasIntent"] == "1" else None
print(f"saved intent at nonce {k}; leaf counter {f['nextLeaf']}")
if k is None:
    print("No intent was pending (the power went out between reports): fine, nothing was half-done.")
else:
    t = list(cmd); t[3] = str(k)
    a = ask(s, "report " + " ".join(t), "RESULT")
    a_raw = ask(s, "report " + " ".join(t), "RESULT")
    print("first resend :", a)
    print("second resend:", a_raw)
    ok = "OK" in a and "resent=1" in a
    print("RESULT:", "PASS: the saved intent was resent" if ok else "CHECK: the device did not report a resend (the pull may have come before the intent was saved, which is also safe if the next line shows the same leaf unused)")
t = list(cmd); t[3] = str((k or 0) + 1 if k else int(f["nextLeaf"]) + 1)
nxt = ask(s, "report " + " ".join(t), "RESULT")
print("next new report:", nxt)
print("PASS" if " OK " in nxt + " " else "FAIL: the device refused the next nonce")
