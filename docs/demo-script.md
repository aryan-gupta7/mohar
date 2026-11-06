# Demo script (target 2:40, hard limit 2:55)

**One journey, told once:** a user picks a meter scenario → the physical device measures it → AI assesses it → the device signs its
own report → Ethereum verifies it → the dashboard shows the evidence. The dashboard is the presentation; the boards on the table
are the source. Keep both boards visible and running, with their LEDs in frame.

## Before you start (pre-flight, 10 minutes)

- [ ] Both boards on a power source; phone hotspot on, **2.4 GHz**; the ESP shows a blink every 2 s.
- [ ] Laptop on Ethernet (the hotspot isolates clients, so the laptop and the ESP can't talk to each other, and don't need to).
- [ ] Fresh state: `node signer/tools/ledger-cli.ts status <ledger>` shows no hold and credit above 500 pulses. Top up if not.
- [ ] Leaves: the board's key has 256 one-time signatures. Rehearsals use them. Check `leavesLeft` on the dashboard is above 60 before the real run, or put a fresh key on the board (4 minutes) and redeploy (see mechanism.md).
- [ ] Dashboard open in desktop Chrome with Web Serial connected to the Pico and the ESP (opening the ESP's port resets it: wait for `KEY READY`).
- [ ] `mohar.log` on ENS holds a real 0G Storage root (after the last upload), and the episode replay command is ready in a terminal.
- [ ] Screen recording running. A recorded copy of each beat exists as a fallback (see below).

## The beats

| Time | You do | The audience sees | What's real | Track |
|---|---|---|---|---|
| 0:00 | Say: "This meter signs for itself." State once that the **meter input is simulated** by the Pico; everything after the wire is real | The two boards, the dashboard | | |
| 0:15 | Type `meter-001.mohar.eth` | Name → account, ledger, paymaster; root from ENS equals the account's `root()` | ENS on Sepolia, devnet reads | ENS |
| 0:35 | **Apply: normal 900 W** | Pico LED flashes; ESP pulse LED follows; pipeline stage 1→2 lights as pulses are counted; 0G returns `RUN` with its request ID; signing shows leaves left; submitted → mempool accepted → confirmed; ledger updates | Real pulses, real 0G call, real signature, real transaction | EF, 0G |
| 1:05 | **Apply: surge 12 kW** | Same flow; 0G returns `INSPECT`; the ESP status LED changes to two quick blinks; the hold appears on the ledger | Real decision moving real device state | 0G |
| 1:35 | Apply normal again | 0G says `RUN`, **the device stays `INSPECT`**: the ledger hold wins. Operator clears the hold in the wallet → `RUN` | The rule "AI only adds caution" | 0G |
| 1:55 | Apply heavy until credit ends | `CREDIT_STOP`: "credit exhausted, usage accruing as arrears". Say clearly: nothing is disconnected. Top up: arrears are paid first, then `RUN` | Ledger logic on the devnet | |
| 2:15 | In Identity: maintenance key edits maintenance status (works); the same key edits the cryptographic root (**rejected, with the contract's own error**) | The real revert, not a canned message | ENS permissions on Sepolia | ENS |
| 2:30 | Show the evidence pair: the canonical mempool refusing the exact bytes the alt mempool admitted; then the 0G Storage replay matching the chain | `StorageReadNonSender` vs admitted; "replay matches 23/23" | Public devnet evidence; 0G Storage | EF, 0G |
| 2:40 | Close: "No backend, no custodial signer, no relayer. The meter owns its account." | | | |

## If something fails

| Failure | Do |
|---|---|
| 0G slow or down | The device goes `SAFE_STOP` with an empty request ID, which is the demo: "no decision, no action". Say so, then show the glitch scenario (`g`): the fixed checks give `INSPECT` without 0G |
| Wi-Fi drops | The device reconnects by itself (a few seconds). Narrate it |
| Public devnet slow to mine | Show "mempool accepted" (real) and the recorded run of the same beat; do not call it confirmed until the receipt shows |
| Web Serial won't connect | Dashboard replay mode (labelled REPLAY), with the boards running beside it |
| Board reset | Wait for `KEY READY` (5 ms to load the key); the loop resumes by itself |
| Out of leaves | Switch to the spare key and redeploy; allow 15 minutes. Check before, not during |

## What we never say

That the meter disconnects power (there is no relay) · that ENS controls the devnet · that the sensor value is proven true ·
that the cryptography is audited · "first" or "unbreakable" · that devnet credit is rupees.
