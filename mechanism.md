# Mohar: How the Implementation Works

This describes only what is **built and tested so far**. For what comes next, see [dev-plan.md](dev-plan.md). For the history of each step, see [update-log.md](update-log.md).

**Last updated:** Thursday, November 5, 2026, 23:58 IST

---

## 1. What exists today

| Component | File | State |
|---|---|---|
| WOTS-like signer | [signer/src/wots.ts](signer/src/wots.ts) | Working, 9 unit tests pass |
| Machine account | [contracts/yul/MoharAccount.yul](contracts/yul/MoharAccount.yul) | Working on the local chain |
| Quota paymaster | [contracts/yul/QuotaPaymaster.yul](contracts/yul/QuotaPaymaster.yul) | Working on the local chain |
| Transaction builder | [signer/src/mohar.ts](signer/src/mohar.ts) | Working, 26 integration tests pass |
| Local chain | [devnet/](devnet/) | Working: same client build as the public devnet |
| Board benchmark | [firmware/bench/](firmware/bench/) | Working on the real ESP8266 |

### Proven and not yet proven

| Claim | Status | Evidence |
|---|---|---|
| A WOTS-signed frame transaction can be mined | **Proven on the local chain** | Mined with status `0x1`; test `end to end` |
| The canonical rules refuse the paymaster | **Proven on the local chain** | Violation: `StorageReadNonSender` |
| The public devnet caps validation at 100,000 gas | **Proven for an unstaked sender** | `exceeds MAX_VERIFY_GAS 100000`. The source has no staking exception, but a staked sender hasn't been tried live |
| The alt mempool admits our transaction | **Not proven** | Needs public devnet funds, and the faucet is empty. A local sidecar build was blocked by the permission system |
| Anything on the public devnet with our contracts | **Not proven** | Same funding block |
| The ESP8266 can sign these transactions | **Not proven** | Its speed is measured, but the signing firmware isn't written |
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
   Frame 2  SENDER   target contract  runs the report, called by the account
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

Written in Yul because Solidity can only reach frame opcodes through helper contracts, and each helper call starts at 2,600 gas for cold access. Runtime size is 495 bytes.

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

## 8. Measured numbers

All are from the local client, build `9aa3645d`, the same build the public devnet reports.

### Gas for one report

| Item | Gas |
|---|---:|
| Account validation at 495 steps | 73,786 |
| Account validation at 630 steps (the device's limit) | **89,146** of 90,000 |
| Account validation at 645 steps | Fails with `out_of_gas` in frame 0 |
| Paymaster validation | 7,556 of 9,900 |
| Report frame, against a minimal test contract | 4,066 |
| Settle frame | 11,670 of 40,000 |
| Total transaction | 170,352 |

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
| 256 keys, chain hashes only | About 226 s (calculated from the above) |
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

**What a stolen key can still do:** post false reports, within quota, until the owner revokes it.

---

## 10. The local chain

The public devnet's faucet is empty, and it can be reset at any time, so development uses a private copy.

- **[devnet/up.sh](devnet/up.sh)** starts `ghcr.io/forshtat/ethrex:eip8141-tracer-latest` in Docker. It's bound to localhost: RPC on port 18545, Engine API on 18551. State is thrown away on every start.
- **[devnet/make-genesis.ts](devnet/make-genesis.ts)** builds the genesis from [devnet/snapshot.json](devnet/snapshot.json), a saved copy of the public devnet's chain config and system contracts. All forks are active from block 0. Only our local deployer is funded.
- **[devnet/producer.ts](devnet/producer.ts)** plays the consensus client through the Engine API, making one block every 2 seconds by default. The client's built-in `--dev` mode can't produce Hegota blocks.

**Differences from the public devnet:** a single node, no sidecar, no peers, and all forks active from genesis.

**Keys:** [signer/src/devnet.ts](signer/src/devnet.ts) creates a throwaway deployer key in `.secrets/`, which git ignores. Devices never use it. We don't use the devnet's published genesis key: the repo that publishes it says it's an operator key, and it's also the node's relayer, so using it could disrupt others.

---

## 11. Limits of what's built

- **Physical security:** ESP8266 flash is readable. Nothing here protects a seed from someone holding the board.
- **Cryptography:** custom and unaudited, and not standards-compliant.
- **No key migration:** one fixed root and verifier. After 256 transactions the account can't sign. Moving to a new root or scheme is future work.
- **Sensor truth:** a signature shows the key signed something, not that the reading is correct.
- **Maturity:** EIP-8141 and ERC-8421 are drafts, and this runs only on devnets.
- **Target contract:** tests use a minimal stand-in. `MachineLedger` comes in phase DEV-3.

---

## 12. Manual testing

Every command below was run on this machine and gave the results shown. Run them from `mohar/`.

**You need:** Docker, Node 23.6 or newer, and solc 0.8.28 (Foundry installed it at `~/.local/share/svm`). For the board: PlatformIO (`pio`) and the ESP8266 on USB.

### Test 1: Install and build

```sh
npm install --ignore-scripts
npm run build
```

**Expected:** these lines, plus experiment contracts:
```text
MoharAccount: creation 606 bytes, runtime 495 bytes
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

### Test 4: Account and paymaster, including attacks

```sh
npm run test:integration
```
**Expected, in about a minute:** `tests 26`, `pass 26`, `fail 0`, with lines like these. Step counts vary, because each run uses new keys:
```text
steps 495, account 73786 gas, paymaster 7556 gas, settle 11670 gas, total 170352 gas, ...
canonical violation: StorageReadNonSender
mined: total gas 170352, frames 73786, 7556, 4066, 11670
replay verdict: Invalid Transaction: Nonce mismatch: expected 4, got 1
630 steps used 89146 of 90000 gas
645 steps fails in frame 0: out_of_gas
```

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

```sh
cd firmware/bench
pio run -t upload --upload-port /dev/ttyACM0
pio device monitor --port /dev/ttyACM0 --baud 115200
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
