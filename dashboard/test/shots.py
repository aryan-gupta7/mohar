"""Screenshots of every page, both themes, desktop and 400 px. uv run --no-project --with selenium python dashboard/test/shots.py [tag]"""
import os, subprocess, sys, time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
S = os.path.join(ROOT, "docs", "evidence", "dashboard")
tag = sys.argv[1] if len(sys.argv) > 1 else "redesign"
PAGES = ["console", "overview", "meter", "report", "ai", "ledger", "usage", "identity", "audit", "settings"]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8097", "--bind", "127.0.0.1", "--directory", os.path.join(ROOT, "dashboard", "dist")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
o = Options(); o.add_argument("-headless")
d = webdriver.Firefox(options=o)
try:
    for theme in ("dark", "light"):
        for (w, h, tagw) in ((1440, 900, "d"), (400, 860, "m")):
            d.set_window_size(w, h)
            for page in PAGES:
                q = f"?theme={theme}&replay=surge-inspect.log&speed=20&chainRpc=https://altmempool.forshtat.com"
                d.get(f"http://127.0.0.1:8097/{q}#{page}"); time.sleep(5 if page in ("console", "overview", "ai", "report") else 3)
                d.save_screenshot(os.path.join(S, f"{tag}-{page}-{theme}-{tagw}.png"))
    print("done")
finally:
    d.quit(); srv.terminate()
