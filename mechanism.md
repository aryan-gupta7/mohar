# Mohar: How the Implementation Works

This describes only what is **built and tested so far**. For what comes next, see [dev-plan.md](dev-plan.md). For the history of each step, see [update-log.md](update-log.md).

**Last updated:** Friday, November 6, 2026, 09:55 IST

---

## 1. What exists today

| Component | File | State |
|---|---|---|
| WOTS-like signer | [signer/src/wots.ts](signer/src/wots.ts) | Working, 9 unit tests pass |
| Machine account | [contracts/yul/MoharAccount.yul](contracts/yul/MoharAccount.yul) | Working on the local chain |
| Quota paymaster | [contracts/yul/QuotaPaymaster.yul](contracts/yul/QuotaPaymaster.yul) | Working on the local chain |
| Machine ledger | [contracts/src/MachineLedger.sol](contracts/src/MachineLedger.sol) | Working on the local chain, 12 tests pass |
| Transaction builder | [signer/src/mohar.ts](signer/src/mohar.ts) | Working, 38 integration tests pass |
| Local chain | [devnet/](devnet/) | Working: same client build as the public devnet |
| Board benchmark | [firmware/bench/](firmware/bench/) | Working on the real ESP8266 |
| Meter simulator | [firmware/pico-meter/](firmware/pico-meter/) | Working on the real Pico H, wired to the ESP8266 (GP0 to D6) |
| Device firmware: keys, signing, transactions, key safety | [firmware/mohar/](firmware/mohar/) | Working on the real ESP8266: builds and signs whole transactions the alt mempool admits |
| Device firmware: pulse counting | [firmware/mohar/src/meter.cpp](firmware/mohar/src/meter.cpp) | Working: counts the Pico's pulses exactly |
| 0G decision evaluation | [signer/tools/0g-eval.ts](signer/tools/0g-eval.ts) | Run with a real key: `qwen3.8-flash` chosen |

### Proven and not yet proven

| Claim | Status | Evidence |
|---|---|---|
| A WOTS-signed frame transaction can be mined | **Proven on the local chain** | Mined with status `0x1`; test `end to end` |
| The canonical rules refuse the paymaster | **Proven on the local chain** | Violation: `StorageReadNonSender` |
| The public devnet caps validation at 100,000 gas | **Proven for an unstaked sender** | `exceeds MAX_VERIFY_GAS 100000`. The source has no staking exception, but a staked sender hasn't been tried live |
| Reports update the ledger through the full 4-frame path | **Proven on the local chain** | DEV3-T8 and T9: events match every field |
| The alt mempool's rules admit our transaction, and the canonical rules refuse the same bytes | **Proven with the real sidecar code, on our local chain** | EF-2L; [evidence](docs/evidence/ef-2-local-alt.json). Not yet on the public devnet |
| An unstaked paymaster is refused | **Proven, same setup** | `unstaked payer accessed payer slot 0x…01` |
| Anything on the public devnet with our contracts | **Not proven** | Same funding block |
| The ESP8266 holds its own key and signs transactions the alt mempool accepts | **Proven on the local chain** | DEV4-T8: board-signed report, admitted by the real sidecar code, mined, 4 frames succeeded |
| The ESP8266 builds the whole transaction itself and keeps one-time-key safety across crashes | **Proven**, including three real power pulls | DEV5-T1 to T9: 31 vectors byte-identical; three device-built transactions mined; crash points injected; power pulled mid-signing three times |
| The ESP8266 counts a meter's pulses exactly | **Proven on the real Pico and ESP8266** | DEV7-T1 to T4 and T13: counts equal, glitches separate |
| `qwen3.8-flash` makes reliable inspect or run decisions on meter windows | **Proven on 19 labelled scenarios, 5 runs each** | `docs/evidence/0g-1-qwen3.8-flash.json`. The policy text was written after the first 14 scenarios; 5 more were added after |
| The ESP8266 reaches the network, holds TLS, and talks to 0G | **Not proven** | DEV-6, 0G-2 |
| ENS and 0G integrations | **Not started** | Docs and endpoints checked only |

**Local mining proves execution, not mempool admission.** The local node has no sidecar, so tests submit through its privileged route, which skips mempool rules.

---

## 2. How a report transaction works

```text
 Signer (laptop today, ESP8266 later)
   1. Build the transaction, with empty signature bytes
   2. digest = keccak256(0x06 ‖ rlp(tx))
   3. Sign digest with one-time key number (nonce - 1)
   4. Put the 2,400-byte signature in the transaction
        │
        ▼
 Chain executes four frames, in order
   Frame 0  VERIFY   MoharAccount     checks layout and signature, approves EXECUTION
   Frame 1  VERIFY   QuotaPaymaster   checks policy and quota, approves PAYMENT
   Frame 2  SENDER   MachineLedger    records the reading, called by the account
   Frame 3  DEFAULT  QuotaPaymaster   settle(): charges one transaction to the quota
```

Frames 0 and 1 are the **validation prefix**. They run read-only, and the devnet limits their combined gas.

---

## 3. The signature scheme

This is a **custom, unaudited construction**. It is not LMS, XMSS or WOTS+. It follows the Winternitz one-time signature idea with a per-hash tweak.

### Parameters

| Parameter | Value |
|---|---|
| Hash | Keccak-256 (32 bytes) |
| Winternitz parameter | w = 16 |
| Chains | 67: 64 for the message, 3 for the checksum |
| Tree height | 8, so 256 one-time keys |
| Signature size | 67 × 32 + 8 × 32 = **2,400 bytes** |

### Exact definitions

All integers are big-endian.

```text
pubSeed           = first 16 bytes of keccak256(seed ‖ 0xFF × 32)
secret(leaf, c)   = keccak256(seed ‖ leaf:u32 ‖ c:u32 ‖ 0x00 × 24)
tweak(leaf, c, s) = pubSeed ‖ leaf:u32 ‖ c:u32 ‖ 0x00000000 ‖ s:u32
step(v, leaf, c, s) = keccak256(v ‖ tweak(leaf, c, s))
```

- **Public value of a chain:** start from `secret(leaf, c)` and apply steps `s = 0 … 14`.
- **Digits:** the digest gives 64 values from 0 to 15, most significant first.
- **Checksum:** `csum = Σ(15 − digit)`, at most 960, written as 3 more digits.
- **Signing chain `c` with digit `d`:** apply steps `0 … d−1` to the secret.
- **Verifying chain `c`:** apply steps `d … 14` to the signature value. It must reach the public value.
- **Leaf:** `keccak256(public0 ‖ … ‖ public66)`.
- **Tree:** `parent = keccak256(left ‖ right)`, with the root stored in the account.
- **Signature bytes:** the 67 chain values, then 8 Merkle siblings from the bottom up.

### Why the checksum matters

A signature reveals points along each chain, and anyone can walk a chain forward. So an attacker could raise a message digit. Raising a digit lowers the checksum, though, and lowering a checksum digit would mean walking backward, which requires inverting the hash.

### Why keys are one-time

Signing two different digests with one key reveals more chain points, which can let an attacker forge. The contract can only stop a reused key being accepted twice. It can't undo what a second signature reveals. **The signer must never sign two different messages with one leaf.** Re-sending the same message is safe, because the signature is deterministic and reveals nothing new.

**Current state of this rule:** the laptop signer takes the leaf from the nonce, but it doesn't store which leaves it has used. Persistent protection belongs in the firmware, in phase DEV-5.

---

## 4. The frame transaction on this devnet

The devnet doesn't match the EIP-8141 text. These come from the devnet library's profile, and our client-side hash matches the client's `SIG_HASH` (checked by [e03_probe.ts](signer/exp/e03_probe.ts)).

```text
0x06 ‖ rlp([chain_id, nonce_keys, nonce_seq, sender, frames, signatures,
            fees, blob_versioned_hashes, recent_root_references])

frame     = [mode, flags, target, [execution_limit, state_limit], value, data]
signature = [scheme, signer, msg, signature_bytes]
fees      = [max_priority_fee, max_fee_per_gas, max_fee_per_blob_gas]
```

- **Digest:** `keccak256` of the encoding above, with the signature bytes emptied. The EIP replaces them with their length instead.
- **Modes:** 0 DEFAULT, 1 VERIFY, 2 SENDER.
- **Approval scopes in flags:** 1 PAYMENT, 2 EXECUTION, 3 both.
- **Signature entry:** scheme 0 (`ARBITRARY`), with empty signer and empty msg.

### Report transaction layout

| # | Mode | Target | Flags | Execution limit | State limit |
|---|---|---|---|---:|---:|
| 0 | VERIFY | Sender (null) | 2 | 90,000 | 0 |
| 1 | VERIFY | Paymaster | 1 | 9,900 | 0 |
| 2 | SENDER | Target contract | 0 | 50,000 | 100,000 |
| 3 | DEFAULT | Paymaster | 0 | 40,000 | 0 |

`90,000 + 9,900 + 100 (signature intrinsic cost) = 100,000`, exactly the devnet's cap.

---

## 5. How the nonce selects the key

The **leaf is `nonce − 1`**, using the account's ordinary nonce. A contract's nonce starts at 1, and `MoharAccount` creates no contracts, so leaf 0 goes with nonce 1 (checked by test).

We measured every option on the client:

| `nonce_keys` and sequence | Result |
|---|---|
| `[]` with the nonce (EIP's legacy form) | **Rejected:** `nonce_keys count must be between 1 and 16` |
| `[1]` with `2^64 − 1` (EIP's single-use form) | **Rejected:** `nonce_seq must be < 2**64 - 1` |
| `[1]` with sequence 0 | Works, costing **20,000 extra gas** inside validation |
| `[1, 2]` with sequence 0 | Works, costing **40,000 extra gas** |
| **`[0]` with the nonce (chosen)** | Works, and an approving frame used only **172 gas** |

So one nonce form fits the budget. The protocol's nonce doubles as the replay guard, and a replay gets `Nonce mismatch: expected 4, got 1`.

---

## 6. MoharAccount

Written in Yul because Solidity can only reach frame opcodes through helper contracts, and each helper call starts at 2,600 gas for cold access. Runtime size is 615 bytes.

**Getters:** `root()` and `pubSeed()` return the key, so a dashboard can compare it with ENS. A frame transaction calls the account with empty calldata, so validation never enters the getter branch: the branch added 15 gas to validation. Calls with any other selector, or with value, revert.

**Constructor (7 words after the creation code):** `root`, `pubSeed`, `target`, `selector`, `registry`, `stake`, `unstakeDelay`.

- Root, seed, target and selector become immutables, so reading them costs no storage access.
- If `stake` is non-zero, it calls `addStake(uint32)` on the registry. Doing this in the constructor means the account never needs a transaction just to stake.

**Validation, in order. Any failure reverts:**

1. Exactly one signature entry.
2. Signature is exactly 2,400 bytes. The opcode also halts on anything but `ARBITRARY`.
3. Exactly one nonce key, and it's key 0.
4. `leaf = nonce − 1`, and it must be below 256.
5. **Every SENDER frame** must target the allowed contract, carry zero value and use the allowed function selector.
6. Copy the signature to memory with `SIGDATACOPY`.
7. Walk all 67 chains, overwriting the signature in place to avoid extra memory.
8. Hash the leaf, climb the tree and compare to the root.
9. `APPROVE` with the scope this frame is flagged for.

**Why steps 1 to 5 exist when the digest already covers those fields:** they defend against a **stolen key**. A thief can sign anything, so the contract itself must limit what any valid signature can do. For example, a thief can't call `unlockStake()`.

**Plain calls fail.** Frame opcodes halt outside a frame, so the account can't receive a plain transfer. Fund it through the constructor.

---

## 7. QuotaPaymaster

Pays gas for registered machines within a policy the fleet owner sets. Runtime size is 710 bytes.

### Storage

| Location | Meaning |
|---|---|
| Slot 0 | Owner |
| Slot 1 | Fleet-wide pause flag |
| `keccak256(device ‖ 2)` | Policy word: `remaining` · `dailyLimit` · `lastRefill` · `maxCostGwei`, 64 bits each, high to low |

### Validation (VERIFY frame, empty calldata)

1. Exactly 4 frames, and this is frame 1.
2. Frame 3 is DEFAULT mode, targets this paymaster and calls `settle()`.
3. Frame 3 has at least 40,000 execution gas, so settling can't be starved.
4. The fleet isn't paused.
5. The sender's `remaining` quota is above zero.
6. `MAX_COST` (`TXPARAM 0x06`, a devnet addition) is within the sender's cap.
7. `APPROVE(PAYMENT)`.

**This is what needs the alt mempool.** Steps 4 and 5 read the paymaster's own storage, and the canonical rules only let a validating frame read the sender's storage.

### Other entry points

| Function | Who can call | What it does |
|---|---|---|
| `settle()` | Entry point (`0xaa`), during a frame | Reduces the sender's quota by one, emits `Settled(address)` |
| `refill(address)` | Anyone | Restores the quota once 24 hours have passed |
| `setPolicy(address,uint64,uint64)` | Owner | Registers a device or changes its limits, restoring its quota |
| `revoke(address)` | Owner | Clears the device's policy |
| `setPaused(bool)` | Owner | Pauses or resumes the whole fleet |
| `withdraw(address,uint256)` | Owner | Takes out funds |
| `deposit()` | Anyone | Adds funds |
| `policyOf(address)`, `paused()`, `owner()` | Anyone | Reads state |

**Why refill is a separate transaction:** `TIMESTAMP` is banned during validation, [even for staked entities](https://docs.altmempool.wtf/rules/opcodes/). Refilling from a settle frame would also deadlock, because a zero quota fails validation before settle could ever run.

**Funding:** use the constructor or `deposit()`. Empty calldata means VERIFY, so a plain transfer fails.

---

## 7a. MachineLedger

The shared record for one electricity meter: readings, prepaid credit, arrears and inspection holds. Solidity, 3,568 bytes of runtime code. One ledger per meter.

**A reading** is the meter's cumulative pulse count (`total`). The meter simulator, like many Indian meters, gives 3,200 pulses per kWh.

### Behaviour

| Rule | How it's enforced |
|---|---|
| Only the meter's account can report | `msg.sender` must equal `machine`, set once by `bindMachine` (owner only) |
| No replays or rollbacks | `seq` must rise; `total` can't fall |
| Usage is charged against prepaid credit | `usage = total − lastTotal`; charge = usage × `tariffWeiPerPulse` |
| **Usage beyond credit isn't lost** | It becomes arrears. The next top-up pays arrears first, then adds credit |
| An inspection hold needs a person to clear it | `INSPECT` sets `hold`; only the operator's `clearHold` clears it. No report mode, and no top-up, clears it |
| The owner takes only what usage paid for | `withdraw` is limited to `earned` |
| The ledger's ETH always matches its books | ETH held = credit + earned (asserted by the tests after every step) |
| Bad fields are refused | Mode above 3, confidence above 100, request ID over 64 bytes |

**Nothing is disconnected.** Running out of credit is recorded as arrears and shown as `CREDIT_STOP`. It doesn't switch off any supply.

`ledgerMode()` gives what the ledger alone implies: `INSPECT` while held, `CREDIT_STOP` when credit can't cover one more pulse, otherwise `RUN`. The device reports the first that applies of `SAFE_STOP`, `INSPECT`, `CREDIT_STOP`, `RUN`, so it can add caution but can't remove it.

### Why credit and arrears share one number

Creating a storage slot costs about **98,600 gas** on this devnet (measured), close to a report frame's whole 100,000 state-gas limit. A separate `arrears` slot would have been created again every time credit ran out. So one signed value, `balance`, holds both: positive is credit, negative is arrears. It shares a slot with `lastTotal` and `earned`, and the other slot a report writes holds `machine`, which is set at binding. After the first reading, **a report never creates storage.**

### Storage

| Slot | Fields |
|---|---|
| 0 | `machine` (160 bits) · `lastSeq` (64) · `lastMode` (8) · `hold` (8) |
| 1 | `lastTotal` (64) · `balance`, signed (96) · `earned` (96) |
| 2 | `operator` |
| Immutable | `owner`, `tariffWeiPerPulse` |

### Events

`Report` carries every reported field, plus `usage`, `charged` and `owed`, so the whole history can be rebuilt from logs. Also: `HoldSet`, `HoldCleared`, `TopUp` (with the arrears it paid), `Withdrawn`, `MachineBound`, `OperatorSet`.

---

## 7b. Device firmware (DEV-4)

[firmware/mohar](firmware/mohar): C++ on the Arduino core for the ESP8266, built with PlatformIO. `keccak.*` is Keccak-256, `wots.*` is the same scheme as section 3, `keystore.*` holds the key, `console.*` is a serial command line.

- **First boot, no key:** a 32-byte seed from the hardware random generator (radio on, mixed with timing and chip ID), then all 256 leaves and the Merkle tree are built, which takes **about 245 s**. Boot prints `KEY READY root=0x… pubSeed=0x… ms=… source=generated`.
- **Later boots:** the key loads in **5 ms** (`source=loaded`).
- **Files:** `/seed.bin` is 32 bytes. `/tree.bin` is 511 nodes × 32 bytes = 16,352 bytes (256 leaves, then 128, 64 … 1, the root last). Writes go to a temporary file and are renamed, so power loss can't leave half a file. A seed with no valid tree is rebuilt from the same seed on the next boot.
- **Signing:** the 67 chain values are recomputed from the seed, and the 8 Merkle siblings are read from `tree.bin`. It takes up to 906 ms and leaves 47,592 bytes of heap.
- **The seed never leaves the device:** no command prints it. The one exception is the test command that accepts a seed as *input*.
- **Two builds.** `dev` adds `keccak`, `keygen-fixed`, `sign` and `wipe` for tests. **`release` answers only `info`.** In release, nothing can ask the board to sign, because DEV-5 makes the board build and sign its own transactions.
- **Opening the serial port resets the board** (the USB chip wires DTR/RTS to reset). The test tools wait for it to boot.

### Transactions built on the device (DEV-5)

`frametx.*` builds the standard 4-frame report from a handful of inputs: the device's account, the ledger, the paymaster, the nonce, the fees and the report fields. It has its own RLP encoder and ABI encoder, and gives the same calldata, digest, raw bytes and JSON as the TypeScript library in all 31 vectors ([firmware/vectors/tx.json](firmware/vectors/tx.json)), which cross RLP's length boundaries. It also writes the sidecar's JSON, streamed so the whole body is never in memory.

**Step guard:** before any key is used, the device counts the verifier steps in the digest. Above 630 it raises the report's `salt` and rebuilds. About 0.1% of reports need this.

### One-time-key safety (DEV-5)

[firmware/mohar/src/intent.cpp](firmware/mohar/src/intent.cpp). A leaf must never sign two different messages, even across power loss. The leaf is `nonce − 1`, and the device keeps a counter `nextLeaf` plus at most one pending *intent*.

**Order of events for a new report:** guard → **save the intent to flash** (nonce, final report, digest, `nextLeaf`) → only then sign → return the transaction. The intent is saved before the signature exists, so a crash can never leave a signature that flash doesn't know about.

**State on flash:** two alternating files, each with a sequence number and a checksum. A write goes to the older one, so a power cut mid-write leaves the other intact. The state is tied to the key's root, so a new key starts a fresh counter.

| Situation | Result |
|---|---|
| Chain nonce equals saved intent's, same content | Rebuilds and returns the **identical** transaction (`resent`) |
| Same nonce, different content | `LEAF_USED` |
| Chain nonce above the intent's | The intent was mined: mark done, carry on |
| Chain nonce below the intent's | `CHAIN_BEHIND`: refuses to sign |
| No intent, nonce is `nextLeaf + 1` | Normal |
| No intent, nonce higher | Jumps forward (`jumped`) |
| No intent, nonce lower | `CHAIN_BEHIND`: a reset chain or lying RPC can't make the device reuse a key |
| Nonce 0 | `BAD_NONCE` |
| Leaf 256 or above | `KEYS_EXHAUSTED` |

**A bug the tests found:** a state reset restarted the sequence number at 0, so after a reboot an older state slot won. The device then refused to sign (safe), but it was wrong. Fixed, with a regression test.

**What this doesn't cover:** a transaction signed and lost before it reaches the network is resent identically; one that is mined and not noticed is detected by the nonce. Flash wear and a flash corrupted outside our files aren't covered.

### Pulse counting (DEV-7)

[firmware/mohar/src/meter.cpp](firmware/mohar/src/meter.cpp). D6 (GPIO12) is `INPUT_PULLUP` with an interrupt on both edges (Pico GP0 to D6, GND to GND). The interrupt only records times and counts.

| Low time | Class |
|---|---|
| Under 15 ms | Glitch: counted separately, not energy |
| 15 to 200 ms | Valid pulse |
| Over 200 ms | Stuck-low event, counted once, not energy (found in the main loop, since the interrupt can't see a pulse that never ends) |

Power estimate: `W = pulses × 1,125,000 / window ms` (3,200 pulses per kWh). A window gives valid pulses, glitches, stuck-low events, average and peak watts, and the longest gap, packed into the report's 32-byte `sensors` word (big-endian): bytes 0–3 valid pulses, 4–5 glitches, 6–7 stuck-low, 8–9 average watts, 10–11 peak watts, 12–15 window ms, 16–19 longest gap ms, 20–27 cumulative pulses, 28–31 zero.

**Measured, ESP8266 against the Pico, counters read at the same moment:**

| Load | Pico | ESP8266 |
|---|---:|---:|
| Normal 900 W, 90 s | 72 pulses | 72 |
| Surge 12,000 W, 20 s | 215 | 215 |
| Glitch mode, 40 s | 32 pulses, 25 glitches | 32 pulses, 25 glitches |
| Off, 20 s | 0 | 0 (line reads high) |
| Heavy 3,000 W, 30 s | | 2,989 W average, 3,095 W peak |

**Not done yet:** the window isn't yet taken at each checkpoint or put into reports, the cumulative total isn't kept across reboots (it must continue from the ledger's `lastTotal`, or the ledger would reject a lower total), and nothing drives the status LED.

### The decision model (0G-1)

[signer/tools/0g-eval.ts](signer/tools/0g-eval.ts) runs the labelled windows in [firmware/sim/scenarios.json](firmware/sim/scenarios.json) through a model. Results are in `docs/evidence/`.

| Model | Result |
|---|---|
| `laya` (free decision model) | Gave P(inspect) of 0.53 to 0.62 for everything. **Can't tell normal from overload** |
| `vela-2.0-9b` (cheap decision model) | Missed 6 of 7 inspect cases |
| `qwen3.8-flash`, reasoning on | Right on most clear cases, but 6 to 20 s a call and about 1 in 10 timed out |
| **`qwen3.8-flash`, `enable_thinking: false` (chosen)** | **19 of 19 scenarios at 5 of 5 runs.** p95 latency 1.2 s, no timeouts, largest response 1,159 bytes, request IDs matching in 95 of 95 |

**How the device asks:** `POST /v1/chat/completions` with `temperature 0`, `max_tokens 16`, `enable_thinking: false`, the owner's policy as the system message and the meter window as plain text. The device accepts only the exact words `RUN` or `INSPECT`, and anything else is no decision. The request ID is `x_0g_trace.request_id`. The router sends two `X-Request-Id` headers, and the UUID one matches the trace.

**Honest caveats:** the policy text (average above the sanctioned load, 3 or more glitches or any stuck-low, silence after load, spacing that doesn't look like a load) was written after seeing the first 14 scenarios. Only the 5 added afterwards are an independent test. The model also applies fixed rules, so the AI's value here is judging combinations of signals; the glitch and overload thresholds are also enforced in code, and **0G can only make the device more cautious.** The key sits in the board's flash once 0G-2 is built, so it must be a low-limit key.

---

## 8. Measured numbers

All are from the local client, build `9aa3645d`, the same build the public devnet reports.

### Gas for one report

| Item | Gas |
|---|---:|
| Account validation at 495 steps | 73,801 |
| Account validation at 630 steps (the device's limit) | **89,161** of 90,000 |
| Account validation at 645 steps | Fails with `out_of_gas` in frame 0 |
| Paymaster validation | 7,556 of 9,900 |
| Report frame, `MachineLedger`, typical | 24,338 to 35,413 of 50,000 |
| Report frame, worst case (first reading, `INSPECT`, 64-byte request ID) | 35,686 of 50,000 |
| Settle frame | 11,670 of 40,000 |
| Total transaction, typical report | 188,784 to 192,880 |
| Total transaction, a report that creates the ledger's slot 1 | 286,704 to 290,800 |
| Maximum cost the paymaster approves | About 0.00069 ETH at 2 gwei |

Before DEV-3, against a minimal stand-in contract, the report frame used 4,066 gas and the total was 170,352.

### Storage and code are expensive on this devnet

| Item | Cost | How measured |
|---|---:|---|
| Creating a storage slot | About 98,600 gas | Total gas minus frame gas, for a report that created one slot |
| Deploying code | About 1,670 gas per byte | `eth_estimateGas` on the ledger at three code sizes |
| Deploying `MachineLedger` | About 6.0 million gas | Same; at 100,000 optimizer runs it was 8.4 million, so we use 200 |

So deployments now estimate their gas instead of using a fixed limit, and the ledger is packed so reports don't create slots.

- **Rule of thumb:** account validation costs about 17,350 + 114 per hash step.
- **Total stays constant:** it was the same across different digests, so validation frames appear to be charged at their declared limit. We've observed this but haven't traced why.

### Hash steps per digest

| Measure (400,000 random digests) | Value |
|---|---:|
| Mean | 506 steps |
| Above 620 | 0.116% |
| Above 638 | 0.0215% |

So a rare digest would run out of gas. The device must count steps **before signing** and change a salt in the report if the count is above 630. That costs almost nothing, since no key is used until a digest qualifies.

### Why w = 16 and not w = 4

| | w = 16 (chosen) | w = 4 |
|---|---:|---:|
| Validation gas, 60 samples | 65,098 to 82,198 | 51,939 to 57,069 |
| Signature | 2,400 bytes | 4,512 bytes |
| Total transaction gas, self-paying | 169,146 | 304,314 |
| Worst-case signing hashes | 1,005 | 399 |

w = 4 saves validation gas, but it nearly doubles total cost, because calldata is expensive on this chain. w = 16 already fits the cap.

### The board

Measured on your ESP8266EX at 160 MHz with Wi-Fi off:

| Measure | Result |
|---|---:|
| Keccak-256 self-test | Pass |
| Hash rate, 64-byte input | 1,137 per second |
| 536 chain hashes (about an average signature) | 471 ms |
| 1,005 chain hashes (worst case) | 883 ms |
| Generating the full key (256 leaves + tree) | **245 s measured** (226 s calculated) |
| Free heap | 51,560 bytes |
| Flash | 4 MB |

Timing with Wi-Fi on hasn't been measured.

---

## 9. What the tests attack

Most integration tests hold a **valid signing key**, modelling a thief. Every case below runs on the client.

| Attack | Expected result | Fails at |
|---|---|---:|
| Change any tested byte of the signature | Rejected | Frame 0 |
| Sign with a different device's key | Rejected | Frame 0 |
| Signature one byte too long or too short | Rejected | Frame 0 |
| Reuse a signature on a changed reading | Rejected | Frame 0 |
| Sign with the wrong leaf | Rejected | Frame 0 |
| Stolen key: call another contract | Rejected | Frame 0 |
| Stolen key: call another function, or send empty calldata | Rejected | Frame 0 |
| Stolen key: send value | Rejected | Frame 0 |
| Stolen key: call `unlockStake()` | Rejected | Frame 0 |
| Stolen key: remove the settle frame | Rejected | Frame 1 |
| Stolen key: give settle under 40,000 gas | Rejected | Frame 1 |
| Stolen key: raise the fee above the cost cap | Rejected | Frame 1 |
| Spend after quota runs out | Rejected | Frame 1 |
| Paused fleet or revoked device | Rejected | Frame 1 |
| Replay a mined transaction | Rejected | Nonce check |
| Non-owner changes policy or withdraws | Reverts | Normal call |
| `refill` within 24 hours | Reverts | Normal call |
| Anyone but the bound meter reports, the owner included | `NotMachine` | Ledger |
| Repeat or lower `seq` | `StaleSeq` | Ledger |
| Lower `total`, to undo usage | `TotalWentDown` | Ledger |
| Mode 4, confidence 101, or a 65-byte request ID | `BadMode`, `BadConfidence`, `RequestIdTooLong` | Ledger |
| Clear a hold as the owner, the meter or a stranger | `NotOperator` | Ledger |
| Clear a hold with a `RUN` report or a top-up | Hold stays set | Ledger |
| Bind a second meter | `AlreadyBound` | Ledger |
| Withdraw more than was earned | `OverEarned` | Ledger |

**What a stolen key can still do:** post false readings, within quota, until the owner revokes it. It can't lower the total, and it can't clear a hold.

---

## 10. The local chain

The public devnet's faucet is empty, and it can be reset at any time, so development uses a private copy.

- **[devnet/up.sh](devnet/up.sh)** starts `ghcr.io/forshtat/ethrex:eip8141-tracer-latest` in Docker. It's bound to localhost: RPC on port 18545, Engine API on 18551. State is thrown away on every start.
- **[devnet/make-genesis.ts](devnet/make-genesis.ts)** builds the genesis from [devnet/snapshot.json](devnet/snapshot.json), a saved copy of the public devnet's chain config and system contracts. All forks are active from block 0. Only our local deployer is funded.
- **[devnet/producer.ts](devnet/producer.ts)** plays the consensus client through the Engine API, making one block every 2 seconds by default. The client's built-in `--dev` mode can't produce Hegota blocks.

**Differences from the public devnet:** a single node, no peers, and all forks active from genesis.

### The local alt mempool

**[devnet/sidecar.sh](devnet/sidecar.sh)** runs the same sidecar code as the public devnet, `forshtat/mempool-workshop-sidecar` at commit `2e22ff0`, in standalone mode against the local chain. It uses the public devnet's rules: staking registry `0xd51c…2d2f` and a 0.01 ETH minimum stake, with admission reports on. It listens on `127.0.0.1:14337/rpc`. Its relayer is a local key in `.secrets/sidecar-relayer.key`, funded on the local chain only.

**What happens to a submission,** as on the public node: `eth_sendFrameTransaction` → one traced simulation on ethrex → the ERC-8421 rules → the mempool → relayed to ethrex's privileged route → mined.

**Switching networks** is the `MOHAR_NET` variable, with no code change:

| `MOHAR_NET` | Submission | Proves |
|---|---|---|
| `local` (default) | Privileged route, skipping mempool rules | Execution only |
| `local-alt` | Our sidecar | Execution and the alt mempool's rules, on our copy |
| `public` | The public gateway | Everything, on the shared network |

Frame transactions don't exist on Sepolia, so it isn't an option here. ENS uses Sepolia separately.

**Run the EF-2 proof:** `MOHAR_NET=local-alt node signer/tools/ef2.ts`. It signs one report, sends the bytes to the canonical path (refused) and to the sidecar (admitted), saves the admission record, then checks the refusals on throwaway contracts. The same script runs on `public` once funded.

**Keys:** [signer/src/devnet.ts](signer/src/devnet.ts) creates a throwaway deployer key in `.secrets/`, which git ignores. Devices never use it. We don't use the devnet's published genesis key: the repo that publishes it says it's an operator key, and it's also the node's relayer, so using it could disrupt others.

---

## 11. Limits of what's built

- **Physical security:** ESP8266 flash is readable. Nothing here protects a seed from someone holding the board.
- **Cryptography:** custom and unaudited, and not standards-compliant.
- **No key migration:** one fixed root and verifier. After 256 transactions the account can't sign. Moving to a new root or scheme is future work.
- **Pulse total across reboots:** the ESP's pulse count restarts at 0 on reboot; it must continue from the ledger's `lastTotal` (not yet built), or the ledger rejects the lower total.
- **Sensor truth:** a signature shows the key signed something, not that the reading is correct.
- **Maturity:** EIP-8141 and ERC-8421 are drafts, and this runs only on devnets.
- **The meter is simulated:** the Pico generates the pulses a real meter's impulse output would. Nothing measures real electricity, and nothing disconnects a supply.

---

## 12. Manual testing

Every command below was run on this machine and gave the results shown. Run them from `mohar/`.

**You need:** Docker, Node 23.6 or newer, and solc 0.8.28 (Foundry installed it at `~/.local/share/svm`). For the board: PlatformIO (`pio`) and the ESP8266 on USB.

### Test 1: Install and build

```sh
npm install --ignore-scripts
npm run build
```

**Expected:** Forge compiles the ledger (`Compiler run successful!`, or `No files changed` on a rerun), then these lines, plus experiment contracts:
```text
MoharAccount: creation 743 bytes, runtime 615 bytes
QuotaPaymaster: creation 786 bytes, runtime 710 bytes
```

### Test 2: Signature unit tests

```sh
npm test
```

**Expected:** `tests 9`, `pass 9`, `fail 0`.

### Test 3: Start the local chain

```sh
./devnet/up.sh
```
**Expected:** `genesis ready: local deployer 0xcfb2…Ef60 funded with 1,000,000 ETH (local chain only)`, then a container ID.

In a **second terminal**, and leave it running:
```sh
node devnet/producer.ts 2
```
**Expected:** `producing a block every 2s via http://127.0.0.1:18551`, with a new line every so often.

Back in the first terminal, run this twice, a few seconds apart:
```sh
cast block-number --rpc-url http://127.0.0.1:18545
```
**Expected:** the number goes up.

### Test 4: Account, paymaster and ledger, including attacks

```sh
npm run test:integration
```
**Expected, in about two minutes:** `tests 38`, `pass 38`, `fail 0`, with lines like these. Step counts and gas vary, because each run uses new keys:
```text
steps 495, account 73801 gas, paymaster 7556 gas, settle 11670 gas, total 286704 gas, ...
canonical violation: StorageReadNonSender
mined: total gas 286704, frames 73801, 7556, 33814, 11670
replay verdict: Invalid Transaction: Nonce mismatch: expected 4, got 1
630 steps used 89161 of 90000 gas
645 steps fails in frame 0: out_of_gas
seq 1: steps 495, frames 73801 / 7556 / 33796 / 11670, total 188784 gas, ...
worst case: report frame 35686 gas, ...
```
The first report on a new ledger costs about 98,600 more, because it creates a storage slot (section 7a).

### Test 5: Send one WOTS-signed transaction yourself

```sh
node signer/exp/e04_first_wots.ts
```
**Expected:**
```text
MINED block <N> status 0x1, total gas 169146
frame receipts: [{"status":"0x1","gas":<usually 65,000 to 85,000>,...},{"status":"0x1","gas":4066,...}]
nonce now 2
```

Check it independently, using the hash from the `sent 0x…` line:
```sh
cast rpc eth_getTransactionReceipt <hash> --rpc-url http://127.0.0.1:18545
```
**Expected:** `"status":"0x1"`, `"type":"0x6"` and a `frameReceipts` array with two successful entries.

### Test 6: See what the opcodes return

```sh
node signer/exp/e03_probe.ts
```
**Expected:** `keys=[]` and `seq=MAX` rejected, as in section 5. `local sigHash` equals `SIG_HASH` in the dump. The `SIGDATACOPY` `expected` and `got` lines match.

### Test 7: Check the public devnet's gas cap

This is read-only, needs no funds and sends nothing that can be included.

```sh
MOHAR_NET=public node signer/exp/e02_budget_probe.ts
```
**Expected:**
- Limits up to 97,200: rejected only for having no funds (`has 0 wei`).
- Limits from 100,001: `exceeds MAX_VERIFY_GAS 100000`.

### Test 8: Board benchmark

Port numbers like `/dev/ttyACM0` change when boards are replugged, so use the fixed names under `/dev/serial/by-id/`. On this machine the ESP8266 is `usb-1a86_USB_Single_Serial_5717135611-if00`.

```sh
cd firmware/bench
ESP=/dev/serial/by-id/usb-1a86_USB_Single_Serial_5717135611-if00
pio run -t upload --upload-port $ESP
pio device monitor --port $ESP --baud 115200
```
Press **RST** on the board. Quit with `Ctrl+C`. Some garbage characters at boot are normal.

**Expected:**
```text
RESULT chip_id=0033ac0b cpu_mhz=160 ...
RESULT flash_real=4194304 ...
RESULT keccak_selftest=PASS
RESULT hashes=1000 ms=879 per_second=1137
RESULT sign_worst hashes=1005 ms=883
=== DONE ===
```
Timings can vary slightly.

### Test 8a: The alt mempool, locally

With the chain and producer running (Test 3), in a third terminal:
```sh
./devnet/sidecar.sh
```
The first run builds the sidecar into `.state/sidecar-src`, which takes a few minutes and about 1 GB. To reuse an existing build, set `SIDECAR_SRC` to its folder. **Expected:** `HTTP server listening at http://127.0.0.1:14337/rpc`.

Then:
```sh
MOHAR_NET=local-alt node signer/tools/ef2.ts
```
**Expected, in about a minute:**
```text
EF2-T1 canonical eth_sendRawTransaction: {"refused":true,"error":"... StorageReadNonSender"}
EF2-T2 alt eth_sendFrameTransaction: {"hash":"0x…","matchesLocal":true}
EF2-T4 receipt: {"status":"0x1", ... "frames":[{"status":"0x1",...} × 4]}
accountBalanceWei: 0
EF2-T5 quota: {"before":"10","after":"9"}
EF2-T8 replay: {"refused":true, ... "Nonce mismatch ..."}
EF2-T7 unstaked paymaster: {"refused":true,"error":"... unstaked payer accessed payer slot ..."}
EF2-T6 second report over quota: {"refused":true,"error":"... validation frame 1: reverted"}
EF2-T9 revoked device: {"refused":true,"error":"... validation frame 1: reverted"}
```
Evidence is written to `docs/evidence/ef-2-local-alt.json`. Stop the sidecar with `Ctrl+C`.

### Test 8b: Device firmware on the ESP8266

Use the fixed port name from Test 8. Put `ESP=…` in your shell first.
```sh
cd firmware/mohar
pio run -e dev -t upload --upload-port $ESP        # test build
cd ../..
uv run --no-project --with pyserial python firmware/tools/device_test.py $ESP all   # about 10 minutes
```
**Expected:** `first boot: generated 245 s` (or `loaded` if a key already exists), then `PASS` lines for Keccak (7), root and pubSeed, 20 signatures byte-identical, reload in under 2000 ms, and the seed-leak check. A quick rerun on a board that already holds the test key: `... device_test.py $ESP rest`.

**Board-signed transaction, with the chain and sidecar from Tests 3 and 8a running:**
```sh
MOHAR_NET=local-alt node signer/tools/device-sign.ts $ESP
```
**Expected:** `account 0x… root() equals the board's root`, `board signed in ~500 ms`, `MINED status 0x1, frames ["0x1","0x1","0x1","0x1"], account balance 0`, `DEV4-T8 PASS`. It uses leaf 0 of the board's key, so a second run on the same key fails (the account's nonce would line up with a used leaf): run `device_test.py $ESP wipe-twice` or send `wipe` first to get a fresh key.

**By hand:** `pio device monitor --port $ESP --baud 115200`, press RST, and watch `KEY READY`. Type `info` and Enter. In the release build (`pio run -e release -t upload ...`), `sign` answers `UNKNOWN`.

### Test 8c: Device-built transactions and key safety (needs the chain, sidecar, and the board holding the test key)

Put the test key on the board once (4 minutes): `uv run --no-project --with pyserial python firmware/tools/device_test.py $ESP keygen-fixed`.

```sh
uv run --no-project --with pyserial python firmware/tools/device_test.py $ESP tx       # 31 vectors, about a minute
uv run --no-project --with pyserial python firmware/tools/device_test.py $ESP safety   # leaf safety, crashes, reboot table, exhaustion
MOHAR_NET=local-alt node signer/tools/device-report.ts                                 # three device-built transactions mined
```
**Expected:** `PASS DEV5-T1 31 vectors match …`, `PASS DEV5-T2 …`, then `PASS` for T9a, T4, T3, T5 (both crash points), eight T7 lines, T8 (two lines) and the reset-survives-reboot line. Last: `report 1 … 0x1 0x1 0x1 0x1`, `ledger: lastSeq 3, lastTotal 120, hold true … account balance 0` and `DEV5-T9 PASS`.

**The power pull (T6), which needs a person at the cable.** Two terminals' worth, but one at a time:
```sh
uv run --no-project --with pyserial python firmware/tools/powerpull.py $ESP start   # streams reports; leave it running
```
While it prints `reports done: N`, **unplug the board's USB cable**, wait about 3 seconds and plug it back in. `start` then prints `STOPPED`. Then:
```sh
uv run --no-project --with pyserial python firmware/tools/powerpull.py $ESP check
```
**Expected:** `STATE … hasIntent=1`, `resend 1: RESULT OK resent=1 …` and `resend 2:` identical, `PASS: the saved intent was resent …`, then `next new report: RESULT OK … cleared=1` and `PASS: the board signs normally after the pull`. Repeat three times, and pull at a different moment each time (right away, a few seconds in, later). Run on 6 November at 10:25: three pulls, three passes. The board must hold the test key (`device_test.py $ESP keygen-fixed`).

### Test 8d: Pulse counting, Pico to ESP8266

Wires: Pico GP0 (pin 1) to D6, GND to GND. The dev firmware must be on the board.
```sh
PICO=/dev/serial/by-id/usb-Raspberry_Pi_Pico_E662588817693B2C-if00
uv run --no-project --with pyserial python firmware/tools/meter_test.py $ESP $PICO   # about 3 minutes
```
**Expected:** `PASS DEV7-T1` (counts equal within 1), `T2`, `T13` (average within 5% of 3,000 W), two `T3` lines (valid pulses equal, glitches counted separately) and `T4`, then `ALL PASS`. **By hand:** the Pico's LED and the ESP's should flash together. With `pio device monitor` on the ESP, type `meter` for raw counts or `window` for the last window.

### Test 8e: The 0G decision model

Your key must be in `.secrets/0g-api.key`. This spends a few cents of credit at most.
```sh
node signer/tools/make-scenarios.ts
node signer/tools/0g-eval.ts qwen3.8-flash 5 0.5     # about 2 minutes
```
**Expected:** every scenario `ok 5/5`, `0G1-T3 … PASS`, no timeouts, p95 latency about 1 to 1.5 s, request IDs matching. Rerun with `laya` or `vela-2.0-9b` to see why they weren't chosen.

### Test 9: Pico meter simulator

The Pico runs CircuitPython 10.0.3 and our `code.py`. Open its console, which doesn't reset it:
```sh
pio device monitor --port /dev/serial/by-id/usb-Raspberry_Pi_Pico_E662588817693B2C-if00 --baud 115200
```
**Expected:** a line every 2 seconds, and the onboard LED flashing once per pulse:
```text
METER {"event":"tick","mode":"normal","watts":900,"pulses":3,"glitches":0,"wh":0.9375,"auto":false}
```
Type single letters (no Enter needed): `h` heavy, `s` surge, `g` glitch, `x` off, `n` normal, `r` reset counters, `?` status. Measured: 900 W gives a pulse about every 1.25 seconds, 3,000 W gave 10 pulses in 4 seconds, 12,000 W gave 21 in 2 seconds, and `g` added 3 spikes of 2 ms in 6 seconds. Quit with `Ctrl+C`.

To reinstall it: copy `firmware/pico-meter/code.py` and `boot.py` onto the `CIRCUITPY` drive.

### Stop everything

Press `Ctrl+C` in the producer terminal, then:
```sh
docker rm -f mohar-ethrex
```

### Restoring the board's original firmware

Your original flash is saved at `../esp8266-flash-backup-original.bin`, with SHA-256 `529c9a26…3fce3`. We haven't run this restore, because it would overwrite the current firmware:
```sh
esptool --port /dev/ttyACM0 write-flash 0 ../esp8266-flash-backup-original.bin
```
