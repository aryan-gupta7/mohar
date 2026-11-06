"""USB bridge and board console for tests. Holds the board's serial port, forwards "BRIDGE <id> <json>" requests to an
RPC URL and answers "BRIDGE-RES <id> <json>" (the laptop forwards bytes only), and logs every line the board prints.
Used as a library by the behaviour tests.
"""
import json, threading, time, urllib.request
import serial


class Board:
    def __init__(self, port, url):
        self.url = url
        self.s = serial.Serial()
        self.s.port, self.s.baudrate, self.s.timeout = port, 115200, 0.1
        self.s.dtr, self.s.rts = False, False
        self.s.open()
        self.lines = []
        self.lock = threading.Lock()
        self.stop = False
        self.bridge_ok = True
        self.t = threading.Thread(target=self._run, daemon=True)
        self.t.start()

    def _run(self):
        buf = b""
        while not self.stop:
            try:
                buf += self.s.read(8192)
            except Exception:
                time.sleep(0.2); continue
            while b"\n" in buf:
                raw, buf = buf.split(b"\n", 1)
                line = raw.decode("utf-8", "replace").strip()
                if line.startswith("BRIDGE "):
                    self._forward(line)
                elif line:
                    with self.lock:
                        self.lines.append((time.time(), line))

    def _forward(self, line):
        parts = line.split(" ", 2)
        rid, body = parts[1], parts[2] if len(parts) > 2 else ""
        if not self.bridge_ok:
            return  # as if the laptop were gone: the board gets no answer
        try:
            req = urllib.request.Request(self.url, data=body.encode(), headers={"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                resp = r.read().decode().replace("\n", "")
        except Exception as e:
            resp = json.dumps({"error": str(e)})
        self.s.write(f"BRIDGE-RES {rid} {resp}\n".encode())

    def send(self, cmd):
        self.s.write((cmd + "\n").encode())

    def mark(self):
        with self.lock:
            return len(self.lines)

    def wait(self, prefix, since, timeout=60):
        t0 = time.time()
        while time.time() - t0 < timeout:
            with self.lock:
                for _, l in self.lines[since:]:
                    if l.startswith(prefix):
                        return l
            time.sleep(0.1)
        raise TimeoutError(f"no line starting {prefix!r}; last: {[l for _, l in self.lines[-4:]]}")

    def reset(self):
        self.s.rts = True; time.sleep(0.15); self.s.rts = False

    def cmd(self, c, prefix, timeout=20):
        m = self.mark()
        self.send(c)
        return self.wait(prefix, m, timeout)
