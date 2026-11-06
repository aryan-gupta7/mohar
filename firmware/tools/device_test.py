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
    r = fields(dev.read_until("KEY READY", timeout))
    # A board that was provisioned runs its checkpoint loop; switch it off so Wi-Fi and RPC traffic can't interleave with the test.
    for _ in range(8):
        try:
            dev.cmd("loop off", "OK", 3)
            break
        except TimeoutError:
            pass
    return r


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



# ----------------------------------------------------------------------------- DEV-5
def tx_vectors():
    return json.load(open(f"{VEC}/tx.json"))["cases"]


def with_nonce(cmd, nonce):
    t = cmd.split(" ")
    t[3] = str(nonce)
    return " ".join(t)


def with_total(cmd, total):
    t = cmd.split(" ")
    t[7] = str(total)
    return " ".join(t)


def read_build(dev):
    out = {}
    out["BUILD"] = fields(dev.read_until("BUILD", 20))
    for k in ["CALLDATA", "DIGEST", "RAW", "JSON"]:
        out[k] = dev.read_until(k + " ", 20).split(" ", 1)[1]
    return out


def t_tx_vectors(dev):
    bad = 0
    for c in tx_vectors():
        dev.s.reset_input_buffer(); dev.buf = b""
        dev.s.write(("build " + c["command"] + "\n").encode())
        o = read_build(dev)
        e = c["expect"]
        ok = (int(o["BUILD"]["steps"]) == e["steps"] and int(o["BUILD"]["salt"]) == e["salt"] and o["CALLDATA"] == e["calldata"]
              and o["DIGEST"] == e["digest"] and o["RAW"] == e["raw"] and json.loads(o["JSON"]) == e["json"])
        bad += 0 if ok else 1
        print(("ok   " if ok else "FAIL ") + c["name"] + (f"  (guard raised salt to {e['salt']})" if e["salt"] else ""))
    check(bad == 0, f"DEV5-T1 {len(tx_vectors())} vectors match on calldata, digest, raw bytes and JSON")
    g = [c for c in tx_vectors() if c["firstSteps"] > 630][0]
    check(g["expect"]["salt"] > 0 and g["expect"]["steps"] <= 630, f"DEV5-T2 the guard case needed {g['firstSteps']} steps, ended at {g['expect']['steps']} with salt {g['expect']['salt']}")


def report(dev, cmd):
    dev.s.reset_input_buffer(); dev.buf = b""
    dev.s.write(("report " + cmd + "\n").encode())
    res = dev.read_until("RESULT", 60)
    f = fields(res)
    f["name"] = res.split()[1]
    raw = None
    if f["name"] == "OK":
        raw = dev.read_until("RAW ", 30).split(" ", 1)[1]
    return f, raw


def cmd_for(nonce_case):
    return [c for c in tx_vectors() if c["name"].startswith(f"nonce {nonce_case}, ")]


def t_leaf_safety(dev):
    cases = tx_vectors()
    n1 = cases[0]          # nonce 1
    cmd1 = n1["command"]
    dev.cmd("state-reset", "OK", 5)
    f, raw = report(dev, cmd1)
    check(f["name"] == "OK" and raw == n1["expect"]["signedRaw"], "DEV5-T9a board-built signed transaction equals the TypeScript one byte for byte")
    f2, raw2 = report(dev, cmd1)
    check(f2["name"] == "OK" and f2["resent"] == "1" and raw2 == raw, "DEV5-T4 same content at a used leaf gives byte-identical output")
    f3, _ = report(dev, with_total(cmd1, 424242))
    check(f3["name"] == "LEAF_USED", "DEV5-T3 different content at a used leaf is refused with LEAF_USED")

    # T5: crash after saving the intent, and after signing, then retry
    for point in ["after_intent", "after_sign"]:
        dev.cmd("state-reset", "OK", 5)
        dev.cmd("crash-at " + point, "OK", 5)
        dev.s.reset_input_buffer(); dev.buf = b""
        dev.s.write(("report " + cmd1 + "\n").encode())
        dev.read_until("CRASH", 30)
        dev.read_until("KEY READY", 30)
        st = fields(dev.cmd("state", "STATE", 5))
        check(st["hasIntent"] == "1" and st["intentNonce"] == "1" and st["nextLeaf"] == "1", f"DEV5-T5 after a crash at {point} the intent is on flash")
        f, raw = report(dev, cmd1)
        check(f["name"] == "OK" and f["resent"] == "1" and raw == n1["expect"]["signedRaw"], f"DEV5-T5 after {point}: the device rebuilds the identical transaction")

    # T7: the reboot and nonce table, with injected nonces
    c2 = with_nonce(cmd1, 2)
    c3 = with_nonce(cmd1, 3)
    dev.cmd("state-reset", "OK", 5)
    f, _ = report(dev, cmd1); check(f["name"] == "OK" and f["leaf"] == "0", "DEV5-T7 no intent, chain nonce 1: normal, leaf 0")
    f, _ = report(dev, c2);  check(f["name"] == "OK" and f["cleared"] == "1" and f["leaf"] == "1", "DEV5-T7 intent at 1, chain at 2: marked done, moves on with leaf 1")
    f, _ = report(dev, cmd1); check(f["name"] == "CHAIN_BEHIND", "DEV5-T7 intent at 2, chain at 1: refuses to sign")
    f, _ = report(dev, c2);  check(f["name"] == "OK" and f["resent"] == "1", "DEV5-T7 intent at 2, chain at 2: resends identical")
    f, _ = report(dev, c3);  check(f["name"] == "OK" and f["cleared"] == "1" and f["leaf"] == "2", "DEV5-T7 intent at 2, chain at 3: done, leaf 2")
    dev.cmd("set-leaf 10", "OK", 5)
    f, _ = report(dev, with_nonce(cmd1, 5));  check(f["name"] == "CHAIN_BEHIND", "DEV5-T7 no intent, counter 10, chain nonce 5: refuses (a reset chain or lying RPC)")
    f, _ = report(dev, with_nonce(cmd1, 20)); check(f["name"] == "OK" and f["jumped"] == "1" and f["leaf"] == "19", "DEV5-T7 no intent, chain ahead: jumps forward to leaf 19")
    dev.cmd("state-reset", "OK", 5)
    f, _ = report(dev, with_nonce(cmd1, 0));  check(f["name"] == "BAD_NONCE", "DEV5-T7 nonce 0 is refused")

    # T8: exhaustion
    n256 = [c for c in cases if c["name"].startswith("nonce 256, ")][0]
    dev.cmd("set-leaf 255", "OK", 5)
    f, raw = report(dev, n256["command"])
    check(f["name"] == "OK" and f["leaf"] == "255" and raw == n256["expect"]["signedRaw"], "DEV5-T8 leaf 255 signs, byte-identical to TypeScript")
    f, _ = report(dev, with_nonce(n256["command"], 257))
    check(f["name"] == "KEYS_EXHAUSTED", "DEV5-T8 the next request gets KEYS_EXHAUSTED")
    dev.cmd("state-reset", "OK", 5)
    # Regression: a reset must survive a reboot (an older, higher-numbered slot once won).
    boot(dev, 60)
    st = fields(dev.cmd("state", "STATE", 5))
    check(st["nextLeaf"] == "0" and st["hasIntent"] == "0", "DEV5 a state reset survives a reboot")


# ----------------------------------------------------------------------------- DEV-6
def t_net(dev):
    cases = tx_vectors()
    c = cases[0]
    # T5: the request body the network code streams equals the library's JSON, byte-for-byte as parsed JSON
    dev.cmd("state-reset", "OK", 5)
    dev.s.reset_input_buffer(); dev.buf = b""
    dev.s.write(("body " + c["command"] + "\n").encode())
    body = dev.read_until("BODY ", 30).split(" ", 1)[1]
    expect = {"jsonrpc": "2.0", "id": 1, "method": "eth_sendFrameTransaction", "params": [c["expect"]["signedWire"]]}
    check(json.loads(body) == expect, "DEV6-T5 streamed request body equals the library's JSON-RPC body")
    check(body.count('"signature":"0x') == 1 and len(body) > 5000, f"DEV6-T5 body is {len(body)} bytes, with one 2,400-byte signature")

    # T1/T2: Wi-Fi and TLS read from the public gateway
    w = fields(dev.cmd("wifi", "WIFI", 60))
    check(w["ok"] == "1" and w["ip"] != "(IP", f"DEV6-T1 joined Wi-Fi in {w['ms']} ms, ip {w['ip']}, heap {w['heap']}")
    r = fields(dev.cmd("rpc altmempoolgateway.forshtat.com eth_chainId", "RPC ", 60))
    b = dev.read_until("BODY", 10)
    check(r["status"] == "200" and '"0x539"' in b, f"DEV6-T2 TLS read: chain 0x539, handshake {r['connectMs']} ms, lowest heap {r['heapLowest']}")

    # T4 (public): the board signs and sends a real transaction over TLS; the node must parse it and judge it
    dev.cmd("state-reset", "OK", 5)
    dev.s.reset_input_buffer(); dev.buf = b""
    dev.s.write(("submit altmempoolgateway.forshtat.com 443 1 " + c["command"] + "\n").encode())
    sub = fields(dev.read_until("SUBMIT", 90))
    lh = dev.read_until("LOCALHASH", 10)
    parts = dev.read_until("BODY", 10).split(" ", 1)
    body = parts[1] if len(parts) > 1 else ""
    print(f"     SUBMIT line: {sub}")
    print(f"     board sent it over TLS in {sub['totalMs']} ms, heap low {sub['heapLowest']}; node answered: {body[:240]}")
    j = json.loads(body) if body.startswith("{") else {}
    check(sub["status"] == "200" and ("error" in j or "result" in j), "DEV6-T4 (public) the node received and processed the board's transaction")

    # T6: Wi-Fi drops and comes back; calls fail cleanly in between; no reset
    up0 = int(fields(dev.cmd("wifi", "WIFI", 30))["uptime"])
    d = dev.cmd("wifi-drop", "DROPPED", 10)
    r2 = fields(dev.cmd("rpc altmempoolgateway.forshtat.com eth_chainId", "RPC ", 30))
    dev.read_until("BODY", 5)
    check(r2["status"] == "-1", "DEV6-T6 with Wi-Fi down the call fails cleanly (status -1), no crash")
    w2 = fields(dev.cmd("wifi", "WIFI", 60))
    r3 = fields(dev.cmd("rpc altmempoolgateway.forshtat.com eth_chainId", "RPC ", 60))
    dev.read_until("BODY", 5)
    check(w2["ok"] == "1" and r3["status"] == "200" and int(w2["uptime"]) > up0, f"DEV6-T6 reconnected in {w2['ms']} ms and the next call works, no reset")


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
    elif test == "tx":
        boot(dev, 60); t_tx_vectors(dev)
    elif test == "net":
        boot(dev, 60); t_net(dev)
    elif test == "safety":
        boot(dev, 60); t_leaf_safety(dev)
    elif test == "all":
        f0 = boot(dev, 600); print("first boot:", f0["source"], int(f0["ms"]) / 1000, "s"); t_keccak(dev); t_keygen(dev); t_sign(dev); t_reload(dev)
        t_seed_leak(json.load(open(f"{VEC}/wots.json"))["seed"])
    else:
        sys.exit("unknown test")
