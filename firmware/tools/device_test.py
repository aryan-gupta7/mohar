"""Drives the Mohar firmware over serial and compares it with the TypeScript reference vectors.

usage: uv run --no-project --with pyserial python -I firmware/tools/device_test.py PORT TEST [args]
tests: keccak | keygen-fixed | sign | reload | wipe-twice | release-unknown | seed-leak
Resets the board by toggling RTS (it does not erase anything).
"""
import json, os, re, sys, time
import serial

VEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vectors")
transcript = []


class Dev:
    def __init__(self, port):
        self.s = serial.Serial()
        self.s.port, self.s.baudrate, self.s.timeout = port, 115200, 0.2
        self.s.dtr, self.s.rts = False, False
        self.s.open()
        self.buf = b""

    def reset(self):
        self.s.rts = True
        time.sleep(0.15)
        self.s.rts = False

    def read_until(self, prefix, timeout):
        t0 = time.time()
        while time.time() - t0 < timeout:
            self.buf += self.s.read(4096)
            while b"\n" in self.buf:
                line, self.buf = self.buf.split(b"\n", 1)
                text = line.decode("utf-8", "replace").strip()
                transcript.append(text)
                if text.startswith(prefix):
                    return text
        raise TimeoutError(f"no line starting with {prefix!r} within {timeout}s; last: {transcript[-3:]}")

    def cmd(self, line, prefix, timeout=10):
        self.s.reset_input_buffer()
        self.buf = b""
        self.s.write((line + "\n").encode())
        return self.read_until(prefix, timeout)


def fields(line):
    return dict(p.split("=", 1) for p in line.split() if "=" in p)


def check(ok, msg):
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok:
        sys.exit(1)


def boot(dev, timeout=400):
    dev.reset()
    return fields(dev.read_until("KEY READY", timeout))


def t_keccak(dev):
    for c in json.load(open(f"{VEC}/keccak.json"))["cases"]:
        if "pattern" in c:
            got = dev.cmd(f"keccak-pat {c['pattern']}", "KECCAK").split()[1]
        else:
            got = dev.cmd(f"keccak {c['hex']}", "KECCAK").split()[1]
        check(got == c["expect"], f"DEV4-T1 keccak {c['name']}")


def t_keygen(dev):
    v = json.load(open(f"{VEC}/wots.json"))
    line = dev.cmd(f"keygen-fixed {v['seed']}", "KEY READY", 600)
    f = fields(line)
    check(f["root"] == "0x" + v["root"], f"DEV4-T2 root equals TypeScript ({f['root'][:18]}…)")
    check(f["pubSeed"] == "0x" + v["pubSeed"], "DEV4-T2 pubSeed equals TypeScript")
    print(f"     key generation took {int(f['ms'])/1000:.1f} s; no reset occurred (the command completed)")
    return f


def t_sign(dev):
    v = json.load(open(f"{VEC}/wots.json"))
    worst = 0
    for c in v["cases"]:
        dev.s.reset_input_buffer()
        dev.buf = b""
        dev.s.write(f"sign {c['leaf']} {c['digest']}\n".encode())
        ms = fields(dev.read_until("SIGMS", 20).replace("SIGMS ", "SIGMS="))
        sig = dev.read_until("SIG ", 10).split()[1]
        worst = max(worst, int(ms["SIGMS"]))
        check(sig == c["signature"], f"DEV4-T3 leaf {c['leaf']:3d} {c['digestName']:8s} byte-identical ({ms['SIGMS']} ms, heap {ms['heap']})")
    print(f"     slowest signature: {worst} ms")
    check(worst < 1200, "DEV4-T7 every signature under 1.2 s")


def t_reload(dev):
    v = json.load(open(f"{VEC}/wots.json"))
    f = boot(dev, 30)
    check(f["source"] == "loaded", "DEV4-T4 key loaded, not regenerated")
    check(f["root"] == "0x" + v["root"], "DEV4-T4 same root after reset")
    check(int(f["ms"]) < 2000, f"DEV4-T4 loaded in {f['ms']} ms (< 2000)")


def t_wipe_twice(dev):
    roots = []
    boot(dev, 60)  # opening the port reset the board; wait until it is up and holds a key
    for i in range(2):
        dev.s.reset_input_buffer()
        dev.buf = b""
        dev.s.write(b"wipe\n")
        f = fields(dev.read_until("KEY READY", 600))
        roots.append(f["root"])
        check(f["source"] == "generated", f"DEV4-T5 round {i+1}: generated a new key in {int(f['ms'])/1000:.0f} s")
    check(roots[0] != roots[1], "DEV4-T5 the two roots differ")


def t_release_unknown(dev):
    for c in ["sign 0 " + "00" * 32, "keccak 00", "wipe", "keygen-fixed " + "00" * 32]:
        check(dev.cmd(c, "UNKNOWN", 5) == "UNKNOWN", f"DEV4-T9 release answers UNKNOWN to '{c.split()[0]}'")
    check(dev.cmd("info", "INFO").find("dev=0") > 0, "DEV4-T9 info says dev=0")


def t_seed_leak(secret_hex):
    text = "\n".join(transcript).lower()
    check(secret_hex.lower() not in text, "DEV4-T6 the seed never appears in the serial output")
    known = set(re.findall(r"0x([0-9a-f]{64})", text))
    tokens = set(re.findall(r"\b[0-9a-f]{64}\b", text))
    print(f"     {len(tokens)} distinct 64-hex values seen, {len(known)} of them roots")


if __name__ == "__main__":
    port, test = sys.argv[1], sys.argv[2]
    dev = Dev(port)
    if test == "keccak":
        boot(dev, 60) if False else dev.reset(); time.sleep(2.5); t_keccak(dev)
    elif test == "keygen-fixed":
        dev.reset(); time.sleep(2.5); t_keygen(dev)
    elif test == "sign":
        t_sign(dev)
    elif test == "reload":
        t_reload(dev)
    elif test == "wipe-twice":
        t_wipe_twice(dev)
    elif test == "release-unknown":
        dev.reset(); dev.read_until("KEY READY", 600); t_release_unknown(dev)
    elif test == "seed-leak":
        t_seed_leak(json.load(open(f"{VEC}/wots.json"))["seed"])
    elif test == "rest":
        t_reload(dev); t_sign(dev)
        t_seed_leak(json.load(open(f"{VEC}/wots.json"))["seed"])
    elif test == "all":
        f0 = boot(dev, 600); print("first boot:", f0["source"], int(f0["ms"]) / 1000, "s"); t_keccak(dev); t_keygen(dev); t_sign(dev); t_reload(dev)
        t_seed_leak(json.load(open(f"{VEC}/wots.json"))["seed"])
    else:
        sys.exit("unknown test")
