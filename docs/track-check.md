# Track requirements check

Checked against `events/mumbai/prizes/` (ethereum-foundation.md, ens.md, 0g.md). Updated Sat after the ENS re-point and the 0G refresh. ✅ done · ⚠️ open · ❌ missing.

## Ethereum Foundation: frame transaction alternative mempool

| Requirement | Status | Note |
|---|---|---|
| Real alt mempool usage: a link to an admitted transaction, or code that submits one | ✅ | [Admitted report from the board](https://explorer.altmempool.wtf/tx/0x5648ba4ac3c546525b465dbc17a09f9df3c25ad279943017f691b78c08c8e54c?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc): "Every rule passed", paymaster as payer, mined. Screenshot `evidence/explorer-admitted-report.png`, receipt `evidence/ef-live-report.json`. Code: `signer/tools/ef2.ts` |
| A listed area | ✅ | Something only an alt mempool allows: quota paymaster (flexible state access) and a hash-based wallet |
| Team can explain design, code, trade-offs | ✅ | mechanism.md; budget finding in the README |
| Public repo, open-source licence | ✅ | Public, MIT |
| One EF prize per project | ✅ | Alt mempool only |

## ENS: Best Use of ENSv2

| Requirement | Status | Note |
|---|---|---|
| ENSv2 on mainnet or Sepolia | ✅ | Sepolia |
| ENSv2 central, not cosmetic | ✅ | Fleet registry, permissioned resolver, role-based edits, rejected-edit demo |
| Functional, not hard-coded | ✅ | **Fixed Sat.** The name now holds the current ledger, paymaster, account, key root and pub seed, taken from the account itself. The dashboard finds the meter from the name alone; the key check shows Match. Manual addresses remain only as a labelled testing fallback |
| `agent-endpoint[web]` | ⚠️ | Cleared (was a placeholder). Set it to the live URL once there is one: `node ens/03-point-to-live.ts <account> <ledger> <paymaster> 1337 <url>` |
| Link to a live demo | ✅ | Deployed on Vercel: https://mohar-pearl.vercel.app/ (root directory `dashboard`) |
| Open source on GitHub | ✅ | |
| Name term | ⚠️ | `mohar.eth` was registered for 28 days; fine for judging |

## 0G: Physical AI, agents with a body

| Requirement | Status | Note |
|---|---|---|
| A 0G call inside the decision loop | ✅ | Board calls `qwen3.8-flash` itself; every recent report carries a real request ID |
| Episode log on 0G Storage with a request ID per decision | ✅ | **Refreshed Sat.** 70 reports of the current ledger in three batches, all matching the chain with real IDs; `mohar.log` points at the newest root. `evidence/0g-5-current-ledger.json` |
| Replayable simulation, or live hardware demo at the booth | ⚠️ | `uploader/replay.ts` replays the real log. The dashboard's recorded runs are synthesised and labelled Replay. Plan the booth demo |
| Safe stop if 0G is unreachable, no fake decision | ✅ | **T4, T5 and T7 passed on Sat.** Blocking 0G: after the 15 s timeout the board chose `SAFE_STOP`, and that report was mined with an empty request ID while pulses were still counted. Restoring 0G: a fresh answer with a real request ID. The release firmware has no code path that invents a decision. `evidence/0g3-t4-t5-board-run.json` |
| Real hardware | ✅ | Eligible for the real-hardware prize |

## Submission items (all tracks)

| Item | Status |
|---|---|
| Project name, short description | ✅ README |
| Public repo with README and setup | ✅ |
| Demo video under 3 minutes | ❌ yours |
| Live demo link | ✅ https://mohar-pearl.vercel.app/ |
| Contract deployment addresses | ✅ README |
| Team names with Telegram and X | ❌ yours |
| Where AI was used | ✅ README |

## Found Sat

- **Duplicate report numbers.** The firmware numbers a report as the ledger's confirmed last seq plus one. A report takes about 50 s to be mined and checkpoints are 30 to 60 s apart, so some reports reuse a seq and revert in the ledger frame (3 of the last ~26). Each wastes a one-time key and a quota slot, and that window's data is lost. Needs a firmware change (track the last submitted seq, or skip a checkpoint while one is unconfirmed) and a reflash.
- Reports paused for about 40 minutes earlier; they resumed on their own.
- `dashboard/test/e2e.py` still targets the old page names.
