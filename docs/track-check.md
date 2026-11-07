# Track requirements check

Checked against `events/mumbai/prizes/` (ethereum-foundation.md, ens.md, 0g.md) on Sat. ✅ done · ⚠️ open · ❌ missing.

## Ethereum Foundation: frame transaction alternative mempool

| Requirement | Status | Note |
|---|---|---|
| Real alt mempool usage: a link to an admitted transaction on the devnet explorer, or code that submits one | ✅ / ⚠️ | Hash and code exist (EF-2, `signer/tools/ef2.ts`). The explorer keeps history in memory only: **save a screenshot of the admitted transaction**, and record a fresh admitted hash from the current deployment in `docs/evidence/` |
| Falls in a listed area | ✅ | Something only an alt mempool allows: daily quota paymaster (flexible state access) and a hash-based wallet |
| Team can explain the design, code and trade-offs | ✅ | mechanism.md sections 2 to 8; budget finding stated in the README |
| Public repo | ⚠️ | Not pushed yet. `LICENSE` (MIT) exists |
| One EF prize per project | ✅ | Enter the alt mempool prize only |

## ENS: Best Use of ENSv2

| Requirement | Status | Note |
|---|---|---|
| Built on ENSv2 on mainnet or Sepolia | ✅ | Sepolia |
| ENSv2 features central | ✅ | Subname registry, permissioned resolver, role-based edits, rejected-edit demo |
| Demo functional, not hard-coded | ❌ | **The live ENS records point to an old deployment**: `mohar.ledger` `0xde1a…`, `mohar.paymaster` `0xee22…`, account `0xdfa2…`, and `mohar.pq.root` is the fixed test-seed root. The working demo reads the new contracts through manual addresses (`forceManual`), which bypasses ENS. Re-run `ens/03-point-to-live.ts` with the current ledger, account, paymaster and the board's real root and pub seed, then demo with the name only |
| `agent-endpoint[web]` | ❌ | Still `https://mohar.invalid/dashboard`. Set it to the live demo URL |
| Link to a live demo | ❌ | Needs hosting (REL-2) |
| Code open source on GitHub | ⚠️ | Push the repo |
| Agents as namespaces (bonus) | ✅ | The device has its own name, resolver and permissions |
| Name term | ⚠️ | `mohar.eth` was registered for 28 days: fine for judging, note the expiry |

## 0G: Physical AI, agents with a body

| Requirement | Status | Note |
|---|---|---|
| A 0G call inside the decision loop | ✅ | Board calls `qwen3.8-flash` itself; live run on the public devnet |
| Episode log on 0G Storage with a request ID per decision | ⚠️ | Pipeline works (23 of 23 match). The root in ENS covers reports 19 to 22 of the **old** ledger. Upload a new batch for the current deployment and update `mohar.log` |
| Replayable simulation or a live hardware demo at the 0G booth | ⚠️ | Replay tool exists. The dashboard's recorded runs are synthesised logs, labelled Replay. Plan the booth demo |
| Safe-stop fallback if 0G is unreachable, and no fake decision | ⚠️ | Built, but **0G3-T4 (block 0G, expect `SAFE_STOP` with empty request ID), T5 (restore) and T7 (release firmware has no path that invents a decision) are still open.** This is the disqualifier item: run them and record the output |
| Real hardware | ✅ | Eligible for the real-hardware prize |
| Not "0G only for logs" | ✅ | A 0G answer changes device state and LED |

## Submission items (all tracks)

| Item | Status |
|---|---|
| Project name and short description | ✅ README |
| Public GitHub repo with README and setup | ⚠️ README done; push, and have someone else follow the setup (REL1-T6) |
| Demo video under 3 minutes | ❌ |
| Live demo link | ❌ Host `dashboard/dist` |
| Contract deployment addresses | ✅ README (current deployment; update after any redeploy) |
| Team names with Telegram and X | ❌ |
| Where AI was used | ✅ README |

## Other open items

- Reports stopped for about 40 minutes on Sat 05:02 (last report #47 at 04:22). The chain, quota and keys are healthy, so the board lost Wi-Fi or power. Check before the demo.
- `dashboard/test/e2e.py` still targets the old page names.
- DEV-7 T5 and EF-3 (laptop off) need a person at the hardware.
