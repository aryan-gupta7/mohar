# Mohar event protocol

How the live demo knows what the hardware is doing. The dashboard shows **only** what these lines and the chain say.
It never advances a stage on a timer.

## Pico (the simulated meter): `METER {...}` lines
One JSON object per line on the Pico's USB serial console (115200 baud, DTR must be asserted):
`METER {"event":"tick|load|status|reset","mode":"normal","watts":900,"pulses":87,"glitches":9,"wh":27.18,"auto":false}`
Commands are one character, no newline: `i` idle 60 W · `n` normal 900 W · `h` heavy 3,000 W · `s` surge 12,000 W ·
`g` glitch (900 W plus 2 ms spikes) · `x` off · `a` automatic cycle · `r` reset counters · `?` status.
The Pico generates a real electrical pulse train on GP0; the ESP8266 counts it on D6. Nothing is sent as a reading.

## ESP8266 (the device): `EV {...}` lines
One JSON object per line on the ESP's USB serial console (115200 baud). `ms` is the board's uptime in milliseconds and
`cp` counts checkpoints since boot. **Opening the port resets this board**; wait for the `KEY READY` line.

| `e` | When | Fields |
|---|---|---|
| `cp_start` | A checkpoint begins | |
| `window` | Pulse window closed | `valid glitches stuck avgW peakW windowMs gapMs total` |
| `ledger_read` | Ledger and nonce read | `ok`, and if ok: `credit arrears hold lastSeq lastTotal tariff ledgerMode nonce` (wei for money) |
| `local_check` | Fixed checks done | `result`: `pass`, `peak`, `glitch` or `stuck` |
| `ai_request` | 0G call starts | `model provider` |
| `ai_response` | 0G call ends | `answer` (`RUN`/`INSPECT`/`NONE`) `rid latencyMs http why` |
| `decision` | Final mode chosen | `mode reason aiWanted ledgerHold ledgerMode aiSource` |
| `sign_start` | Signing begins | `nonce leaf` |
| `sign_done` | Signing ends | `result ms steps leaf leavesLeft resent` |
| `submit` | Sending | `transport` (`wifi` or `usb-bridge`) |
| `submitted` | Node answered | `result` (`ok`, `rejected`, `hash_mismatch`) `hash` |
| `cp_end` | Checkpoint ends | `mode totalMs` |

Existing line `CP mode=... reason=...` is the human-readable summary of the same checkpoint. `KEY READY root=0x... pubSeed=0x...`
is printed at boot; `INFO root=... pubSeed=...` answers the `info` command.

## What the browser can and cannot confirm
- **Web Serial** (desktop Chrome/Edge): reads `EV` and `METER` lines and sends Pico commands. Not available on iOS Safari.
- **RPC** (the Mohar devnet): `submitted` only means the node answered. *Mined* is confirmed by the receipt, and *on-chain confirmed*
  by the ledger's `lastSeq` reaching the report's sequence. Show these as separate stages.
- Reason codes: 0 ok · 1 peak · 2 glitches · 3 stuck line · 4 AI inspect · 10 credit · 11 hold · 20 no decision · 21 chain unreachable ·
  22 keys used up · 24 startup. Modes: 0 RUN · 1 INSPECT · 2 CREDIT_STOP · 3 SAFE_STOP. `confidence` is always 0: the model gives none.
