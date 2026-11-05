# Mohar: Development Plan

We build in phases, one at a time. Each phase below says exactly what gets built, how it must behave, and which tests prove it.

**Deadline:** Saturday, November 7, 2026, 9:00 AM IST
**Last updated:** Thursday, November 5, 2026, 23:58 IST
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
| 4 | [DEV-3](#dev-3-machine-ledger) | Machine ledger | Fri 01:00 | Next |
| 5 | [DEV-4](#dev-4-firmware-keys-and-signing) | Device keys and signing | Fri 03:00 | |
| 6 | [DEV-5](#dev-5-firmware-transactions-and-key-safety) | Device transactions, key safety | Fri 05:30 | |
| 7 | [DEV-6](#dev-6-firmware-networking) | Device Wi-Fi, TLS and RPC | Fri 09:00 | Needs Wi-Fi |
| 8 | [EF-1](#ef-1-wots-transaction-on-the-public-devnet) | WOTS transaction on the public devnet | **Fri 12:00 latest** | Needs funds |
| 9 | [0G-1](#0g-1-choose-and-test-the-decision-model) | Decision model chosen and tested | Fri 12:00 | Needs API key |
| 10 | [EF-2](#ef-2-the-alt-mempool-proof) | Alt mempool proof | Fri 13:00 | Needs funds |
| 11 | [ENS-1](#ens-1-fleet-name-and-registry) | Fleet name and registry | Fri 14:00 | Needs Sepolia ETH |
| 12 | [EF-3](#ef-3-device-signed-transaction-with-the-laptop-off) | Device-signed, laptop off | Fri 15:00 | |
| 13 | [ENS-2](#ens-2-machine-identity-and-permissions) | Machine identity and roles | Fri 16:00 | |
| 14 | [DEV-7](#dev-7-machine-behaviour) | Servo, sensors, operating modes | Fri 17:00 | Needs wiring |
| 15 | [DEV-8](#dev-8-dashboard) | Dashboard | Fri 19:00 | |
| 16 | [ENS-3](#ens-3-discovery-and-permission-demo) | Discovery and permission demo | Fri 20:00 | |
| 17 | [0G-2](#0g-2-the-device-calls-0g) | Device calls 0G | Fri 21:00 | |
| 18 | [ENS-4](#ens-4-the-device-reads-its-policy-from-ens) | Device reads ENS policy | Fri 22:00 | Optional |
| 19 | [0G-3](#0g-3-decision-loop-and-safe-stop) | Decision loop and safe stop | Fri 23:30 | |
| 20 | [0G-4](#0g-4-episode-log-and-replay) | Episode log and replay | Sat 02:00 | Needs 0G tokens |
| 21 | [REL-1](#rel-1-full-rehearsal) | Full rehearsal | Sat 04:30 | |
| 22 | [REL-2](#rel-2-submission) | Submission | **Sat 08:00** | |

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
| The public faucet is empty | Live response, last checked at 23:50 | **Verified**, can change |
| `mohar.eth` is available on Sepolia, at 8.000021 test USDC per year | Live `isAvailable` and `getRegisterPrice` | **Verified** at 23:40, can change |
| Sepolia's test USDC accepts `mint` from anyone, and it's an accepted payment token | Live `eth_call`, `isPaymentToken` | **Verified** by simulation |
| 0G mainnet router speaks TLS 1.2 | `openssl` | **Verified** from a laptop |
| 0G testnet router fails the TLS handshake | `curl` and `openssl` | **Verified** at 23:40 |
| 0G responses carry `x_0g_trace.request_id`, and it matches `X-Request-ID` | [Router docs](https://0gfoundation.github.io/0g-router/) | **Docs** |
| `POST /v1/decisions` returns typed answers, and `laya` costs nothing | Model catalogue; [docs PR](https://github.com/0gfoundation/0g-doc/pull/418) | **Docs**, tested in 0G-1 |
| The alt mempool admits our paymaster | Source reading suggests yes | **Untested**, settled in EF-2 |
| The ESP8266 can run TLS while holding a signature | About 51 KB free before Wi-Fi | **Untested**, settled in DEV-6 |

---

## 4. What I need from you

| # | What | Needed for | How |
|---:|---|---|---|
| 1 | **Devnet ETH: at least 0.2 ETH** at `0xcfb296f635254A4B3281D2e285174E98D643Ef60` | EF-1 onward | Ask Pierre or Alex at the EF booth to refill the faucet or fund this address |
| 2 | **Wi-Fi name and password.** Must be **2.4 GHz**: the ESP8266 can't use 5 GHz | DEV-6 | Put them in `firmware/mohar/src/secrets.h`, which I'll template. It's never committed |
| 3 | **0G API key** (`sk-…`) and team credits | 0G-1 | [pc.0g.ai](https://pc.0g.ai) → Dashboard → API Keys. Credits from the 0G booth |
| 4 | **Sepolia ETH: at least 0.05 ETH** at the same address | ENS-1 | Any Sepolia faucet, or the ENS booth |
| 5 | **Wiring** the servo and Pico | DEV-7 | Instructions are in DEV-7 |
| 6 | **0G testnet tokens** | 0G-4 | [faucet.0g.ai](https://faucet.0g.ai), or the 0G booth. I'll give you the address |
| 7 | **Your decision:** may I build the sidecar locally? | Optional | The permission system blocked it as external code. Allowing it gives us real admission checks without public funds |
| 8 | **How many people are building?** | Scheduling | Tells me what can run in parallel |

---

## 5. Kill rules

| Trigger | Action |
|---|---|
| **EF-1 not passed by Fri 12:00, because there are no funds** | Not a design failure. Keep building locally, and escalate to the EF team. The track accepts "code that submits one" if no admitted link is possible, though that's weaker |
| **EF-1 fails for any other reason** | Stop and rethink with the team. Everything depends on the EF core |
| **EF-2: paymaster not admitted by Fri 16:00** | Ask the EF team. Without it, our transaction passes the public mempool too, so **the claim that we need the alt mempool has to go**. We'd disclose that and keep the PQ account |
| **DEV-6: TLS can't work on the board by Fri 15:00** | The laptop forwards signed bytes and can't alter them. Drop "laptop off" and "no relayer" from all claims |
| **ENS behind schedule at Fri 22:00** | Skip ENS-4 and extras, but keep the rejected-edit demo. Without that, ENS is cosmetic |
| **0G: the decision isn't moving the servo by Sat 02:00** | **Withdraw from the 0G track.** We won't submit a logging-only integration |
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

**Status:** Next · **Target:** Fri 01:00 · **Depends on:** DEV-2 · **Needs from you:** nothing

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

**Tests:** run `npm run test:integration`. Every item must pass.

| ID | Pass only if |
|---|---|
| DEV3-T1 | A stranger's `report` reverts; the bound account's succeeds |
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

**Status:** Not started · **Target:** Fri 03:00 · **Depends on:** DEV-1 · **Needs from you:** nothing; the board is connected

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

**Status:** Not started · **Target:** Fri 05:30 · **Depends on:** DEV-3, DEV-4 · **Needs from you:** nothing

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

**Status:** Not started · **Target:** Fri 09:00 · **Depends on:** DEV-5 · **Needs from you:** 2.4 GHz Wi-Fi details

**Why:** this is the biggest hardware unknown. The chip has about 51 KB free before Wi-Fi, TLS needs a large buffer, and the devnet is HTTPS only.

**What gets built**

| File | Purpose |
|---|---|
| `firmware/mohar/src/net.*` | Wi-Fi, TLS 1.2, HTTP, JSON-RPC |
| `firmware/mohar/src/secrets.example.h` | Template; your real `secrets.h` is git-ignored |
| `devnet/up.sh --lan` | Exposes the local RPC to the Wi-Fi network, for testing only. The Engine API stays on localhost |

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

## DEV-7: Machine behaviour

**Status:** Not started · **Target:** Fri 17:00 · **Depends on:** DEV-6 · **Needs from you:** wiring

**Why:** this is what makes it a physical machine. The on-chain state and local safety rules must visibly change what it does.

**Wiring**

| From | To | Note |
|---|---|---|
| Servo signal | NodeMCU D5 (GPIO14) | |
| Servo power | External 5 V if possible | Never the 3.3 V pin |
| Pico GP0 (UART TX) | NodeMCU D6 (GPIO12) | Both are 3.3 V logic |
| All grounds | Joined together | Required |

Add a large capacitor across the servo supply if the board resets when the servo moves. **Low voltage only.** A servo is not a mains switch.

**What gets built**

| File | Purpose |
|---|---|
| `firmware/mohar/src/machine.*` | Mode logic and servo |
| `firmware/mohar/src/sensors.*` | Reads and checks Pico frames |
| `firmware/sim/` | Pico scenarios: normal, overheat, vibration, stall |

**Sensors are simulated, and we say so.** The parts list has no temperature or vibration sensor, so the Pico sends scripted values as framed data with a checksum, at 9600 baud.

**How it must behave**

| Mode | Trigger | Servo | How to leave |
|---|---|---|---|
| `RUN` | Decision is run, credit above zero, no hold, within local limits | Open | |
| `INSPECT` | Decision is inspect, or a local limit is exceeded | Half | Operator clears the hold on-chain, then a fresh `RUN` decision |
| `CREDIT_STOP` | On-chain credit is zero | Closed | Top-up |
| `SAFE_STOP` | Decision service or chain unreachable past its timeout, invalid decision, or keys exhausted | Closed | Service returns, then a fresh valid decision |

1. **Most restrictive wins:** the mode order is `SAFE_STOP`, `INSPECT`, `CREDIT_STOP`, `RUN`.
2. **Local limits don't wait:** too hot means `INSPECT` immediately, with no network.
3. **At boot,** the servo is closed until a full check passes.
4. Each checkpoint (60 seconds by default, shorter in the demo) reads sensors, reads chain state, decides, moves the servo and reports.
5. **In this phase,** decisions come from a development-only injection command. 0G replaces it in 0G-3, and release builds don't contain it.

**Tests**

| ID | Scenario | Pass only if |
|---|---|---|
| DEV7-T1 | Boot | Servo stays closed until the first check passes |
| DEV7-T2 | Normal sensors, credit, injected run | Open; `RUN` report mined |
| DEV7-T3 | Injected inspect | Half; hold set on-chain; report mined |
| DEV7-T4 | After T3, inject run | **Stays half.** AI can't clear a hold |
| DEV7-T5 | Operator clears the hold, then run | Open |
| DEV7-T6 | Credit used up | Closed within one checkpoint |
| DEV7-T7 | Top-up from a script | Open within one checkpoint |
| DEV7-T8 | Pico overheat, with 0G unavailable | Half immediately, without network |
| DEV7-T9 | No sensor frames, or bad checksums | Treated as `SAFE_STOP` |
| DEV7-T10 | 100 servo moves with Wi-Fi active | No resets |
| DEV7-T11 | Corrupted serial frames are rejected, and valid ones accepted | Checksum works; the dropped-frame rate is recorded |

**Manual test you can do:** watch the servo through each scenario, and compare it with the ledger's `status()`.

**If it fails:** if the servo resets the board, power it separately. If software serial drops too many frames, lower the speed or simplify the frame.

---

## DEV-8: Dashboard

**Status:** Not started · **Target:** Fri 19:00 · **Depends on:** DEV-3, ENS-2 · **Needs from you:** hosting choice in REL-2

**Why:** ENS and 0G both require a live demo link, and judges need to see state without a terminal.

**What gets built:** a static site in `dashboard/` with **no backend** and no trackers.

**How it must behave**

1. **Starts from a name.** It resolves `pump-001.<fleet>.eth` through the Universal Resolver, and finds the account, ledger and paymaster from ENS records. **The only configured values are RPC URLs.**
2. **Cross-checks identity.** It compares `mohar.pq.root` from ENS with `root()` on the account, and shows a clear warning if they differ.
3. **Shows state:** mode, credit, hold, quota, the last reports, and each frame's result.
4. **Shows the log:** the latest 0G root from `mohar.log`, once 0G-4 exists.
5. **Actions through a wallet:** top up, clear hold, and edit an ENS record.
6. **Fails clearly.** An unknown name, an unreachable RPC or a wrong chain each shows its own message.

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
2. Register `pump-001` in the fleet registry, with an expiry as its lease. Don't grant transfer rights, so a financed machine can't be sold off.
3. Set these records:

| Record | Editable by | Used by |
|---|---|---|
| ETH address for coin type `0x80000539` (ENSIP-11, chain 1337) | Owner | Dashboard: finds the account |
| `mohar.chainId`, `mohar.ledger`, `mohar.paymaster` | Owner | Dashboard |
| `mohar.pq.scheme`, `mohar.pq.root`, `mohar.pq.pubSeed` | Owner | Dashboard: cross-check |
| `mohar.policy` | **Owner only** | The AI's operating policy |
| `mohar.deviceType`, `mohar.capabilities` | Owner | Fleet view |
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
| ENS2-T6 | Transferring `pump-001` reverts, expected as `TransferDisallowed`. If it's allowed, stop claiming non-transferable |
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

**Status:** Blocked: needs API key · **Target:** Fri 12:00 · **Depends on:** nothing · **Needs from you:** `sk-…` key and credits

**Why:** we don't yet know that a model can judge these readings reliably. Find out before building firmware around it.

**What gets built**

| File | Purpose |
|---|---|
| `firmware/sim/scenarios.json` | Labelled scenarios: normal, overheat, vibration, stall, borderline |
| `signer/tools/0g-eval.ts` | Runs them through each candidate, and scores the results |
| `firmware/vectors/0g/` | Saved real responses, for firmware parser tests |
| `docs/evidence/0g-1.md` | Results and the decision |

**Candidates**

| Model | Why try it | Caveat |
|---|---|---|
| `laya` through `POST /v1/decisions` | A dedicated decision model, listed at zero cost and TEE-attested, returning typed answers with probabilities. Small responses suit the ESP | **Untested.** It may not reason well about numbers, and its input is limited to 512 tokens for English |
| `0gm-1.0-35b-a3b` through `/v1/chat/completions` | 0G's own model, TEE-attested, supports JSON mode | Thinking is on by default, so it may be slow and verbose |

**Endpoint:** `https://router-api.0g.ai/v1`. The testnet router failed its TLS handshake when checked.

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

**Why:** this is what qualifies for the track: a real 0G decision moves real hardware.

**How it must behave**

1. Each checkpoint: read sensors → read chain state → ask 0G → validate → choose the most restrictive mode → move the servo → save intent → sign → submit the report, which includes the request ID.
2. Development injection is gone from release builds.
3. **If 0G fails, there is no decision.** The servo closes, and a `SAFE_STOP` report goes out with an empty `requestId` and a reason code.
4. Only a fresh, valid decision can leave `SAFE_STOP`.

**Tests**

| ID | Scenario | Pass only if |
|---|---|---|
| 0G3-T1 | Pico normal | 0G run; servo open; `RUN` report on-chain with the real request ID |
| 0G3-T2 | Pico overheat, within 0G's range but below the local limit | **0G inspect moves the servo to half.** Hold set |
| 0G3-T3 | After T2 | 0G run doesn't reopen it; the operator must clear the hold first |
| 0G3-T4 | Block 0G's address | Servo closes within the timeout; `SAFE_STOP` report; `requestId` empty |
| 0G3-T5 | Restore access | Reopens only after a fresh valid decision |
| 0G3-T6 | Credit zero, 0G says run | Closed: AI can't override credit |
| 0G3-T7 | Inspect release firmware and logs | No code path invents a decision |
| 0G3-T8 | 30-minute run | No resets; all reports mined |
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
  "device": "pump-001.<fleet>.eth",
  "seq": 12, "tx": "0x…", "timestamp": 0,
  "request_id": "…", "model": "…",
  "sensors": { "simulated": true },
  "decision": { "action": "inspect", "confidence": 91, "reason": "overheat" },
  "selected_mode": "INSPECT",
  "commanded_actuator": "half"
}
```

`commanded_actuator` is what the device ordered. There's no sensor to confirm movement, so we don't claim it moved.

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

**How it must behave:** the whole demo runs start to finish on the public devnet, from a freshly flashed board with fresh keys.

**Tests**

| ID | Pass only if |
|---|---|
| REL1-T1 | The demo script completes twice in a row without a manual fix |
| REL1-T2 | It takes 2:30 to 2:55 |
| REL1-T3 | **Devnet reset drill:** following the written steps, a new key and contracts are up in under 15 minutes |
| REL1-T4 | Every claim in the demo is backed by an item in `docs/evidence/` |
| REL1-T5 | Fallback video recorded, in case the live demo or network fails |
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

# Appendix: what we won't do

| Temptation | Why not |
|---|---|
| Let AI decide credit or disconnection | Those stay deterministic |
| Put telemetry in ENS | ENS is identity, plus one log pointer |
| Let 0G or ENS hold keys or sign | Breaks the core claim |
| Pass model text to GPIO | Allowlist only |
| Say ENS permissions control the devnet | They can't |
| Use the devnet's published genesis key | It's an operator key and the node's relayer |
| Call `debug_*` or privileged methods on the public devnet | They affect everyone |
| Add World ID or a token | No real need |
| Say "first" or "proven secure" | We can't back either |
