# Mohar: Update Log

Every step, in order, with what happened. Times are IST. Newest entries go at the bottom. "About" means the time comes from file timestamps, not a recorded clock reading.

---

## Thursday, November 5, 2026

### 22:32 Board benchmark written
- Wrote `firmware/bench/`: chip info, Keccak self-test, hash speed, signing cost, heap.

### 22:34 Board identified and backed up
- ESP8266EX, 4 MB flash, 26 MHz crystal, CH9102 USB chip on `/dev/ttyACM0`, MAC `c8:c9:a3:33:ac:0b`.
- Saved the original flash to `esp8266-flash-backup-original.bin` in the parent folder, outside the repo. SHA-256 `529c9a2676dabd4ceaa00dd66db744059d76e7637d14f2e6ad29102b47d3fce3`.

### 22:50 Solidity verifier measured at the target tree height
- w=16, height 8: minimum 100,662, average 108,840, maximum 118,347 gas. This was on Foundry's EVM, with a Solidity verifier.

### 23:11 Benchmark flashed and run on the board
- Keccak self-test passed. 1,137 hashes per second. 1,005 hashes in 883 ms. 51,560 bytes free heap, Wi-Fi off.

### About 23:12 Workshop repo not run
- Running the workshop repo's scripts through `npx` was blocked by the permission system. Decided to read it for reference and write our own code.

### 23:16 Project scaffold and first public devnet attempt
- Added `.gitignore`, `package.json` and a deployer key in the ignored `.secrets/`.
- **Blocker:** the public faucet says `The faucet is empty`. Deployer `0xcfb296f635254A4B3281D2e285174E98D643Ef60` has no funds.
- Did not use the published genesis key. Its repo calls it an operator key and says not to, and it's also the node's relayer.

### 23:17 Gas cap measured on the public devnet
- Anything above 100,000 is refused: `exceeds MAX_VERIFY_GAS 100000`. Tested with an unstaked sender. The sidecar's source has no staking exception.
- **Consequence:** the docs' 1M and 2.5M staked budgets can't be relied on. Account and paymaster must share 100,000 gas.

### About 23:20 to 23:26 Local chain built
- Pulled the same `ethrex` build the public devnet reports, `9aa3645d`.
- `--dev` can't produce Hegota blocks, so wrote `devnet/producer.ts`, which drives the Engine API.
- Found a missing system contract, `0x000064d6…8282`, and added it.

### 23:27 Opcodes and nonce forms probed
- `TXPARAM`, `SIGPARAM`, `FRAMEPARAM`, `FRAMEDATALOAD`, `SIGDATACOPY` and `APPROVE` all work from Yul. Our digest matches the client's `SIG_HASH`.
- `nonce_keys = []`: rejected. Single-use `MAX_NONCE_SEQ`: rejected. `[1]`: 20,000 extra gas. `[1, 2]`: 40,000 extra gas. `[0]`: 172 gas in an approving frame.
- **Decision:** linear nonce with `[0]`, leaf = nonce − 1. This overrides the earlier analysis's suggestion of single-use keys, which this client doesn't support.

### 23:29 WOTS signer and account written
- Wrote `signer/src/wots.ts` and `MoharAccount.yul`, in Yul to avoid helper-contract gas.
- Caught a bug while rereading, before running: Merkle sibling offset was 2224, and should be 2272.
- 9 of 9 unit tests passed.

### About 23:31 **First WOTS-signed frame transaction mined**
- Local chain, block 117, status `0x1`. Verification used 77,068 gas. Local signature check agreed with the contract.

### 23:32 w=16 compared with w=4
- w=16: 65,098 to 82,198 gas, 2,400-byte signature, 169,146 total gas.
- w=4: 51,939 to 57,069 gas, 4,512-byte signature, 304,314 total gas.
- **Decision:** keep w=16. w=4 nearly doubles total cost, because calldata is expensive here.

### About 23:35 Sidecar build not run
- Dependencies installed in the scratch folder, but building was blocked by the permission system as external code. So real alt mempool admission still can't be tested without public funds. Listed as a decision for you.

### 23:38 Quota paymaster written and tested
- Wrote `QuotaPaymaster.yul`. Used `cast sig` to verify function selectors, which corrected three.
- 22 of 22 integration tests passed. Canonical rules refuse it with `StorageReadNonSender`. Paymaster validation uses 7,556 gas.
- **Decision:** the paymaster is core, not optional. Its storage read is the real reason to need the alt mempool.

### 23:40 0G and ENS checked
- **0G:** mainnet router speaks TLS 1.2. Testnet router fails its handshake. Storage RPC and indexer are reachable. Responses carry `x_0g_trace.request_id` (docs). Found decision models: `laya` is listed at zero cost.
- **ENS:** Sepolia contracts are live. `mohar.eth` is available. Price is 8.000021 test USDC per year, with a 28-day minimum. Anyone can mint the test USDC (simulated). Commit wait is 60 seconds.

### 23:44 to 23:46 Clean-state verification
- Fixed fresh-clone problems: `make-genesis` crashed without a key and needed the public devnet, so it now uses a committed `devnet/snapshot.json`. Also corrected a misleading error message.
- Added tests: node trace available, plain transfers refused, `deposit()`, owner-only withdrawal.
- Deleted `node_modules` and build output, then reinstalled, rebuilt and reran everything.
- 25 of 25 integration tests passed. Reflashed the board, with the same results.

### 23:50 Step limit measured
- Added a test for the device's step guard. 630 steps uses 89,146 of 90,000 gas. 645 steps fails in frame 0 with `out_of_gas`.
- 26 of 26 integration tests passed.

### 23:52 to 23:57 Documents written
- Wrote `mechanism.md` (what's built, plus manual tests), `dev-plan.md` (phases, expectations, tests) and this log.
- Added a correction notice to `../plan.md`.
- Ran the one manual command not yet tried (`cast rpc eth_getTransactionReceipt`). It works, and it showed my expected gas range was too narrow, so that was corrected.

### 23:58 Local git repository created
- Created the repo in `mohar/` on branch `dev`. Scanned first: no keys in any tracked file. Nothing is pushed.
- Commits: `0befea9` scaffold, `89fb210` local chain, `677af2d` board benchmark, `04c9bb3` devnet probes, `41af208` WOTS signer and account, `d1456a2` paymaster and integration tests, `ba4d03a` documents.
- Rechecked the public faucet: still empty.
- Stopped the local chain and block producer, so manual tests start clean.

---

## Friday, November 6, 2026

### 08:20 New instructions received
- Pico H connected; flash it and use it, without touching its ROM. Wi-Fi details for the ESP received. Servo dropped: the story is now an electricity meter. Sidecar may be built locally. DEV-3 to proceed.
- The ESP8266 is still `/dev/ttyACM0` and the Pico is `/dev/ttyACM1`. From now on the docs use the fixed `/dev/serial/by-id/` names, which don't change when boards are replugged.

### 08:21 Pico inspected and backed up
- It runs **CircuitPython 10.0.3**, so no reflashing was needed. The firmware and boot ROM were left untouched.
- Its whole drive was copied to `../pico-circuitpy-backup-original/`, with SHA-256 sums in `../pico-circuitpy-backup-original.sha256`.

### 08:22 **Security: keystroke-injection payload found on the Pico**
- The existing `code.py` (dated May 11, 2026) acted as a USB keyboard: 3 seconds after power-up it pressed Ctrl+Alt+T, then typed a command that downloads a script from the internet and runs it with `bash`, then `exit`. It runs every time the board powers up.
- Replaced it at once with a harmless placeholder, and added a `boot.py` that turns the Pico's USB keyboard and mouse off.
- Checked this computer, without reading file contents: no startup, autostart, systemd, SSH or shell-config files changed since 08:00, and no unexpected processes started after the Pico was connected. **Your fish history does contain the domain 4 times**; the permission system stopped me reading it, so when those ran is for you to check.
- In the backup, the payload is renamed `code.py.KEYSTROKE-PAYLOAD-do-not-restore` (contents unchanged), so copying the backup back can't re-arm it.

### 08:25 Pico meter simulator installed and tested
- Wrote `firmware/pico-meter/code.py`: an electricity meter's pulse output at 3,200 pulses per kWh, 30 ms pulses on GP0, open-collector style, with load scenarios selected over USB serial.
- Measured on the board: 900 W gave a pulse about every 1.25 s; 3,000 W gave 10 pulses in 4 s (10.7 expected); 12,000 W gave 21 in 2 s (21.3 expected); glitch mode added 3 spikes of 2 ms in 6 s.
- Wi-Fi details stored only in git-ignored files. They are never written to tracked files or logs.

### 08:30 DEV-3: ledger written; first deployment ran out of gas
- Wrote `contracts/src/MachineLedger.sol`, added `root()` and `pubSeed()` getters to `MoharAccount.yul`, plus ledger helpers and tests.
- Deployment used all 5,000,000 gas. **Measured: code costs about 1,670 gas per byte on this devnet** (mainnet: 200). At 100,000 optimizer runs the ledger cost 8.4 million gas to deploy; at 200 runs, 6.0 million. Switched to 200 runs, and deployments now estimate their gas.

### 08:36 DEV-3: storage slots are expensive too, so the ledger was repacked
- A report that created a new storage slot used about **98,600 extra gas**, close to the report frame's whole 100,000 state-gas limit. A separate arrears slot would be recreated each time credit ran out.
- **Decision:** credit and arrears became one signed `balance` in a slot reports already write. After the first reading, a report never creates storage.
- **Decision:** usage beyond credit becomes arrears, paid first by the next top-up. Without a servo nothing stops consumption, so it has to be recorded.
- Test fixes: funding new test keys needs more than 21,000 gas here, and the node refuses `eth_call` from an address with code.

### 08:40 DEV-3 passed
- `npm test`: 9 of 9. Ledger tests: 12 of 12, including a worst-case report (35,686 of 50,000 gas) and the check that ETH held equals credit plus earned.
- The 26 earlier tests now run against the real ledger: 26 of 26. A 630-step signature uses 89,161 of 90,000 gas; the getters added 15 gas.
- Reran manual Test 5: still mined, status `0x1`, 169,146 total gas.
- Wrote `firmware/vectors/report.json`: 8 encoded reports for the firmware to match.

### 08:46 Documents updated for the meter story
- `dev-plan.md`: DEV-3 marked done, with its changes. DEV-7 renamed "Meter signal acquisition and device behaviour": servo removed, Pico serial messages replaced by pulse generation and counting, and modes shown on LEDs instead of positions. 0G-3 now updates device state and LED. Dashboard gets pulse count, consumption and anomaly status. New phase EF-2L (local sidecar), and a demo story. Schedule moved.
- `mechanism.md`: ledger section, measured costs, attack table, and manual tests 8 and 9.
- `../plan.md`: a note about the story change.

### 08:47 Committed locally
- `3c2d01e` ledger, `30d5fa4` Pico simulator, `7cfe9ff` documents. Checked first: neither the deployer key nor the Wi-Fi details are in any commit.

### 08:50 Your new request: speed up, and list what needs you
- Public faucet rechecked: still empty, balance 0.
- 0G checked: the API key is a 0G Private Computer `sk-…` key from pc.0g.ai. Credits are in 0G tokens, from the booth, a deposit or a card; it isn't Sepolia. The mainnet router accepts TLS 1.2, which the ESP8266 needs, but the testnet router `router-api-testnet.integratenetwork.work` didn't negotiate TLS 1.2. So the device must use mainnet.

### 08:51 Sidecar built and running locally
- Built `forshtat/mempool-workshop-sidecar` at `2e22ff0` from source, as you approved. Wrote `devnet/sidecar.sh` (pinned commit, local relayer key, public devnet's staking rules) and `devnet/fund.ts` (refuses anything but the local chain).
- Added `MOHAR_NET=local-alt`. Switching networks is now one variable.

### 08:55 **EF-2L passed: the alt mempool proof works with the real sidecar code**
- Same signed bytes: refused by the canonical path (`StorageReadNonSender`), admitted by the sidecar with our hash, mined with all four frames succeeding, paid by the paymaster. Account balance 0, quota 10 → 9.
- Admission record: 24 rule checks, all pass.
- Refused as expected: unstaked paymaster (`unstaked payer accessed payer slot`), over quota and revoked device (frame 1, at submission), replay (`Nonce mismatch`).
- The same code reads the public devnet with `MOHAR_NET=public`. Evidence: `docs/evidence/ef-2-local-alt.json`.

### About 08:57 to 09:10 DEV-4: device firmware written and tested on the ESP8266
- Wrote `firmware/mohar` (Keccak, WOTS, key store, serial console) and two builds: `dev` with test commands, `release` without.
- Added Keccak and WOTS reference vectors from the TypeScript signer, and `firmware/tools/device_test.py`.
- First boot generated its own key: **245 s**, no reset. Keccak 7 of 7 and the 20 signatures matched byte for byte; the slowest took 906 ms, leaving 47,592 bytes of heap. Reload after reset: **5 ms**.
- **Test-tool bugs, not firmware bugs:** my script discarded buffered serial data, and opening the serial port resets this board, so commands sent right away were lost. Both fixed; tools now wait for the board.

### About 09:08 **DEV4-T8 passed: the ESP8266 signed a transaction the alt mempool admitted**
- `signer/tools/device-sign.ts` deployed an account for the board's own public key, the board signed report 1 in 523 ms, and the real sidecar code admitted it. Mined with all four frames `0x1`, account balance 0.
- Release build: `sign`, `keccak`, `wipe` and `keygen-fixed` all answer `UNKNOWN`.

### About 09:19 DEV4-T5 passed: two wipes, two different keys (246 s each)

### About 09:12 Other prepared work (nothing needed from you)
- Wrote `firmware/mohar/src/meter.*`, the pulse counter for D6 (GPIO12). **Not compiled into the firmware or flashed yet:** it waits for the wires.
- Found the `/v1/decisions` request format in the 0G docs. `laya` is priced at zero, which may mean it needs only a key. Wrote `signer/tools/0g-eval.ts` and 14 labelled scenarios (`firmware/sim/scenarios.json`), ready to run when a key exists.

### About 09:20 to 09:55 Your new messages: wires done, 0G key in place
- Wires done. Added pulse counting to the ESP8266 firmware and a two-board test (`firmware/tools/meter_test.py`). **The ESP's count equalled the Pico's exactly:** 72/72 at 900 W, 215/215 at 12,000 W, and 32/32 valid pulses plus 25/25 two-millisecond glitches in glitch mode. The off state read zero with the line high, and 3,000 W measured 2,989 W.
- 0G key tested. **`laya` can't do this job:** it gave P(inspect) 0.53 to 0.62 for everything. **`vela-2.0-9b` missed 6 of 7 inspect cases.** Both are listed in `docs/evidence/`.
- **Your choice, `qwen3.8-flash`:** with its reasoning on, calls took 6 to 20 s and about 1 in 10 timed out, so I turned reasoning off (`enable_thinking: false`): 2 s and 66 tokens a call. Then it got 11 of 14 scenarios right on the first prompt. The failures were glitches, irregular timing and a 5.4 kW overload. I added the owner's policy to the prompt (which the ENS `mohar.policy` record will hold), and added 5 scenarios written after that, not used to write it. **Result: 19 of 19 scenarios at 5 of 5, p95 latency 1.2 s, no timeouts, request IDs matching 95 of 95.** The policy text was written after seeing the first 14 scenarios, so those aren't an independent test; the 5 later ones are.
- Total 0G spend so far is tiny: about 400 calls at about 66 tokens, at $0.00000019 per million input tokens.

### About 09:30 to 09:55 DEV-5: the board builds, saves intent for, and signs its own transactions
- Wrote the RLP encoder and transaction builder (`frametx.*`), and the key-safety state machine (`intent.*`).
- **31 of 31 vectors matched the library byte for byte on the first run.** The leaf-safety tests passed, including crash recovery.
- **Bug found by the end-to-end test:** a state reset restarted the sequence counter at 0, so after a reboot an older slot won and the board refused to sign (`CHAIN_BEHIND`). It refused safely. Fixed; added a regression test.
- **DEV5-T9 passed:** three transactions built and signed by the board, admitted by the sidecar, mined, four frames each. Hold set on the ledger by the second report.
- The board dropped off USB once during flashing (it re-enumerated at 09:40) and the upload failed; retrying worked.

### About 10:05 Benchmark rerun, as you asked
- Flashed `firmware/bench` and captured it: Keccak self-test PASS, 1,137 hashes/s, worst-case signing 884 ms, 51,560 bytes free heap, key generation estimate 226 s. Identical to the first night. Restored the real firmware: **the saved key survived** (same root `0x6c0937ea…`).

### 10:12 to 10:25 DEV5-T6: three real power pulls
- Run with you at the cable. Each pull cut the power while the board was signing, mid-stream. Round 1 landed on leaf 15, round 2 on leaf 15 again (same moment, so it counts as one sample), round 3 on leaf 6.
- Every time: the intent was already on flash (saved before the signature existed), the board resent the identical transaction twice, and then signed the next report normally with a new leaf. No key was reused.
- Confirmed healthy afterwards: all 18 leaf-safety checks pass.
- Sepolia: you sent 0.1 ETH; verified on-chain at 10:00.

---

## Current state

**Done:** DEV-0 to DEV-5 (including the power pulls) and EF-2L on the local chain, 0G-1, pulse counting on real hardware.
**Next:** DEV-6 (Wi-Fi, TLS and RPC on the board).

**Blocked on you:**
1. Devnet ETH for `0xcfb296f635254A4B3281D2e285174E98D643Ef60`.
2. 0G API key and credits.
3. Sepolia ETH for the same address.
4. The two wires between the Pico and the ESP8266.
