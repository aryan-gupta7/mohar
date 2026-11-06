# Mohar: Development Plan

We build in phases, one at a time. Each phase below says exactly what gets built, how it must behave, and which tests prove it.

**Deadline:** Saturday, November 7, 2026, 9:00 AM IST
**Last updated:** Friday, November 6, 2026, 09:15 IST

**Story (changed Friday 08:20):** Mohar is a **prepaid electricity meter that signs its own readings**. A Raspberry Pi Pico H plays the meter's impulse output, and the ESP8266 counts the pulses, decides, signs and reports. There is **no servo** and nothing physically disconnects a supply: the ledger records consumption, credit, arrears and inspection holds. Contracts, WOTS signing, the quota paymaster and the ENS identity design are unchanged.
**Related:** [mechanism.md](mechanism.md) explains what's built. [update-log.md](update-log.md) records every step. The product plan is `plan.md` in the parent folder, outside this repo. **Where they differ, this file and mechanism.md are correct**, because they come from testing.

---

## 1. How we work

### A phase is done only when all of these are true

1. Every test in the phase has been **run** and passed.
2. Evidence is saved: outputs, transaction hashes and measurements.
3. [mechanism.md](mechanism.md) describes what was built.
4. [update-log.md](update-log.md) has an entry for each step.
5. Manual testing steps have been given to you.
6. A local git commit is made.

**If a test can't run, the phase stays open and we say why.** A test is never marked as passed because it should pass.

### Git

- Claude makes local commits, on branch `dev`, at the end of each phase and at sensible points inside it.
- **Nothing gets pushed.** You create the GitHub repo when you're ready, before submission.
- Keys and secrets stay out of git: `.secrets/`, `.state/` and `firmware/**/secrets.h` are ignored.

### Evidence labels

- **Verified:** run on the real client, live network, or board.
- **Docs:** stated in documentation, not tested by us.
- **Untested:** a design assumption that a listed test will settle.

---

## 2. Order and status

The phases run in this order. A target is the planned finish, and each assumes work continues overnight, so adjust for your team size.

| # | Phase | What it delivers | Target | Status |
|---:|---|---|---|---|
| 1 | [DEV-0](#dev-0-tooling-local-chain-and-baseline) | Tooling, local chain, board baseline | | ✅ Done |
| 2 | [DEV-1](#dev-1-wots-signer-and-machine-account) | WOTS signer and account | | ✅ Done locally |
| 3 | [DEV-2](#dev-2-quota-paymaster) | Quota paymaster | | ✅ Done locally |
| 4 | [DEV-3](#dev-3-machine-ledger) | Machine ledger | Fri 01:00 | ✅ Done locally, Fri 08:40 |
| 5 | [DEV-4](#dev-4-firmware-keys-and-signing) | Device keys and signing | Fri 12:00 | ✅ Done Fri ~09:15 |
| 6 | [EF-2L](#ef-2l-alt-mempool-rules-on-a-local-sidecar) | Alt mempool rules, local sidecar | Fri 12:00 | ✅ Done Fri 08:55 |
| 7 | [DEV-5](#dev-5-firmware-transactions-and-key-safety) | Device transactions, key safety | Fri 14:00 | ✅ Done Fri 10:25, all tests |
| 8 | [DEV-6](#dev-6-firmware-networking) | Device Wi-Fi, TLS and RPC | Fri 16:00 | Wi-Fi received |
| 9 | [EF-1](#ef-1-wots-transaction-on-the-public-devnet) | WOTS transaction on the public devnet | **As soon as funded** | Needs funds |
| 10 | [0G-1](#0g-1-choose-and-test-the-decision-model) | Decision model chosen and tested | Fri 14:00 | ✅ T1–T5 passed Fri ~09:45; T6–T8 open |
| 11 | [EF-2](#ef-2-the-alt-mempool-proof) | Alt mempool proof, public | After EF-1 | Needs funds |
| 12 | [ENS-1](#ens-1-fleet-name-and-registry) | Fleet name and registry | Fri 16:00 | Needs Sepolia ETH |
| 13 | [DEV-7](#dev-7-meter-signal-acquisition-and-device-behaviour) | Meter signal acquisition and device behaviour | Fri 18:00 | Partly done: counting T1–T4, T13 passed; T5–T12 open |
| 14 | [EF-3](#ef-3-device-signed-transaction-with-the-laptop-off) | Device-signed, laptop off | Fri 19:00 | |
| 15 | [ENS-2](#ens-2-machine-identity-and-permissions) | Machine identity and roles | Fri 19:00 | |
| 16 | [DEV-8](#dev-8-dashboard) | Dashboard | Fri 21:00 | |
| 17 | [ENS-3](#ens-3-discovery-and-permission-demo) | Discovery and permission demo | Fri 22:00 | |
| 18 | [0G-2](#0g-2-the-device-calls-0g) | Device calls 0G | Fri 22:00 | |
| 19 | [ENS-4](#ens-4-the-device-reads-its-policy-from-ens) | Device reads ENS policy | Sat 00:00 | Optional |
| 20 | [0G-3](#0g-3-decision-loop-and-safe-stop) | Decision loop, device state and LED | Sat 00:30 | |
| 21 | [0G-4](#0g-4-episode-log-and-replay) | Episode log and replay | Sat 03:00 | Needs 0G tokens |
| 22 | [REL-1](#rel-1-full-rehearsal) | Full rehearsal, following the [demo story](#demo-story) | Sat 05:30 | |
| 23 | [REL-2](#rel-2-submission) | Submission | **Sat 08:00** | |

The schedule was moved on Friday 08:46: the work started again at 08:20, and the public funds still haven't arrived. EF-2L was added so alt mempool rules can be tested before funds come.

---

## 3. Facts this plan is built on

| Fact | Evidence | Label |
|---|---|---|
| Validation is capped at **100,000 gas** on the public devnet | Sidecar rejected 102,801 with `exceeds MAX_VERIFY_GAS 100000`; its source has no stake exception | **Verified** unstaked; staked is settled in EF-1 |
| The docs' 1M and 2.5M staked budgets don't apply in that check | Same source | **Verified** in source only |
| Only `nonce_keys = [0]` fits the budget | Measured in [e03_probe.ts](signer/exp/e03_probe.ts) | **Verified** |
| `TXPARAM`, `SIGPARAM`, `FRAMEPARAM`, `FRAMEDATALOAD`, `SIGDATACOPY`, `APPROVE` work from Yul | Same probe | **Verified** |
| Our digest equals the client's `SIG_HASH` | Same probe | **Verified** |
| The canonical rules reject the paymaster: `StorageReadNonSender` | Integration tests | **Verified** |
| Account validation fits: 89,146 of 90,000 gas at 630 steps | Integration tests | **Verified** |
| Paymaster validation uses 7,556 of 9,900 gas | Integration tests | **Verified** |
| ESP8266: 1,137 hashes per second, 883 ms for 1,005 hashes, 51,560 bytes free heap | Board, Wi-Fi off | **Verified** |
| Devnet TLS 1.2 works with `ECDHE-ECDSA-AES128-GCM-SHA256`; plain HTTP redirects | `openssl` and `curl` from the laptop | **Verified** from a laptop |
| The smaller TLS fragment option wasn't negotiated | Same | **Verified** from a laptop |
| The public faucet is empty | Live response, last checked at 23:58 | **Verified**, can change |
| `mohar.eth` is available on Sepolia, at 8.000021 test USDC per year | Live `isAvailable` and `getRegisterPrice` | **Verified** at 23:40, can change |
| Sepolia's test USDC accepts `mint` from anyone, and it's an accepted payment token | Live `eth_call`, `isPaymentToken` | **Verified** by simulation |
| 0G mainnet router speaks TLS 1.2 | `openssl` | **Verified** from a laptop |
| 0G testnet router fails the TLS handshake | `curl` and `openssl` | **Verified** at 23:40 |
| 0G responses carry `x_0g_trace.request_id`, and it matches `X-Request-ID` | [Router docs](https://0gfoundation.github.io/0g-router/) | **Docs** |
| `POST /v1/decisions` returns typed answers, and `laya` costs nothing | Model catalogue; [docs PR](https://github.com/0gfoundation/0g-doc/pull/418) | **Docs**, tested in 0G-1 |
| The alt mempool admits our paymaster | Source reading suggests yes | **Untested**, settled in EF-2L and EF-2 |
| The ESP8266 can run TLS while holding a signature | About 51 KB free before Wi-Fi | **Untested**, settled in DEV-6 |
| Creating a storage slot costs about 98,600 gas; code costs about 1,670 gas per byte | DEV-3 measurements | **Verified** on the local chain |
| The ledger's report frame fits: worst case 35,686 of 50,000 gas | DEV-3 worst-case test | **Verified** on the local chain |
| The Pico generates meter pulses at the intended rates | Its console, at 900, 3,000 and 12,000 W | **Verified** on the board |
| Frame transactions exist only on the EF devnet, not on Sepolia | EIP-8141 is a draft; Sepolia hasn't adopted it | **Docs**. ENS runs on Sepolia; the EF parts can't |
| The laptop and the ESP are on different Wi-Fi networks | Laptop on `ETHGlobal`, ESP to use its own network | **Verified** Fri 08:20. Matters for local-chain tests over Wi-Fi |

---

## 4. What I need from you

| # | What | Needed for | How |
|---:|---|---|---|
| 1 | **Devnet ETH: at least 0.2 ETH** at `0xcfb296f635254A4B3281D2e285174E98D643Ef60` | EF-1 onward | Ask Pierre or Alex at the EF booth to refill the faucet or fund this address |
| 2 | ~~Wi-Fi name and password~~ | DEV-6 | ✅ Received Fri 08:20, stored only in the git-ignored `secrets.h` |
| 3 | **0G API key** (`sk-…`) and team credits | 0G-1 | [pc.0g.ai](https://pc.0g.ai) → Dashboard → API Keys. Credits from the 0G booth |
| 4 | **Sepolia ETH: at least 0.05 ETH** at the same address | ENS-1 | Any Sepolia faucet, or the ENS booth |
| 5 | **Wiring:** Pico GP0 (pin 1) to NodeMCU D6, and GND (pin 3) to GND | DEV-7 | Details in DEV-7. No servo |
| 6 | **0G testnet tokens** | 0G-4 | [faucet.0g.ai](https://faucet.0g.ai), or the 0G booth. I'll give you the address |
| 7 | ~~Sidecar decision~~ | EF-2L | ✅ Approved Fri 08:20: build locally, keep switching easy |
| 8 | **How many people are building?** | Scheduling | Tells me what can run in parallel |
| 9 | **For Wi-Fi tests against the local chain:** put the laptop on the same network as the ESP | DEV-6 | Only needed then. The laptop is on `ETHGlobal`; the ESP uses your hotspot |

---

## 5. Kill rules

| Trigger | Action |
|---|---|
| **EF-1 not passed by Fri 12:00, because there are no funds** | Not a design failure. Keep building locally, and escalate to the EF team. The track accepts "code that submits one" if no admitted link is possible, though that's weaker |
| **EF-1 fails for any other reason** | Stop and rethink with the team. Everything depends on the EF core |
| **EF-2: paymaster not admitted by Fri 16:00** | Ask the EF team. Without it, our transaction passes the public mempool too, so **the claim that we need the alt mempool has to go**. We'd disclose that and keep the PQ account |
| **DEV-6: TLS can't work on the board by Fri 15:00** | The laptop forwards signed bytes and can't alter them. Drop "laptop off" and "no relayer" from all claims |
| **ENS behind schedule at Fri 22:00** | Skip ENS-4 and extras, but keep the rejected-edit demo. Without that, ENS is cosmetic |
| **0G: a 0G decision isn't changing the device's state and LED by Sat 02:00** | **Withdraw from the 0G track.** We won't submit a logging-only integration |
| **Sat 06:00** | Feature freeze: only fixes and docs after this |

---

# Part A: Development phases

---

## DEV-0: Tooling, local chain and baseline

**Status:** ✅ Done · **Needs from you:** nothing

**Why:** the public faucet is empty and that network can reset, so we need a private chain with the same rules, plus real board numbers.

**What was built**

| File | Purpose |
|---|---|
| `devnet/up.sh`, `make-genesis.ts`, `producer.ts`, `snapshot.json` | Local chain |
| `signer/src/devnet.ts` | RPC helpers, deployer key, switch between local and public |
| `contracts/build-yul.ts` | Compiles Yul with solc |
| `firmware/bench/` | Board benchmark |
| `signer/exp/e01` to `e03` | Experiments that produced the facts in section 3 |

**How it behaves**

1. `./devnet/up.sh` starts a fresh node with the same client build as the public devnet, `9aa3645d`, bound to localhost.
2. `node devnet/producer.ts` makes blocks through the Engine API.
3. No public network is needed after the snapshot is saved.
4. The benchmark prints chip, flash, heap, a Keccak self-test and hash speed.

**Tests:** [mechanism.md](mechanism.md) Manual tests 1, 3, 6, 7 and 8. All passed from a clean install at 23:45.

---

## DEV-1: WOTS signer and machine account

**Status:** ✅ Done on the local chain. The public devnet is covered by EF-1. · **Needs from you:** nothing

**What was built:** `signer/src/wots.ts`, `contracts/yul/MoharAccount.yul`, `signer/src/mohar.ts`, tests.

**How it behaves:** see [mechanism.md](mechanism.md) sections 3 to 6.

| Test | How to run | Result |
|---|---|---|
| Signature logic, 9 cases | `npm test` | ✅ 9 of 9 |
| WOTS transaction mined | `node signer/exp/e04_first_wots.ts` | ✅ Status `0x1` |
| Forged and malformed signatures fail in frame 0 | `npm run test:integration` | ✅ |
| Stolen-key limits on the account | Same | ✅ |
| Replay refused | Same | ✅ `Nonce mismatch` |
| 630 steps fits, 645 fails | Same | ✅ 89,146 gas; `out_of_gas` |

---

## DEV-2: Quota paymaster

**Status:** ✅ Done on the local chain. **Sidecar admission isn't tested;** that's EF-2. · **Needs from you:** nothing

**What was built:** `contracts/yul/QuotaPaymaster.yul`, more integration tests.

**How it behaves:** see [mechanism.md](mechanism.md) section 7.

| Test | Result |
|---|---|
| Report passes, account pays nothing, quota falls by one per report | ✅ |
| Fourth report over a quota of 3 fails in frame 1 | ✅ |
| Dropped settle, starved settle and high fee all fail in frame 1 | ✅ |
| Pause and revoke refuse payment | ✅ |
| Canonical rules refuse it with `StorageReadNonSender` | ✅ |
| Node returns a trace despite the canonical rejection | ✅ |

All run with `npm run test:integration`: 26 of 26 passed.

---

## DEV-3: Machine ledger

**Status:** ✅ Done on the local chain, Fri 08:40. All 12 ledger tests and the 26 earlier tests pass against it. · **Needs from you:** nothing

**Changes from the original spec, and why**

| Change | Why |
|---|---|
| **Arrears.** Usage beyond credit is owed, not dropped, and a top-up pays it first | Without a servo nothing stops consumption, so uncovered usage must still be recorded |
| Credit and arrears are **one signed `balance`** in the slot `report` already writes | A new storage slot costs about 98,600 gas here. A separate arrears slot would have been recreated each time credit ran out |
| `status()` also returns `arrears`, `lastMode` and `ledgerMode`; added `credit()`, `arrears()` and `ledgerMode()` | The device and dashboard need the ledger's own view of the mode |
| `report` also refuses confidence above 100 and request IDs over 64 bytes | Bounded logs |
| A plain transfer to the ledger is a top-up | Simple payment |
| Deployments estimate gas; optimizer at 200 runs | Code costs about 1,670 gas per byte here; the ledger costs about 6.0 million gas to deploy |

**Measured:** report frame 24,338 to 35,413 gas (worst case 35,686), total 188,784 to 192,880 gas, and about 98,600 more for the one report that creates the ledger's second slot. Maximum cost about 0.00069 ETH at 2 gwei. Details are in [mechanism.md](mechanism.md) section 7a.

**Why:** tests currently report to a stand-in contract. The ledger holds the shared state that parties actually rely on: readings, credit and holds. This is the on-chain reason the project exists.

**What gets built**

| File | Purpose |
|---|---|
| `contracts/src/MachineLedger.sol` | The ledger, in Solidity |
| `contracts/yul/MoharAccount.yul` | Adds `root()` and `pubSeed()` getters, so a dashboard can compare them with ENS |
| `signer/src/mohar.ts` | Ledger deployment and report encoding |
| `signer/test/integration/ledger.test.ts` | Ledger tests |
| `firmware/vectors/report.json` | Encoded reports, for firmware to match in DEV-5 |

**Interface**

```solidity
constructor(address owner, address operator, uint256 tariffWeiPerPulse)
function bindMachine(address account)            // owner, once only
function report(uint64 seq, uint64 total, uint8 mode, uint8 reason, uint8 confidence,
                uint8 model, uint32 salt, bytes32 sensors, string requestId)
function topUp() payable                         // anyone
function clearHold()                             // operator only
function setOperator(address operator)           // owner only
function withdraw(address to, uint256 amount)    // owner, up to the earned amount
function status() view returns (uint256 credit, bool hold, uint64 lastSeq, uint64 lastTotal,
                                uint256 tariff, uint256 earned)
```

Modes: `0 RUN`, `1 INSPECT`, `2 CREDIT_STOP`, `3 SAFE_STOP`.

**How it must behave**

1. `report` works only when called by the bound machine account.
2. `seq` must be strictly greater than the last one, and `total` can't go down. Otherwise it reverts.
3. Usage is `total − lastTotal`. The charge is usage × tariff, capped at the available credit. The charged amount moves from credit to earned.
4. `mode = INSPECT` sets the hold. No other mode changes it.
5. `topUp` adds to credit. **It doesn't clear a hold.**
6. Only the operator can clear a hold. Only the owner can change the operator or withdraw.
7. Every report emits an event carrying all its fields, so the complete log can be rebuilt from the chain alone.
8. `bindMachine` works once, so a machine can't be swapped later.
9. The account's getters don't weaken validation. Frame calls have empty calldata and take the same path as before.

**Tests:** run `npm run test:integration`. Every item must pass. **Result: all passed, Fri 08:40.**

| ID | Pass only if |
|---|---|
| DEV3-T1 | A stranger's `report` reverts; the bound account's succeeds |
| DEV3-T13 (added) | Worst case through the frame path: first report on an unfunded ledger, `INSPECT`, 64-byte request ID. All frames succeed |
| DEV3-T14 (added) | The ledger's ETH equals credit plus earned: checked after the charging sequence, after a withdrawal, and after the frame-path reports |
| DEV3-T2 | Equal or lower `seq` reverts; lower `total` reverts |
| DEV3-T3 | Credit and earned change by exactly the expected wei, including when credit is too low to cover the charge |
| DEV3-T4 | `INSPECT` sets the hold; `RUN`, `CREDIT_STOP` and `SAFE_STOP` don't |
| DEV3-T5 | `topUp` raises credit and leaves the hold set |
| DEV3-T6 | `clearHold` by a non-operator reverts; by the operator it succeeds |
| DEV3-T7 | Second `bindMachine` reverts |
| DEV3-T8 | Three reports through full 4-frame transactions are mined, and all four frames succeed each time |
| DEV3-T9 | The decoded `Report` event matches every input field exactly, with `requestId` lengths 0, 16 and 36 |
| DEV3-T10 | All 26 earlier tests still pass, now with the ledger as target |
| DEV3-T11 | Account validation at 630 steps is still at or below 90,000 gas |
| DEV3-T12 | `root()` and `pubSeed()` return the constructor values |

**Measurements to record:** report frame execution and state gas, total transaction gas, and maximum cost.

**If it fails:** the report frame isn't in the validation budget, so its limit can go up if needed. Raise the policy's cost cap to match, and record the new figures.

---

## DEV-4: Firmware keys and signing

**Status:** ✅ Done Fri ~09:15 (T5 result below). · **Needs from you:** nothing

**Results (dev firmware, the real ESP8266):**

| Test | Result |
|---|---|
| T1 | 7 Keccak inputs match Node: empty, `abc`, and 64, 135, 136, 137, 2,144 bytes |
| T2 | Root and pubSeed from the fixed test seed equal the TypeScript values (`0x6c0937ea…`). Generation took 245.5 s, no reset |
| T3 | 20 of 20 signatures byte-identical (leaves 0, 1, 127, 128, 255 × 4 digests) |
| T4 | After reset: loaded in **5 ms**, same root, no rebuild |
| T5 | `wipe` twice, generating each time: two different roots, 246 s each |
| T6 | The test seed never appears in the serial output. Random seeds can't be checked this way, but no command prints a seed |
| T7 | Slowest signature **906 ms** (all-`ff` digest); free heap during signing **47,592 bytes** |
| T8 | **The board signed a transaction that the local alt mempool sidecar admitted and mined: all four frames `0x1`, account balance 0.** Signing took 523 ms |
| T9 | Release build answers `UNKNOWN` to `sign`, `keccak`, `wipe` and `keygen-fixed`; `info` says `dev=0` |

First boot with no key generated one in 245 s. Both builds are in `firmware/mohar` (`pio run -e dev` and `-e release`); the 20-vector test is `firmware/tools/device_test.py`.

**Known limit:** the dev `sign` command doesn't stop a leaf being used twice. DEV-5 adds that guard, and the release build has no `sign` command at all.

**Why:** this is the first time the chip itself holds keys and signs. Its output has to match the contract exactly.

**What gets built**

| File | Purpose |
|---|---|
| `firmware/mohar/platformio.ini` | 160 MHz, 2 MB LittleFS |
| `firmware/mohar/src/keccak.*` | Keccak-256 |
| `firmware/mohar/src/wots.*` | Key derivation, tree, signing |
| `firmware/mohar/src/keystore.*` | Seed and tree in flash |
| `firmware/mohar/src/console.*` | Serial commands. Development commands exist only with `MOHAR_DEV=1` |
| `signer/tools/make-vectors.ts` | Generates expected values from the TypeScript signer |
| `firmware/tools/device_test.py` | Drives the board over serial and compares results |
| `signer/tools/device-sign.ts` | Deploys an account for the board's key and has the board sign a transaction |

**How it must behave**

1. **First boot, no key:** gets a 32-byte seed from the hardware random generator, with the radio on and mixed with timing. Builds all 256 leaves and the tree, saves them, and prints `KEY READY root=0x… pubSeed=0x… ms=…`. Expected time is about 4 to 5 minutes.
2. **Later boots:** loads the key in under 2 seconds, with no rebuilding.
3. **The seed never leaves the device.** No command prints it.
4. **Files:** `seed.bin` is 32 bytes and `tree.bin` is exactly 16,352 bytes (511 nodes).
5. **Signing:** a 2,400-byte result, under 1.2 seconds in the worst case. Long operations must feed the watchdog, so the board never resets.
6. **Development commands:** `info`, `keygen-fixed <seed>`, `sign <leaf> <digest>` and `wipe`. They can break one-time safety, so **release builds don't contain them.**

**Tests**

| ID | How to run | Pass only if |
|---|---|---|
| DEV4-T1 | `device_test.py keccak` | Empty input, `abc`, and 64, 135, 136, 137 and 2,144-byte inputs all match Node's output |
| DEV4-T2 | `device_test.py keygen` with a fixed test seed | Root and pubSeed equal the TypeScript values exactly; no reset occurs |
| DEV4-T3 | `device_test.py sign` | 20 vectors match byte for byte: leaves 0, 1, 127, 128, 255; digests all-zero, all-0xFF and random |
| DEV4-T4 | Reset the board | Same root, loaded in under 2 seconds, no rebuild |
| DEV4-T5 | `wipe` twice, generating each time | The two roots differ |
| DEV4-T6 | Read all serial output from T4 and T5 | The seed never appears |
| DEV4-T7 | `sign`, worst-case vector | Under 1.2 seconds; free heap stays above 35,000 bytes |
| DEV4-T8 | `node signer/tools/device-sign.ts` with the local chain up | **Board-signed transaction is mined on the local chain, status `0x1`, all frames succeed** |
| DEV4-T9 | Build without `MOHAR_DEV`, then send `sign` | The board answers `UNKNOWN`; it signs nothing |

**Manual test you can do:** press RST and watch `KEY READY` appear with the same root as before.

**If it fails:** if key generation is too slow or unstable, generate the tree on the laptop and upload it. Then the seed has been on the laptop, so **the "device generated its own key" claim must be dropped.**

---

## DEV-5: Firmware transactions and key safety

**Status:** ✅ Done Fri 10:25, including the power pull (T6) · **Needs from you:** nothing

**Results (dev firmware, real ESP8266, local chain and sidecar):**

| Test | Result |
|---|---|
| T1 | **31 of 31 vectors** match the library on calldata, digest, raw bytes and JSON. They cross every RLP boundary: nonces 1, 2, 127, 128, 129, 255, 256; request IDs of 0, 16, 36, 64 bytes; fees from 0 to 2^64−1 |
| T2 | A digest needing 660 steps ended at 480 with salt 1. No signature is made for a rejected digest, since the guard runs before any key is touched |
| T3 | Different content at a used leaf: `LEAF_USED` |
| T4 | Same content: byte-identical output |
| T5 | Crash after saving the intent, and after signing: the intent is on flash, and the board rebuilds the identical transaction |
| T6 | **Three real power pulls**, while the board was signing: at leaf 15, leaf 15 and leaf 6. Each time the intent was already on flash, the board resent the identical transaction twice, then signed the next report normally. (Rounds 1 and 2 landed at the same point, so they are two samples of one moment, not two different moments) |
| T7 | All 8 rows of the reboot and nonce table behave as specified, with injected nonces |
| T8 | Leaf 255 signs, byte-identical to TypeScript; the next request gets `KEYS_EXHAUSTED` |
| T9 | **Three transactions built and signed entirely by the board were admitted by the sidecar and mined, four frames each. The laptop only forwarded bytes.** Report 2's `INSPECT` set the hold on the ledger |

**A bug the tests found:** a state reset restarted the sequence counter at 0, so after a reboot an older, higher-numbered state slot won. Fixed, with a regression test.

**Design as built:** the key-safety state is two alternating checksummed files, so power loss during a write leaves the other intact. The state is tied to the key's root, so a new key starts a fresh counter.

**Why:** so far the laptop builds the digest. If the laptop kept that job, a compromised laptop could get the device to sign anything. The device must build what it signs, and it must never misuse a one-time key, even if power fails at the worst moment.

**What gets built**

| File | Purpose |
|---|---|
| `firmware/mohar/src/rlp.*` | Minimal RLP encoder |
| `firmware/mohar/src/frametx.*` | Builds the report transaction, digest, raw bytes and JSON |
| `firmware/mohar/src/intent.*` | Saved intent and leaf counter |
| `firmware/vectors/tx.json` | Expected digest, raw bytes and JSON for each test case |

**How it must behave**

1. **Identical output:** for the same inputs, digest, raw bytes and JSON match the `@forshtat/hegota-support` library exactly.
2. **Step guard:** count verifier steps before signing. Above 630, increase `salt` and rebuild. No signature is made until a digest qualifies.
3. **Intent first:** the leaf counter and every field affecting the digest are saved to flash, and flash is written safely with a temporary file and rename, **before** the signature exists.
4. **One leaf, one message:** a request to sign different content with a used leaf is refused with `LEAF_USED`. The same content is allowed, and produces identical bytes.
5. **After a reboot:**

   | Saved state | On-chain nonce | Action |
   |---|---|---|
   | No intent | Any | Start normally |
   | Intent at nonce N | N | Rebuild and resend the **identical** transaction |
   | Intent at nonce N | Above N | Mark done, move on |
   | Intent at nonce N | Below N | **Refuse to sign.** The chain was reset, or the RPC is wrong |

6. **Nonce rules for new reports:**
   - Chain nonce equals the local next leaf + 1: proceed.
   - Chain nonce is higher: jump forward, and log it.
   - Chain nonce is lower: **refuse to sign.** Otherwise a lying RPC could trick the device into reusing keys.
7. **Exhaustion:** after leaf 255, signing stops with `KEYS_EXHAUSTED`.

**Tests**

| ID | Pass only if |
|---|---|
| DEV5-T1 | 30 vectors match on digest, raw bytes and JSON. They include nonces 1, 2, 127, 128, 129, 255 and 256, `requestId` lengths 0, 16, 36 and 64, and varied fees. Those nonces cross RLP's length boundaries |
| DEV5-T2 | A report whose first digest exceeds 630 steps ends with a higher salt and a digest at or below 630, and no signature is produced for the rejected digest |
| DEV5-T3 | Different content at a used leaf gets `LEAF_USED` |
| DEV5-T4 | Same content at a used leaf gives byte-identical output |
| DEV5-T5 | Development crash points, one after each of saving the intent, signing and sending: after restart the device resends the identical transaction |
| DEV5-T6 | **Manual power pull** during a report, three times: the device recovers each time with identical bytes or moves on correctly |
| DEV5-T7 | Each row of the reboot table and each nonce rule behaves as stated, using injected nonces |
| DEV5-T8 | With the counter set to 255, one more signature works, and the next gets `KEYS_EXHAUSTED` |
| DEV5-T9 | The board builds and signs a transaction by itself, the laptop forwards it to the local chain, and it's mined with status `0x1`, all frames succeeding |

**If it fails:** RLP or JSON mismatches get fixed against the vectors. Don't weaken any key-safety rule to make a test pass.

---

## DEV-6: Firmware networking

**Status:** Not started · **Target:** Fri 16:00 · **Depends on:** DEV-5 · **Needs from you:** nothing (Wi-Fi details received Fri 08:20)

**Why:** this is the biggest hardware unknown. The chip has about 51 KB free before Wi-Fi, TLS needs a large buffer, and the devnet is HTTPS only.

**What gets built**

| File | Purpose |
|---|---|
| `firmware/mohar/src/net.*` | Wi-Fi, TLS 1.2, HTTP, JSON-RPC |
| `firmware/mohar/src/secrets.example.h` | Template; your real `secrets.h` is git-ignored |
| `devnet/up.sh --lan` | Exposes the local RPC to the Wi-Fi network, for testing only. The Engine API stays on localhost |

**Networks:** the ESP joins your 2.4 GHz hotspot. The laptop is on `ETHGlobal`, a different network, so the ESP can't reach the laptop's local chain over Wi-Fi until the laptop joins the hotspot too. Until then, local-chain tests forward signed bytes over USB (DEV5-T9), and Wi-Fi tests use public endpoints only.

**How it must behave**

1. Connects to Wi-Fi in under 30 seconds, and reconnects by itself after a drop.
2. Opens TLS 1.2 to the gateway with one connection at a time, assuming a 16 KB receive buffer.
3. Checks `eth_chainId` is `0x539` and refuses to continue otherwise.
4. Reads `eth_getTransactionCount` and `eth_call` for ledger status.
5. Sends the signed transaction by **streaming**, so the JSON is never fully in memory. The body is about 6 KB.
6. Reads the transaction hash or the error, and checks the hash against its own calculation.
7. Polls the receipt, and records success or failure of each frame.
8. Network errors never crash it. Every call has a timeout.

**TLS certificate checks:** the first version doesn't verify the server's certificate. The transaction is signed, so a network attacker can't alter it, but **reads could be spoofed.** We'll pin the certificate if the board can handle it. If not, it's a listed limit.

**Tests**

| ID | Pass only if |
|---|---|
| DEV6-T1 | Connects to Wi-Fi, and prints the IP address and free heap |
| DEV6-T2 | HTTPS read from the **public** gateway returns chain ID `0x539`. Handshake time and lowest heap are recorded |
| DEV6-T3 | 50 consecutive public reads with no reset and no heap failure. The heap low point stays above 2,000 bytes |
| DEV6-T4 | Device submits its signed report to the **local** chain over the LAN, and it's mined with all frames succeeding |
| DEV6-T5 | The body bytes the device sends parse to the same JSON as the library's `toWire` output |
| DEV6-T6 | While turning the Wi-Fi off and on, the device reports errors, reconnects and continues with no reset |
| DEV6-T7 | A 30-minute soak with reads and reports: no resets, and the heap doesn't keep falling |

**If it fails:** see the kill rule in section 5. Reduce memory first: fixed buffers, smaller JSON handling, and fewer libraries. Only then use the laptop relay.

---

## DEV-7: Meter signal acquisition and device behaviour

**Status:** Pico simulator ✅. ESP pulse counting ✅ on real hardware: T1, T2, T3, T4 and T13 passed Fri ~09:40. **Open:** T5 (unplug the wire), and T6 to T12, which need windows, modes, LEDs and checkpoint reports built into the firmware. · **Needs from you:** nothing now · **Target:** Fri 18:00 · **Depends on:** DEV-5 for reports; counting can start now · **Needs from you:** the two wires below

**Why:** this makes it a real metering device. Real pulses are generated, counted and reported, and the device's state visibly follows the ledger and its own checks. **No servo:** it isn't needed, and it caused power-supply problems.

### Wiring

| Pico H | NodeMCU ESP8266 | Note |
|---|---|---|
| GP0 (physical pin 1) | D6 (GPIO12) | The pulse line. Both boards are 3.3 V logic |
| GND (physical pin 3) | GND | Required |

Both boards stay powered over USB. The Pico only ever **pulls the line low or releases it**, like a real meter's open-collector (S0) output, and the ESP8266's internal pull-up holds it high. So the Pico never drives the line high, and neither board can back-power the other through it. GPIO12 isn't a boot-strapping pin, so the line can't stop the ESP8266 from booting.

### The meter simulator (Pico, built)

[firmware/pico-meter/code.py](firmware/pico-meter/code.py) on the Pico's existing CircuitPython 10.0.3. The firmware and boot ROM weren't touched.

| Property | Value |
|---|---|
| Meter constant | 3,200 pulses per kWh, so one pulse is 0.3125 Wh |
| Pulse | Line low for 30 ms; the onboard LED lights with it |
| Interval jitter | ±3 %, so the load looks real |
| Output | One JSON line every 2 seconds on the USB console, prefixed `METER ` |

| Key | Scenario | Load | What it represents |
|---|---|---:|---|
| `i` | idle | 60 W | Standby |
| `n` | normal (the default) | 900 W | A household |
| `h` | heavy | 3,000 W | Geyser or AC |
| `s` | surge | 12,000 W | Far above a typical 5 kW sanctioned load |
| `g` | glitch | 900 W plus 2 ms spikes every 1 to 2.5 s | Interference or tampering on the pulse line |
| `x` | off | none | Supply cut, or the meter goes dark |
| `a` | automatic cycle | normal, heavy, normal, glitch, normal, surge, off | Hands-free demo |

### Pulse counting (ESP8266, to build)

| File | Purpose |
|---|---|
| `firmware/mohar/src/meter.*` | Interrupt-driven counting and pulse-width checks |
| `firmware/mohar/src/machine.*` | Mode logic and the status LED |

1. GPIO12 is `INPUT_PULLUP`, with an interrupt on both edges. The interrupt only records times and counts, with no allocation and no serial output.
2. **Pulse classes, by how long the line stayed low:**

   | Width | Class | Counted as energy? |
   |---|---|---|
   | Under 15 ms | Glitch | No. Counted separately |
   | 15 to 200 ms | Valid pulse | Yes |
   | Over 200 ms | Stuck low | No. Counted separately |

3. **Power estimate:** `W = 1,125,000 / interval_ms` between valid pulses, from 3,600 s/h × 1,000 W/kW ÷ 3,200 pulses/kWh. Averaged over the window.
4. **Window statistics,** packed into the report's `sensors` word: valid pulses, glitches, stuck-low events, average and peak watts, window length, and the longest gap between pulses. The exact layout gets frozen in this phase and written into mechanism.md.
5. **Deterministic checks, no network needed:**

   | Check | Result |
   |---|---|
   | Peak above 13,800 W (60 A at 230 V, beyond what the meter can measure) | `INSPECT` immediately |
   | 3 or more glitches in a window | `INSPECT` immediately |
   | Anything else unusual (above the sanctioned load, a sudden silence, odd timing) | Asked of 0G in 0G-3. Until then it counts as `RUN` |

### Device states (no physical positions)

| Mode | Trigger | Status LED (D4, GPIO2) | How to leave |
|---|---|---|---|
| `RUN` | Credit covers a pulse, no hold, checks pass, valid run decision | One short blink every 2 s | |
| `INSPECT` | A local check fails, or a valid inspect decision | Two quick blinks every 2 s | Operator clears the hold on-chain, then a fresh `RUN` decision |
| `CREDIT_STOP` | The ledger says credit can't cover one more pulse | Slow on and off, 1 s each | Top-up |
| `SAFE_STOP` | No valid decision in time, chain unreachable, line dead while pulses were expected, or keys used up | Solid on | Service returns, then a fresh valid decision |

The second LED (D0, GPIO16) flashes once for each valid pulse counted, so the two boards' LEDs flash together.

1. **Order when several apply:** `SAFE_STOP`, `INSPECT`, `CREDIT_STOP`, `RUN`. The device can add caution to `ledgerMode()`, never remove it.
2. **At boot** the device shows `SAFE_STOP` until its first full check passes.
3. Each checkpoint (60 seconds, 20 seconds in the demo) takes the window statistics, reads the ledger, decides, sets the LED, then saves intent, signs and reports.
4. **Counting never stops,** in any mode: the meter keeps measuring, and the ledger keeps charging or recording arrears.
5. **In this phase,** decisions come from a development-only injection command. 0G replaces it in 0G-3, and release builds don't contain it.

### Tests

| ID | Scenario | Pass only if |
|---|---|---|
| DEV7-T1 | Pico `r`, then 5 minutes of normal load | The ESP's valid count equals the Pico's count exactly |
| DEV7-T2 | Pico surge for 30 s, about 10.7 pulses per second | Still no missed pulses; counts equal |
| DEV7-T3 | Pico glitch for 30 s | Glitches counted separately and **not charged**; `INSPECT` immediately, without network |
| DEV7-T4 | Pico off for 60 s | Zero pulses; no false counts from a floating line |
| DEV7-T5 | Unplug the pulse wire mid-run | No counts while unplugged; the line reads high |
| DEV7-T6 | Normal load, credit, injected run | LED shows `RUN`; `RUN` report mined; ledger `lastTotal` equals the ESP's count |
| DEV7-T7 | Injected inspect | LED shows `INSPECT`; hold set on-chain |
| DEV7-T8 | After T7, inject run | **Still `INSPECT`.** AI can't clear a hold |
| DEV7-T9 | Operator clears the hold, then run | `RUN` |
| DEV7-T10 | Heavy load until credit runs out | `CREDIT_STOP` within one checkpoint; arrears grow on the ledger; counting continues |
| DEV7-T11 | Top-up from a script | Arrears paid first; `RUN` within one checkpoint |
| DEV7-T12 | Counting while Wi-Fi and TLS are busy for 10 minutes | Counts still equal the Pico's; no resets |
| DEV7-T13 | Power estimate at 900, 3,000 and 12,000 W | Within 5 % of the Pico's setting |

**Manual test you can do:** watch both boards' LEDs flash together, and compare the ESP's count with the Pico's `METER` lines and the ledger's `lastTotal`.

**If it fails:** if pulses are missed, lengthen the pulse or check the interrupt code isn't in flash (it must be `IRAM_ATTR`). If the line picks up noise when the Pico is off, that's the floating-line case; the pull-up should prevent it.

---

## DEV-8: Dashboard

**Status:** Not started · **Target:** Fri 19:00 · **Depends on:** DEV-3, ENS-2 · **Needs from you:** hosting choice in REL-2

**Why:** ENS and 0G both require a live demo link, and judges need to see state without a terminal.

**What gets built:** a static site in `dashboard/` with **no backend** and no trackers.

**How it must behave**

1. **Starts from a name.** It resolves `meter-001.<fleet>.eth` through the Universal Resolver, and finds the account, ledger and paymaster from ENS records. **The only configured values are RPC URLs.**
2. **Cross-checks identity.** It compares `mohar.pq.root` from ENS with `root()` on the account, and shows a clear warning if they differ.
3. **Shows state:** mode, credit, arrears, hold, quota, the last reports, and each frame's result.
4. **Shows the meter:**
   - **Pulse count:** the ledger's `lastTotal`, updated at each report.
   - **Live pulses between reports:** optional. In Chrome, the page can read the ESP8266's USB serial directly with the Web Serial API, with no backend. It's labelled as a local view, not chain data.
   - **Consumption estimate:** kWh (pulses ÷ 3,200) and average watts per window, decoded from the report's `sensors` word.
   - **Anomaly status:** glitches, stuck-low events and peak watts from `sensors`, plus the mode, reason code, 0G request ID and confidence of the latest report.
5. **Shows the log:** the latest 0G root from `mohar.log`, once 0G-4 exists.
6. **Actions through a wallet:** top up, clear hold, and edit an ENS record.
7. **Fails clearly.** An unknown name, an unreachable RPC or a wrong chain each shows its own message.
8. **Never claims disconnection.** `CREDIT_STOP` is shown as "credit exhausted, usage accruing as arrears".

**Tests**

| ID | Pass only if |
|---|---|
| DEV8-T1 | The site loads and shows correct data from a name alone. Searching the code finds no account, ledger or paymaster address |
| DEV8-T2 | Displayed credit, hold and quota equal direct `eth_call` results |
| DEV8-T3 | Changing `mohar.pq.root` makes the warning appear |
| DEV8-T4 | Top up and clear hold work, and the state updates |
| DEV8-T5 | An unknown name and a dead RPC each show the right error |
| DEV8-T6 | The browser's network tab shows only RPC traffic, with no trackers |
| DEV8-T7 | It's usable at phone width, at about 400 pixels |
| DEV8-T8 | kWh, average watts and anomaly fields equal values decoded independently from the latest `Report` event |
| DEV8-T9 | With the Web Serial view connected, the live count matches the ESP's serial output, and the page still works when it's not connected |

---

# Part B: Ethereum Foundation track

**Track:** Best use of the Frame Transaction Alternative Mempool. **Lane:** something only an alt mempool makes possible.

---

## EF-1: WOTS transaction on the public devnet

**Status:** Blocked: needs funds · **Target:** as soon as funded, **Fri 12:00 latest** · **Depends on:** DEV-2 · **Needs from you:** 0.2 ETH on the devnet

**Why:** this is the kill test on the real network, not just our copy of it.

**What gets built:** `signer/tools/public-deploy.ts`, `signer/tools/ef1.ts`, `docs/evidence/ef-1.md`.

**How it must behave**

1. Check the devnet is the expected one: chain 1337, client version recorded, and registry code still present.
2. Deploy the target and a self-paying account.
3. Send a WOTS-signed 2-frame transaction through `eth_sendFrameTransaction`, with a validation limit of 99,900 plus 100 intrinsic.
4. The node returns the hash we calculated ourselves, and it's mined.
5. **Settle the staked-budget question:** deploy a staked account and try a validation limit of 150,000. Record the verdict.

**Tests**

| ID | Pass only if |
|---|---|
| EF1-T1 | Status `0x1`, both frames succeed, on chain 1337 |
| EF1-T2 | The returned hash equals the locally computed one |
| EF1-T3 | The explorer shows it. The link and a screenshot are saved, because explorer history is in memory only |
| EF1-T4 | `skandha_frameTransactionStatus` reports `OnChain` or `Finalized` |
| EF1-T5 | The account's nonce rose by one |
| EF1-T6 | The verdict for a staked account at 150,000 gas is recorded. **Either result is acceptable, but [mechanism.md](mechanism.md) must then state it** |

**If it fails:** read the node's error. The likely causes are a fee floor or a devnet change. A design-level refusal triggers the kill rule.

---

## EF-2L: Alt mempool rules on a local sidecar

**Status:** ✅ Done Fri 08:55, all 7 tests passed. Evidence: [docs/evidence/ef-2-local-alt.json](docs/evidence/ef-2-local-alt.json) · **Needs from you:** nothing

| Test | Result |
|---|---|
| EF2L-T1 | Built from source at `2e22ff0`; running on `127.0.0.1:14337` |
| EF2L-T2 | Canonical path: `Frame transaction validation-prefix simulation failed: StorageReadNonSender` |
| EF2L-T3 | Same bytes admitted; hash equal to ours; block 1049, all four frames `0x1`, payer the paymaster, account balance 0, quota 10 → 9 |
| EF2L-T4 | Admission record saved: 24 rule checks, all `pass`, outcome `accepted` |
| EF2L-T5 | Unstaked paymaster: `unstaked payer accessed payer slot 0x…01` |
| EF2L-T6 | Replay: `Nonce mismatch`. Over quota and revoked: `validation frame 1: reverted`, at submission |
| EF2L-T7 | `MOHAR_NET=public`: same code reads chain 1337 from the public gateway |

**Why:** the real alt mempool's admission rules are what the EF track judges, and the public faucet is empty. Running the same sidecar code against our local chain tests those rules now. It doesn't replace EF-2: a local run isn't the public network.

**What gets built**

| File | Purpose |
|---|---|
| `devnet/sidecar.sh` | Builds the sidecar from its source at a pinned commit and runs it against the local chain |
| `signer/src/devnet.ts` | A third network, `MOHAR_NET=local-alt`: local chain, submitted through the local sidecar |
| `signer/tools/ef2.ts` | The EF-2 script. It runs unchanged on `local-alt` and `public` |

**Switching networks** is one variable, with no code change:

| `MOHAR_NET` | Chain | Submission | Proves |
|---|---|---|---|
| `local` | Our ethrex | Privileged route that skips mempool rules | Execution only |
| `local-alt` | Our ethrex | Our local sidecar: `eth_sendFrameTransaction` | Execution and the sidecar's rules, on our copy |
| `public` | EF devnet | The public gateway | Everything, for real |

**Sepolia isn't on this list.** Frame transactions exist only on the EF devnet. ENS uses Sepolia separately, through its own RPC setting.

**Tests**

| ID | Pass only if |
|---|---|
| EF2L-T1 | The sidecar builds from source and starts against the local chain |
| EF2L-T2 | The canonical path refuses our report with `StorageReadNonSender` |
| EF2L-T3 | The sidecar admits **the same bytes**, the hashes match, and it's mined with all four frames succeeding |
| EF2L-T4 | The sidecar's rule-by-rule report is saved |
| EF2L-T5 | An **unstaked** paymaster is refused, and the refusal is recorded |
| EF2L-T6 | Replay, over-quota and revoked-device transactions are refused, and where each is refused is recorded |
| EF2L-T7 | Switching to `MOHAR_NET=public` needs no code change; checked by a read-only call |

**If it fails:** if it won't build or run, record why and fall back to EF-2 on funds. If our transaction is refused, record the exact rule, since it'll also fail publicly.

---

## EF-2: The alt mempool proof

**Status:** Blocked: needs funds · **Target:** Fri 13:00 · **Depends on:** EF-1, DEV-3 · **Needs from you:** nothing further

**Why:** this is the centrepiece for EF judges: the same signed bytes, refused by the public path and admitted by the alt mempool, with the real reasons shown.

**What gets built:** `signer/tools/ef2.ts`, `docs/evidence/ef-2.md`.

**How it must behave**

1. Deploy the ledger, a staked account and a staked paymaster, and set a policy.
2. Sign **one** report.
3. Send it through `eth_sendRawTransaction`: expect refusal with `StorageReadNonSender`.
4. Send **the same bytes** through `eth_sendFrameTransaction`: expect a hash.
5. Save the node's rule-by-rule admission report from `skandha_explorer_getTransaction`.
6. Wait for mining, and record every frame's result.

**Protect reputation.** The sidecar tracks reputation, and bans are possible. **Rule-breaking tests use separate throwaway contracts,** so the demo paymaster stays clean.

**Tests**

| ID | Pass only if |
|---|---|
| EF2-T1 | Public path refuses with the storage violation |
| EF2-T2 | Alt path admits the same bytes, and the hashes match |
| EF2-T3 | Admission report shows the passed checks, including storage, and it's saved |
| EF2-T4 | Mined, all four frames succeed, and the account paid nothing |
| EF2-T5 | Quota fell by exactly one |
| EF2-T6 | Over-quota report is refused. **Record where:** we expect rejection at submission, from simulation, not after admission. State only what actually happens |
| EF2-T7 | The same transaction through an **unstaked** paymaster is refused, expected as `unstaked payer accessed …`. This shows why staking is needed. If it's admitted instead, the staking claim has to change |
| EF2-T8 | A replay is refused |
| EF2-T9 | A revoked device is refused |

**Evidence:** every hash, verdict and link goes in `docs/evidence/ef-2.md`. Explorer history can vanish on restart.

**If it fails:** see the kill rule in section 5.

---

## EF-3: Device-signed transaction with the laptop off

**Status:** Not started · **Target:** Fri 15:00 · **Depends on:** EF-2, DEV-6 · **Needs from you:** phone hotspot, USB power

**Why:** this is the claim that makes Mohar different: no backend and no relayer.

**How it must behave**

1. The board runs from a USB charger or power bank, on a phone hotspot.
2. **The laptop is off,** or unplugged and disconnected from the network.
3. The board builds, signs and submits reports through the alt mempool by itself.

**Tests**

| ID | Pass only if |
|---|---|
| EF3-T1 | With the laptop off, 3 consecutive reports are mined, confirmed from a phone browser on the explorer |
| EF3-T2 | Each has all four frames successful, and the leaf and nonce advance by one |
| EF3-T3 | The account's balance stays zero, and quota falls by 3 |
| EF3-T4 | Power pull mid-run, then restart: the device recovers with no key misuse, and continues |
| EF3-T5 | A video clip of the whole thing is recorded and saved |

**Claim to use:** "No application backend, no custodial signer, no relayer." The device still depends on Wi-Fi, an RPC endpoint and the mempool node.

---

# Part C: ENS track

**Track:** Best Use of ENSv2. **Network:** Sepolia. **Rule:** ENS must be central, with a live demo and no hard-coded values.

**Boundary:** ENS permissions control ENS records only. They don't control devnet contracts, and we never claim they do. The two chains are linked by clients reading both.

---

## ENS-1: Fleet name and registry

**Status:** Blocked: needs Sepolia ETH · **Target:** Fri 14:00 · **Depends on:** nothing · **Needs from you:** 0.05 Sepolia ETH

**What gets built:** `ens/config.ts`, `ens/01-register.ts`, `docs/evidence/ens-1.md`.

**How it must behave**

1. **Check the deployment first:** confirm `ROOT_REGISTRY()` on the `0xeEeE…` proxy equals the `RootRegistry` we expect. Sepolia has been redeployed before, so stop if it's changed.
2. Check `isAvailable("mohar")`. If it's taken, use `moharfleet`.
3. Mint test USDC, then approve the registrar for the exact price.
4. `commit`, wait **over 60 seconds**, then `register` for one year. The minimum duration is 28 days.
5. Deploy a `UserRegistry` for the fleet through `VerifiableFactory`, with the roles needed to issue subnames.
6. Attach it with `setSubregistry`.

**Tests**

| ID | Pass only if |
|---|---|
| ENS1-T1 | `isAvailable` is now false, and the token owner is our key |
| ENS1-T2 | The parent's subregistry equals our deployed registry |
| ENS1-T3 | The name resolves through the Universal Resolver |
| ENS1-T4 | Registrations before 60 seconds fail, or the script correctly waits |
| ENS1-T5 | Transaction hashes are saved |

**If it fails:** read the role constants from the `contracts-v2` source at the commit the docs reference. The docs confirm only some numeric values.

---

## ENS-2: Machine identity and permissions

**Status:** Not started · **Target:** Fri 16:00 · **Depends on:** ENS-1, DEV-3 · **Needs from you:** nothing further

**Why:** this is the core of the ENS track. Each party can edit only its own records, which is the multi-party problem Mohar is about.

**What gets built:** `ens/02-machine.ts`, `docs/evidence/ens-2.md`, and role keys in `.secrets/`.

**How it must behave**

1. Deploy a **separate Permissioned Resolver for each machine**. Role grants cover a whole resolver instance, so sharing one would let a writer edit every machine.
2. Register `meter-001` in the fleet registry, with an expiry as its lease. Don't grant transfer rights, so a meter's name can't be moved to another device or owner.
3. Set these records:

| Record | Editable by | Used by |
|---|---|---|
| ETH address for coin type `0x80000539` (ENSIP-11, chain 1337) | Owner | Dashboard: finds the account |
| `mohar.chainId`, `mohar.ledger`, `mohar.paymaster` | Owner | Dashboard |
| `mohar.pq.scheme`, `mohar.pq.root`, `mohar.pq.pubSeed` | Owner | Dashboard: cross-check |
| `mohar.policy` | **Owner only** | The AI's operating policy |
| `mohar.deviceType` (`electricity-meter`), `mohar.capabilities` (`pulse-3200-imp-kwh`), `mohar.tariff` | Owner | Fleet view |
| `mohar.operator` | Owner | Shows who operates it |
| `mohar.maintenance.status` | **Maintenance key only** | Dashboard |
| `mohar.log` | **Uploader key only** | Latest 0G root |
| `agent-context`, `agent-endpoint[web]` | Owner | ENSIP-26 discovery |

4. Grant key-scoped roles with `grantSetterRoles(setter, account)`.
5. Records contain public identity only. **Never keys, personal data or telemetry.**

**Tests**

| ID | Pass only if |
|---|---|
| ENS2-T1 | All records read back correctly through the Universal Resolver |
| ENS2-T2 | The maintenance key edits `mohar.maintenance.status`: success |
| ENS2-T3 | The maintenance key edits `mohar.pq.root`: reverts, expected as `EACUnauthorizedAccountRoles` |
| ENS2-T4 | The uploader key edits `mohar.log`: success. Editing `mohar.policy`: reverts |
| ENS2-T5 | A second machine's resolver refuses the first machine's maintenance key |
| ENS2-T6 | Transferring `meter-001` reverts, expected as `TransferDisallowed`. If it's allowed, stop claiming non-transferable |
| ENS2-T7 | A short-lived test subname: record what happens after expiry. **Only claim what we observe** |
| ENS2-T8 | The owner can `unregister` a test subname |

---

## ENS-3: Discovery and permission demo

**Status:** Not started · **Target:** Fri 20:00 · **Depends on:** ENS-2, DEV-8 · **Needs from you:** nothing further

**How it must behave**

1. Entering the name in the dashboard finds the whole machine, using no other input.
2. The demo shows one allowed edit and one rejected edit, live, with the reason visible.
3. Changing `mohar.maintenance.status` appears on the dashboard.

**Tests**

| ID | Pass only if |
|---|---|
| ENS3-T1 | From a clean browser, the name alone leads to live machine data |
| ENS3-T2 | The rejected edit shows the contract's real error, not a canned message |
| ENS3-T3 | The maintenance update appears without a code change |
| ENS3-T4 | The `agent-context` record resolves and describes the machine |
| ENS3-T5 | The code is open source, and no account address is hard-coded |

---

## ENS-4: The device reads its policy from ENS

**Status:** Optional · **Target:** Fri 22:00 · **Depends on:** ENS-2, DEV-6

**Why:** it's the strongest ENS link: only the owner can change what the machine's AI is told. It's optional, because ENS-3 already meets the track.

**How it must behave**

1. The device calls the Universal Resolver on Sepolia over HTTPS for `mohar.policy`.
2. It caches the value in flash, with a timestamp.
3. If the read fails, it uses the cached policy for a limited time, then goes to `SAFE_STOP`.
4. Without this phase, the device uses a provisioned policy, and the dashboard shows the ENS value.

**Tests**

| ID | Pass only if |
|---|---|
| ENS4-T1 | The device prints the exact policy from ENS |
| ENS4-T2 | Changing the record changes the device's next prompt, with no firmware update |
| ENS4-T3 | Removing internet access: the cached policy is used, then `SAFE_STOP` after the limit |
| ENS4-T4 | No crash or memory failure when combined with the other TLS calls |

---

# Part D: 0G track

**Track:** Physical AI: Agents with a Body. **Lane:** robots and machines, on real hardware.

**Required by the track:**
- A 0G call inside the decision loop.
- An episode log on 0G Storage, with a request ID per decision.
- A live hardware demo at the 0G booth, or a replayable simulation. We'll do both.
- A safe stop if 0G is unreachable. **A fallback that fakes a decision disqualifies.**

---

## 0G-1: Choose and test the decision model

**Status:** ✅ T1 to T5 passed Fri ~09:45 with `qwen3.8-flash`. **T6 (`verify_tee`), T7 (error codes) and T8 (freeze the request format) are still open.** · **Needs from you:** nothing now

**Result:** `laya` and `vela-2.0-9b` failed. `qwen3.8-flash` with `enable_thinking: false` passed 19 of 19 scenarios at 5 of 5 runs, p95 latency 1.2 s, no timeouts, request IDs matching 95 of 95. Evidence in `docs/evidence/0g-1-*.json`; details and caveats in [mechanism.md](mechanism.md) section 7b.

**Why:** we don't yet know that a model can judge these readings reliably. Find out before building firmware around it.

**What gets built**

| File | Purpose |
|---|---|
| `firmware/sim/scenarios.json` | Labelled meter windows: normal, heavy, above sanctioned load, glitching line, sudden silence after load, and borderline cases. Each is the window statistics the ESP will send |
| `signer/tools/0g-eval.ts` | Runs them through each candidate, and scores the results |
| `firmware/vectors/0g/` | Saved real responses, for firmware parser tests |
| `docs/evidence/0g-1.md` | Results and the decision |

**Candidates**

| Model | Why try it | Caveat |
|---|---|---|
| `laya` through `POST /v1/decisions` | A dedicated decision model, listed at zero cost and TEE-attested, returning typed answers with probabilities. Small responses suit the ESP | **Untested.** It may not reason well about numbers, and its input is limited to 512 tokens for English |
| `0gm-1.0-35b-a3b` through `/v1/chat/completions` | 0G's own model, TEE-attested, supports JSON mode | Thinking is on by default, so it may be slow and verbose |

**Endpoint:** `https://router-api.0g.ai/v1`. The testnet router (`router-api-testnet.integratenetwork.work`) did not negotiate TLS 1.2 when checked, so the device uses mainnet.

**Request format (from the 0G docs):** `POST /v1/decisions` with `{"model":"laya","state":"<text>","questions":{"inspect":{"type":"noul","instructions":"…","criteria":{"true":"…","false":"…"}}}}`. The answer is `answers.inspect.noul`, the probability that the answer is true, and `x_0g_trace.request_id`. **`laya` is listed at price 0 and "a request for a model priced at zero skips the balance gate"** (router docs), so it may need only a key, not a deposit. Its input limit is 512 tokens. `vela-2.0-9b` is the paid alternative (about $0.00000004 per 1M input tokens, 16,384 tokens).

**Ready to run:** `signer/tools/0g-eval.ts` reads the key from `.secrets/0g-api.key`, runs the 14 labelled scenarios in `firmware/sim/scenarios.json` (7 run, 7 inspect, with borderline cases) 10 times each, and prints each test's result. Run: `node signer/tools/0g-eval.ts laya 10 0.5`.

**How it must behave**

1. The response gives an action, a confidence and a reason, from a fixed list.
2. The real request ID is read from the response.
3. Anything other than a clear, valid run decision is treated as not running. The AI **only ever makes the machine more cautious.**

**Tests**

| ID | Pass only if |
|---|---|
| 0G1-T1 | A successful call with the real key, with the model, request ID and cost recorded |
| 0G1-T2 | `x_0g_trace.request_id` matches the `X-Request-ID` header |
| 0G1-T3 | Each scenario, run 10 times: at least 9 of 10 correct per class |
| 0G1-T4 | 95th percentile latency at or under 15 seconds |
| 0G1-T5 | Whole response, headers included, at or under 8 KB |
| 0G1-T6 | `verify_tee: true` is tried, and `tee_verified` is recorded |
| 0G1-T7 | Errors 401, 402, 429, 502 and 503 are each handled, or documented if they can't be triggered |
| 0G1-T8 | The chosen model and exact request format are written down and frozen |

**If it fails:** improve the prompt or use another catalogue model. If no model reaches 9 of 10, say so. **Don't demo a decision model that's guessing.**

---

## 0G-2: The device calls 0G

**Status:** Not started · **Target:** Fri 21:00 · **Depends on:** 0G-1, DEV-6 · **Needs from you:** nothing further

**What gets built:** `firmware/mohar/src/zerog.*`. The API key goes in the ignored `secrets.h`, and should be a low-limit key, since flash is readable.

**How it must behave**

1. The board opens TLS to `router-api.0g.ai`, sends a small request and reads the response as a stream.
2. It extracts only the action, confidence, reason and request ID.
3. It enforces the allowlist. **No model text ever reaches GPIO.**
4. Malformed, oversized, or late answers all count as no decision.

**Tests**

| ID | Pass only if |
|---|---|
| 0G2-T1 | A real call from the board returns a decision and a request ID that appears in our 0G usage |
| 0G2-T2 | 20 consecutive calls with no reset, and the heap low point above 2,000 bytes |
| 0G2-T3 | Saved real responses and a malformed set are fed through the parser: valid ones parse, and **every bad one gives no decision** |
| 0G2-T4 | The same scenario gives the same class from the board and the laptop |
| 0G2-T5 | Blocking internet access leads to a timeout at the configured limit, with no crash |

**Fallback:** a laptop bridge relays only the inference call. The device still validates and signs. Disclose it, and turning the laptop off then becomes the safe-stop demo.

---

## 0G-3: Decision loop and safe stop

**Status:** Not started · **Target:** Fri 23:30 · **Depends on:** 0G-2, DEV-7 · **Needs from you:** nothing further

**Why:** this is what qualifies for the track: a real 0G decision changes what a real device does. Here that's the device's operating state, shown on its status LED and recorded on-chain.

**How it must behave**

1. Each checkpoint: take the window's pulse statistics → read the ledger → run the deterministic checks → ask 0G about anything the checks don't settle → validate the answer → choose the mode → **set the device state and LED** → save intent → sign → submit the report, including the request ID.
2. Development injection is gone from release builds.
3. **If 0G fails, there is no decision.** The device goes to `SAFE_STOP` (LED solid on), and a `SAFE_STOP` report goes out with an empty `requestId` and a reason code. Counting continues.
4. Only a fresh, valid decision can leave `SAFE_STOP`.
5. 0G only ever adds caution. It can't clear a hold, override `CREDIT_STOP`, or stop pulses being counted and charged.

**Tests**

| ID | Scenario | Pass only if |
|---|---|---|
| 0G3-T1 | Pico normal | 0G says run; LED shows `RUN`; `RUN` report on-chain with the real request ID |
| 0G3-T2 | Pico surge: above the sanctioned load, below the meter's limit, so no local check fires | **0G says inspect, and the LED changes to `INSPECT`.** Hold set on-chain |
| 0G3-T3 | After T2, back to normal | 0G says run, but the device stays `INSPECT` until the operator clears the hold |
| 0G3-T4 | Block 0G's address | `SAFE_STOP` within the timeout; LED solid; `requestId` empty; pulses still counted |
| 0G3-T5 | Restore access | Leaves `SAFE_STOP` only after a fresh valid decision |
| 0G3-T6 | Credit zero, 0G says run | Stays `CREDIT_STOP`: AI can't override credit |
| 0G3-T7 | Inspect release firmware and logs | No code path invents a decision |
| 0G3-T8 | 30-minute run | No resets; all reports mined; counts still match the Pico |
| 0G3-T9 | Key count | Reports stay within 256 leaves across the demo and practice; a fresh key is planned before the demo |

**If it fails:** kill rule in section 5.

---

## 0G-4: Episode log and replay

**Status:** Not started · **Target:** Sat 02:00 · **Depends on:** 0G-3 · **Needs from you:** Galileo testnet tokens

**What gets built:** `uploader/` in TypeScript with `@0gfoundation/0g-storage-ts-sdk`, and `uploader/replay.ts`.

**How it must behave**

1. The uploader reads `Report` events from the devnet and builds one JSON record per decision.
2. It uploads batches to 0G Storage. The endpoints are `https://evmrpc-testnet.0g.ai` (chain `0x40da`, reachable when checked) and `https://indexer-storage-testnet-turbo.0g.ai`.
3. It writes the newest root to ENS `mohar.log`, using its key-scoped role.
4. **Anyone can rebuild the log from the chain.** The uploader holds no device keys, and if it dies, logging catches up when it returns.
5. `replay.ts` downloads a root, verifies it, compares each record with the chain and prints the timeline.

**Record format**

```json
{
  "device": "meter-001.<fleet>.eth",
  "seq": 12, "tx": "0x…", "timestamp": 0,
  "request_id": "…", "model": "…",
  "meter": { "simulated": true, "total_pulses": 4210, "window_pulses": 49, "avg_watts": 920, "peak_watts": 1010, "glitches": 0 },
  "decision": { "action": "inspect", "confidence": 91, "reason": "above_sanctioned_load" },
  "selected_mode": "INSPECT",
  "device_state": "INSPECT"
}
```

`device_state` is the state the device entered and showed on its LED. Nothing physical is switched.

**Tests**

| ID | Pass only if |
|---|---|
| 0G4-T1 | An upload returns a root hash, and downloading it with proof verification matches byte for byte |
| 0G4-T2 | Every decision record has a real request ID; `SAFE_STOP` records have `null` and are marked as not being decisions |
| 0G4-T3 | Replay matches the chain for every record |
| 0G4-T4 | Editing a downloaded record makes replay report a mismatch |
| 0G4-T5 | Stop the uploader during reports, then restart: nothing is lost |
| 0G4-T6 | `mohar.log` on ENS holds the latest root (if ENS-2 is done) |

---

# Part E: Release

---

## REL-1: Full rehearsal

**Status:** Not started · **Target:** Sat 04:30 · **Depends on:** all completed phases · **Needs from you:** the full hardware setup

**How it must behave:** the whole [demo story](#demo-story) runs start to finish on the public devnet, from a freshly flashed board with fresh keys. **The physical part is real:** the Pico generates pulses, the ESP counts them, and the reports carry the counts.

**Tests**

| ID | Pass only if |
|---|---|
| REL1-T1 | The demo script completes twice in a row without a manual fix |
| REL1-T2 | It takes 2:30 to 2:55 |
| REL1-T3 | **Devnet reset drill:** following the written steps, a new key and contracts are up in under 15 minutes |
| REL1-T4 | Every claim in the demo is backed by an item in `docs/evidence/` |
| REL1-T5 | Fallback video recorded, in case the live demo or network fails |
| REL1-T7 | During the run, the Pico's count, the ESP's count and the ledger's `lastTotal` agree at each report |
| REL1-T6 | Someone other than the builder can follow the README setup |

---

## REL-2: Submission

**Status:** Not started · **Target:** **Sat 08:00**, one hour before the deadline · **Needs from you:** GitHub repo, hosting, team contacts

**All tracks**
- [ ] Public GitHub repo, created by you, with the local commit history pushed
- [ ] Open-source `LICENSE` file
- [ ] New work clearly separated from reused work
- [ ] Where and how AI was used, documented
- [ ] Video of **2:00 to 2:55**
- [ ] **Finalist and Partner Prizes** selected

**EF: Alt Mempool**
- [ ] Admitted transaction link, and the code that submits one
- [ ] The rejection and admission evidence from EF-2
- [ ] Team can explain the design, code and trade-offs
- [ ] Budget finding stated: the docs' staked budgets didn't apply in our testing

**ENS: Best Use of ENSv2**
- [ ] Live demo link
- [ ] ENSv2 on Sepolia is central, with no hard-coded values
- [ ] Allowed and rejected edits shown

**0G: Physical AI**
- [ ] Project name and short description
- [ ] Public repo with setup instructions
- [ ] Video under 3 minutes, and a live demo link
- [ ] Contract addresses
- [ ] Team names, with Telegram and X
- [ ] Live hardware demo at the 0G booth, and the replay tool
- [ ] Simulated sensors disclosed

**Claims check:** read every claim against [mechanism.md](mechanism.md). Remove anything without evidence.

---

# Demo story

**"meter-001 signs for itself."** A prepaid electricity meter that holds its own post-quantum key, counts its own pulses, pays no gas, can be told to take care by an AI but never to relax, and leaves a record nobody has to trust a server for.

**Setting, in one line:** in Indian housing societies, shops and rentals, prepaid sub-meters are read through a vendor's server, and tenants, owners and maintenance staff each have reasons to doubt a reading. Mohar makes the meter itself the signer, and puts the shared record where all three can check it.

**On the table:** the Pico H (the meter's pulse output, its LED flashing per pulse), the NodeMCU (counting, deciding, signing; two LEDs), both on a two-port power bank, with the phone hotspot. A phone shows the dashboard. The laptop is closed for beat 3.

| Time | Beat | What the audience sees | What's real | Track |
|---|---|---|---|---|
| 0:00 to 0:15 | The problem | One sentence each: who reads the meter, who pays, who's trusted | | |
| 0:15 to 0:40 | **Identity** | Typing `meter-001.<fleet>.eth` on the phone finds the meter's account, ledger and paymaster. Its post-quantum root in ENS matches `root()` on the account | Live ENS on Sepolia, live devnet reads | ENS |
| 0:40 to 1:10 | **The meter signs for itself** | Pico and ESP LEDs flash together; the counts match. A report goes out: 2,400-byte hash-based signature, admitted by the alt mempool, four frames succeed, the meter's balance stays 0, quota falls by one, credit falls by the usage | Everything, with the laptop closed | EF |
| 1:10 to 1:35 | **AI adds caution** | `s` on the Pico: load above the sanctioned limit but within the meter's range, so no fixed rule fires. 0G judges it: inspect, with its request ID. The status LED changes to `INSPECT`; the hold appears on-chain | Real 0G call from the device | 0G |
| 1:35 to 2:00 | **Only people clear holds** | Back to normal: 0G says run, but the device stays `INSPECT`. The operator clears the hold, and the LED returns to `RUN`. The maintenance key updates `mohar.maintenance.status`, then is refused on `mohar.pq.root`, with the contract's real error | Ledger and ENS permissions | ENS, ledger |
| 2:00 to 2:20 | **Credit is recorded, not enforced** | `h` drains credit: `CREDIT_STOP`, arrears grow, counting continues. A phone top-up pays the arrears first, then `RUN` | Ledger | |
| 2:20 to 2:35 | **No fake decisions** | 0G is blocked: `SAFE_STOP` with an empty request ID, LED solid, pulses still counted. Unblocked: a fresh decision brings `RUN` back | Device rule | 0G |
| 2:35 to 2:55 | **The record** | Episode log on 0G Storage, its root in ENS `mohar.log`, replay matching the chain. Side by side: the canonical mempool refusing the same bytes the alt mempool admitted | 0G Storage, EF evidence | 0G, EF |

**Fallback for each beat:** a recorded clip of that beat (REL1-T5). **Glitch scenario:** `g` shows the deterministic check: `INSPECT` immediately, with no network. Use it if 0G is down during the demo, and say so.

**What we never say:** that the meter cuts power, that ENS controls the devnet, that the sensor reading is proven true, or that the cryptography is audited.

**Needed for this story, beyond the phases:** with no computer attached, the Pico should run its automatic cycle by itself. That's added in DEV-7.

---

# Appendix: what we won't do

| Temptation | Why not |
|---|---|
| Let AI decide credit or disconnection | Those stay deterministic |
| Claim that low credit disconnects the supply | Nothing switches power. The ledger records arrears |
| Bring back the servo | Not needed for the meter story, and it caused power-supply problems |
| Put telemetry in ENS | ENS is identity, plus one log pointer |
| Let 0G or ENS hold keys or sign | Breaks the core claim |
| Pass model text to GPIO | Allowlist only |
| Say ENS permissions control the devnet | They can't |
| Use the devnet's published genesis key | It's an operator key and the node's relayer |
| Call `debug_*` or privileged methods on the public devnet | They affect everyone |
| Add World ID or a token | No real need |
| Say "first" or "proven secure" | We can't back either |
