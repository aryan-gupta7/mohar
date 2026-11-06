"""DEV5-T6: pull the power while the board is signing, and check it recovers without misusing a key.

usage: python powerpull.py PORT start     streams reports (each uses a new one-time key) until the board stops answering
       python powerpull.py PORT check     after the board is plugged back in: checks the saved state and recovery
The board must hold the TEST key (device_test.py PORT keygen-fixed). `start` resets the key-safety counter first.
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


def wait_up(port, give_up=120):
    t0 = time.time()
    while time.time() - t0 < give_up:
        try:
            s = opn(port)
            for _ in range(15):
                s.write(b"state\n")
                t1, buf = time.time(), b""
                while time.time() - t1 < 1.2:
                    buf += s.read(4096)
                    if b"STATE" in buf:
                        return s
        except Exception:
            pass
        time.sleep(1)
    raise SystemExit("the board did not come back within 2 minutes")


def with_nonce(n):
    t = list(cmd)
    t[3] = str(n)
    return " ".join(t)


port, mode = sys.argv[1], sys.argv[2]
if mode == "start":
    s = wait_up(port)
    ask(s, "state-reset", "OK")
    print("STREAMING: reports are being signed, one new key each. Unplug the USB cable at any moment.", flush=True)
    n = 1
    try:
        while n <= 250:
            ask(s, "report " + with_nonce(n), "RESULT", timeout=5)
            n += 1
            print(f"  reports done: {n - 1}", flush=True)
    except Exception:
        pass
    print(f"STOPPED: the board stopped answering after report {n - 1}. Plug it back in.", flush=True)
else:
    s = wait_up(port)
    st = ask(s, "state", "STATE")
    f = dict(p.split("=") for p in st.split()[1:])
    print(st)
    pend = f["hasIntent"] == "1"
    leaf_counter = int(f["nextLeaf"])
    if pend:
        k = int(f["intentNonce"])
        print(f"A signing was in progress at nonce {k} (leaf {k - 1}); its intent was saved before the signature existed.")
        a = ask(s, "report " + with_nonce(k), "RESULT")
        b = ask(s, "report " + with_nonce(k), "RESULT")
        print("resend 1:", a)
        print("resend 2:", b)
        ok1 = " OK " in a + " " and "resent=1" in a
        print("PASS: the saved intent was resent, not re-signed with a different message" if ok1 else "CHECK THIS: the board did not report a resend")
        nxt = k + 1
    else:
        print("No signing was in progress when the power went (it fell between two reports): nothing was half-done.")
        nxt = leaf_counter + 1
    r = ask(s, "report " + with_nonce(nxt), "RESULT")
    print("next new report:", r)
    print("PASS: the board signs normally after the pull" if " OK " in r + " " else "FAIL: the board refused the next report")
