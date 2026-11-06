# Report size and cost: what was measured (EF track, engineering)

**Question:** how small and cheap can Mohar's signed report be while the account still verifies the same signature and the ledger records
the same facts? Measured on the local copy of the devnet with real signatures, real simulation and real mined transactions
(`signer/bench/`, evidence in `docs/evidence/bench-configs-local.json`). Public-devnet confirmation is listed at the end.

## Finding 1: how this chain bills a transaction

A regression over 48 real simulations (`signer/bench/b01_regress.ts`) fits **total gas = 3,248 + 64 × raw transaction bytes** with
**zero error**, whatever the validation or execution gas was. So gas is `max(size floor, execution)`, and for the baseline the
**size floor dominates**: execution is free up to it. Every byte saved is worth 64 gas, until execution cost overtakes the floor.

## Finding 2: the four configurations (same report, contracts, fees)

| Config | Sig B | Raw tx B | Steady gas | First-report gas | Validation gas avg/max | Verify steps avg/max | ESP sign avg/worst ms |
| baseline  w=16 ABI report | 2400 | 2963 | 192,880 | 192,880 | 74,427/82,336 | 501/570 | 474/914 |
| A         w=16 compact report | 2400 | 2635 | 178,635 | 182,615 | 73,145/82,336 | 489/570 | 484/914 |
| B         w=32 ABI report | 2016 | 2579 | 218,185 | 214,661 | 115,808/126,410 | 868/961 | 767/1530 |
| C         w=32 compact report | 2016 | 2251 | 213,837 | 225,807 | 114,483/129,944 | 856/992 | 777/1530 |

- **A (adopted): w=16 with a 63-byte compact report.** −328 bytes (−11%), **−7.4% gas** (−14,245). Execution now binds slightly
  (178.6k against a floor of 171.9k): this is the crossover, so there is little left to gain from shaving bytes.
- **B, C: w=32 is worse.** The signature shrinks by 384 bytes, but verification needs about 860 hash steps instead of 500, so
  validation gas rises from ~74k to ~115k and total gas goes **up 11 to 13%**. ESP signing also gets slower (avg 770 ms, worst 1.5 s) and the
  account needs more than the 100,000-gas unstaked cap. The analysis' estimate of "about +15k gas" was low because it assumed the
  size floor kept binding; it doesn't once validation is heavier.
- **w=4 (measured earlier): 304k.** Together with w=16 and w=32, the cost curve has its minimum near w=16.

So the signature scheme stays at **w=16**, and the report is compacted. The claim for the pitch: *the post-quantum signature is
the dominant cost, and we measured the size/verification trade-off instead of guessing: w=16 is the minimum of the cost curve on this chain.*

## What the compact report is

63 bytes of calldata instead of about 390: `selector "MPR1"(4) | seq(8) | total(8) | mode(1) | reason(1) | model(1) | salt(4) | sensors(20) | requestId(16)`.
- No ABI padding, no dynamic string, no unused `confidence` field (the model gives none).
- The **request ID is the 0G UUID in its raw 16 bytes**, so the full ID stays on chain and the archived record can still be matched to it.
  (Replacing it with a hash, as first proposed, would have broken that link.)
- The 20 sensor bytes are the first 20 of the 32-byte window word; the rest was a copy of `total` and zeros.
- The ledger accepts both formats; the account's allowed selector is fixed at deployment, so a device uses one.
- The compact entry point shares all the accounting and the replay and monotonic-total checks with the ABI one. **A test caught that my first
  version of the split left those two checks out of the compact path** (a stolen key could have replayed a sequence number); fixed and tested.

## Not done, on purpose
- Frame limits were not lowered: the account's 90,000 is already tight (89,161 worst case) and the settlement guard is 40,000.
- Batching several readings per signature is a different product trade-off (less frequent on-chain updates); left as future work.
- The 8-sibling Merkle proof and the 32-byte hashes stay: shrinking them trades away key capacity or security for very little.
