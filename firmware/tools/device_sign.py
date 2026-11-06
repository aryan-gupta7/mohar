"""Asks the board for its public key or a signature. Prints one JSON object. Does not reset the board.
usage: python device_sign.py PORT info
       python device_sign.py PORT sign LEAF DIGEST_HEX
"""
import json, sys, time
import serial

port, what = sys.argv[1], sys.argv[2]
s = serial.Serial()
s.port, s.baudrate, s.timeout = port, 115200, 0.2
s.dtr, s.rts = False, False
s.open()
s.reset_input_buffer()


pending = b""


def read_line(prefix, timeout):
    global pending
    t0 = time.time()
    while time.time() - t0 < timeout:
        pending += s.read(4096)
        while b"\n" in pending:
            line, pending = pending.split(b"\n", 1)
            text = line.decode("utf-8", "replace").strip()
            if text.startswith(prefix):
                return text
    raise TimeoutError(prefix)


def wait_ready():
    # Opening the port resets this board, so ask until it answers (boot takes about 2 s).
    for _ in range(30):
        s.write(b"info\n")
        try:
            return read_line("INFO", 1.2)
        except TimeoutError:
            pass
    raise TimeoutError("board did not answer 'info'")


line = wait_ready()
if what == "info":
    f = dict(p.split("=", 1) for p in line.split() if "=" in p)
    print(json.dumps({"root": f["root"], "pubSeed": f["pubSeed"]}))
elif what == "sign":
    s.write(f"sign {sys.argv[3]} {sys.argv[4]}\n".encode())
    ms = read_line("SIGMS", 20).split()[1]
    sig = read_line("SIG ", 10).split()[1]
    print(json.dumps({"ms": int(ms), "signature": "0x" + sig}))

if what == "report":
    # report <args...>: the board builds, saves its intent, signs, and returns the finished transaction.
    s.write(("report " + " ".join(sys.argv[3:]) + "\n").encode())
    res = read_line("RESULT", 60)
    out = {"result": res.split()[1], "fields": dict(p.split("=", 1) for p in res.split() if "=" in p)}
    if out["result"] == "OK":
        out["raw"] = "0x" + read_line("RAW ", 30).split(" ", 1)[1]
    print(json.dumps(out))

if what == "submit":
    # submit <host> <port> <tls> <report args...>: the board signs and sends the transaction itself over Wi-Fi.
    s.write(b"wifi\n")
    wifi = read_line("WIFI", 60)
    if "ok=1" not in wifi:
        print(json.dumps({"error": "wifi: " + wifi}))
        sys.exit(1)
    s.write(("submit " + " ".join(sys.argv[3:]) + "\n").encode())
    # The board answers SUBMIT on success, or RESULT <refusal> / ERROR <why> instead.
    first = None
    t_end = time.time() + 90
    while first is None and time.time() < t_end:
        pending_chunk = s.read(4096)
        pending += pending_chunk
        while b"\n" in pending:
            line, pending = pending.split(b"\n", 1)
            text = line.decode("utf-8", "replace").strip()
            if text.startswith(("SUBMIT", "RESULT", "ERROR")):
                first = text
                break
    if first is None:
        print(json.dumps({"error": "no answer from the board"})); sys.exit(1)
    if not first.startswith("SUBMIT"):
        print(json.dumps({"error": first})); sys.exit(1)
    out = {"submit": dict(p.split("=", 1) for p in first.split() if "=" in p)}
    out["localHash"] = read_line("LOCALHASH", 10).split()[1]
    b = read_line("BODY", 10).split(" ", 1)
    out["body"] = b[1] if len(b) > 1 else ""
    print(json.dumps(out))

if what == "reset":
    # Test setup only (dev firmware): forget the key-safety state, for a freshly deployed account.
    s.write(b"state-reset\n")
    print(json.dumps({"reset": read_line("OK", 10)}))
