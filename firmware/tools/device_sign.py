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
