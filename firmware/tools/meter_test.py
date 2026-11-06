"""DEV-7 pulse counting test: the Pico generates pulses, the ESP8266 counts them, and the two counts must agree.
usage: python meter_test.py ESP_PORT PICO_PORT
The Pico's counter and the ESP's counter are read at the same moment, before and after each scenario.
"""
import json, re, sys, time
import serial


def open_port(p, dtr=False):
    s = serial.Serial()
    s.port, s.baudrate, s.timeout = p, 115200, 0.1
    s.dtr, s.rts = dtr, False  # the Pico's console only prints while DTR is set; the ESP resets on it
    s.open()
    return s


class Lines:
    def __init__(self, s):
        self.s, self.buf = s, b""

    def until(self, prefix, timeout, send=None):
        if send:
            self.s.write(send)
        t0 = time.time()
        while time.time() - t0 < timeout:
            self.buf += self.s.read(4096)
            while b"\n" in self.buf:
                line, self.buf = self.buf.split(b"\n", 1)
                t = line.decode("utf-8", "replace").strip()
                if t.startswith(prefix):
                    return t
        raise TimeoutError(prefix)

    def drain(self):
        self.s.reset_input_buffer()
        self.buf = b""


def kv(line):
    return {k: v for k, v in re.findall(r"(\w+)=(\S+)", line)}


esp = Lines(open_port(sys.argv[1]))
pico = Lines(open_port(sys.argv[2], dtr=True))
esp.s.rts = True; time.sleep(0.15); esp.s.rts = False
esp.until("KEY READY", 60)
fails = 0


def check(ok, msg):
    global fails
    print(("PASS " if ok else "FAIL ") + msg)
    fails += 0 if ok else 1


def snapshot():
    esp.drain(); pico.drain()
    p = json.loads(pico.until("METER", 5, b"?").split(" ", 1)[1])
    e = kv(esp.until("METER", 5, b"meter\n"))
    return p, e


def scenario(name, key, secs, expect_glitches=False):
    pico.s.write(key.encode())
    time.sleep(0.5)
    p0, e0 = snapshot()
    time.sleep(secs)
    p1, e1 = snapshot()
    dp = p1["pulses"] - p0["pulses"]
    de = int(e1["valid"]) - int(e0["valid"])
    dg_p = p1["glitches"] - p0["glitches"]
    dg_e = int(e1["glitches"]) - int(e0["glitches"])
    print(f"     {name}: pico {dp} pulses, esp {de} valid; pico {dg_p} glitches, esp {dg_e}; esp line level {e1['level']}, stuck {e1['stuck']}")
    return dp, de, dg_p, dg_e, e1


# DEV7-T1 normal load
dp, de, *_ = scenario("normal 900 W", "n", 90)
check(abs(dp - de) <= 1 and dp > 50, f"DEV7-T1 normal load: counts equal within 1 ({dp} vs {de})")

# DEV7-T2 surge
dp, de, *_ = scenario("surge 12000 W", "s", 20)
check(abs(dp - de) <= 1 and dp > 150, f"DEV7-T2 surge: counts equal within 1 ({dp} vs {de})")

# DEV7-T13 power estimate while at heavy load
pico.s.write(b"c"); time.sleep(0.3)   # steady mode: the default load now drifts and has appliances switching on, so a 5 % check needs a constant one
pico.s.write(b"h"); time.sleep(0.5)
esp.drain(); esp.until("WINDOW", 5, b"window\n")
time.sleep(30)
w = kv(esp.until("WINDOW", 5, b"window\n"))
avg, peak = int(w["avgW"]), int(w["peakW"])
check(abs(avg - 3000) <= 150, f"DEV7-T13 heavy load (steady mode): average {avg} W within 5% of 3000 W (peak {peak} W)")
pico.s.write(b"c"); time.sleep(0.3)   # back to the varying load

# DEV7-T3 glitches: counted separately, and not charged
dp, de, dgp, dge, e = scenario("glitch line", "g", 40)
check(abs(dp - de) <= 1, f"DEV7-T3 glitch scenario: valid pulses equal ({dp} vs {de})")
check(dge >= 1 and abs(dge - dgp) <= 2, f"DEV7-T3 glitches counted separately: esp {dge}, pico {dgp}")

# DEV7-T4 off: nothing counted, no false counts from a floating line
dp, de, dgp, dge, e = scenario("pico off", "x", 20)
check(de == 0 and dge == 0 and e["level"] == "1", f"DEV7-T4 off: no counts, line reads high (valid {de}, glitches {dge}, level {e['level']})")

pico.s.write(b"n")
print(f"\n{'ALL PASS' if not fails else str(fails) + ' FAILED'}")
sys.exit(1 if fails else 0)
