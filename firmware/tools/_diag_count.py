import sys, time, json, re, serial
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from bridge import Board
ESP, PICO = sys.argv[1], sys.argv[2]
p = serial.Serial(); p.port, p.baudrate, p.timeout = PICO, 115200, 0.2; p.dtr = True; p.open()
def pico():
    p.reset_input_buffer(); p.write(b"?"); t0 = time.time(); b = b""
    while time.time() - t0 < 4:
        b += p.read(2048)
        for l in b.decode("utf-8", "replace").split("\n"):
            if l.startswith("METER "): return json.loads(l[6:])["pulses"]
b = Board(ESP, "http://127.0.0.1:14337/rpc")
b.reset(); b.wait("KEY READY", 0, 60); time.sleep(1.5)
b.cmd("loop off", "OK")
def snap(tag):
    e = dict(re.findall(r"(\w+)=(\S+)", b.cmd("meter", "METER", 8)))
    print(f"{tag:28s} board valid={e['valid']} glitches={e['glitches']} stuck={e['stuck']} coalesced={e['coalesced']} level={e['level']} | pico pulses={pico()}", flush=True)
p.write(b"s"); time.sleep(0.5); p.write(b"r"); b.cmd("window", "WINDOW", 8)
snap("surge start")
time.sleep(10); snap("surge +10 s")
m = b.mark(); b.send("checkpoint-now"); b.wait("CP ", m, 90)
snap("right after a checkpoint")
time.sleep(10); snap("surge +10 s more")
time.sleep(10); snap("surge +20 s more")
p.write(b"n"); b.cmd("loop off", "OK"); b.stop = True
