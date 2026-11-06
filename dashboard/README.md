# Mohar Console

A static site (Vite + React + TypeScript + Tailwind). No backend, no analytics, no secrets. It reads:

- **ENS on Sepolia** (the meter's name and records),
- **the Mohar devnet** by RPC (ledger state and `Report` events),
- **the boards** by Web Serial (desktop Chrome or Edge only), for the live pipeline and the Pico scenario buttons.

The device's signing key and the 0G API key never enter the browser.

## Run it

```sh
cd dashboard
npm install            # once
npm run build          # static site in dashboard/dist
./serve.sh             # or: python3 -m http.server 8088 --directory dist --bind 127.0.0.1
```
Open http://127.0.0.1:8088/ . (`npm run dev` serves the same on port 8088 with reload.) Web Serial needs a secure context, and `127.0.0.1` / `localhost` count as one.

## Point it at the real meter

Settings page, or in the address: `?ensName=meter-001.mohar.eth&chainRpc=https://altmempool.forshtat.com`

- `ensName`: resolved on Sepolia; its records give the account, ledger and paymaster. Nothing about a meter is in the code.
- `chainRpc`: the Mohar devnet RPC. Public devnet: `https://altmempool.forshtat.com`. Local test chain: `http://127.0.0.1:18545`.
- Testing only (labelled in the UI): `manualLedger`, `manualAccount`, `manualPaymaster` are used when ENS has nothing; `forceManual=1` makes them win over ENS (used to show the root-mismatch warning).

## Test live hardware with Web Serial (a person must do this)

You need desktop **Chrome or Edge**. Firefox and iPhone Safari have no Web Serial: everything except the Pico buttons and the live pipeline still works there.

1. Plug in both boards. Stable names on Linux:
   - Pico H (the simulated meter): `/dev/serial/by-id/usb-Raspberry_Pi_Pico_E662588817693B2C-if00`
   - ESP8266 (the device): `/dev/serial/by-id/usb-1a86_USB_Single_Serial_5717135611-if00`
2. **Only one program may hold a serial port at a time.** Close any `pio device monitor`, `screen`, Python test or soak that is using either port, or the browser can't open it ("port busy").
3. Open the Console page. Click **Connect Pico** and pick the Pico in the browser's port chooser (Chrome lists ports as "Pico" / "USB Single Serial"; it does not show the by-id names). Its `METER` lines should start to appear; the Pico stage turns active.
4. Click **Connect ESP8266** and pick the other port. **Opening the ESP8266's port resets the board** (the USB chip wires DTR to reset), so wait about 2 seconds for it to print `KEY READY`; its first checkpoint starts 10 seconds after boot. It is normal for the pipeline to sit at WAITING until `EV` lines arrive.
5. Choose a scenario and click **Apply meter scenario**. The browser sends one character to the Pico, which makes real pulses on GP0; the ESP8266 counts them on D6. The browser never sends a reading.
6. Watch the pipeline. A stage changes only when its real event arrives (an `EV` line from the board, a `METER` line from the Pico, or the chain). A checkpoint takes about 20 to 25 seconds end to end on Wi-Fi with 0G.
7. The board must be provisioned for the network you point the dashboard at (`firmware/tools/live_test.py` does it for the public devnet), have Wi-Fi (the hotspot on, 2.4 GHz), and the ledger needs credit.

No board? Use the **Replay** picker on the Console page: it plays a recorded-format log, clearly badged REPLAY (the sample logs in `replay/` are synthesised to follow `docs/event-protocol.md`, not recorded from a run).

## Tests

```sh
npm run build
cd .. && uv run --no-project --with selenium python dashboard/test/e2e.py <local-ledger-address>   # replay + local chain
uv run --no-project --with selenium python dashboard/test/real.py                                   # real ENS + public devnet
```
Headless Firefox. Screenshots land in `docs/evidence/dashboard/`.

## Rules the UI follows

Nothing says electricity is disconnected (there is no relay). Devnet credit is never shown as rupees. Estimates say "estimated". No confidence number (the model gives none). Sensors that aren't installed say so. A stale or unreachable source shows an error, never old numbers as live.
