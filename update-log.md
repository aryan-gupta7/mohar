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

### About 10:20 DEV-6 first attempt: blocked by the hotspot band
- Wrote the networking code (`net.cpp`: Wi-Fi, TLS 1.2 via BearSSL, JSON-RPC over HTTPS, timeouts, heap tracking) and console commands `wifi` and `rpc`. It compiles (RAM 45.8%).
- **The board couldn't join your hotspot.** My scan from the laptop shows it only on 5 GHz (channel 116); the ESP8266 can't see 5 GHz. You switched it to 2.4 GHz at about 10:45; a rescan at 10:50 still showed only 5 GHz. Waiting for it to be toggled.

### 10:30 to 10:55 ENS-1: `mohar.eth` registered on Sepolia
- Read the ENSv2 deployment table, confirmed every contract has code, `mohar.eth` available at 0.61 test USDC, commit age 60 s, minimum term 28 days.
- **First attempt reverted with empty data**, after minting USDC and approving (harmless). Found by simulating that the factory itself works, and the `initialize` call fails. **The deployed contracts are an older version than the source repo:** extracting the selectors from their bytecode showed `initialize((address,uint256)[])`, a name-based resolver, and `grantSetterRoles(bytes,address)`. The registrar's `register` and `makeCommitment` selectors do match.
- Fixed the script, reran: minted, approved, deployed the fleet resolver and registry through the factory, committed, waited 63 s, registered. **ENS1-T1 to T5 pass.** Cost: about 0.00000001 Sepolia ETH of gas. Balance is still 0.0999999… ETH.

### About 11:00 to 11:45 DEV-6 on the real board
- The hotspot came up on 2.4 GHz (channel 6). **The board joined Wi-Fi and did TLS 1.2 to the public devnet: chain `0x539`.** 50 of 50 reads, no reset, lowest heap 12.5 KB.
- **The board couldn't reach the laptop over the hotspot:** no TCP connection got through either way, though both reach the internet. Probably the hotspot isolates its clients; I can't check the laptop firewall without root. Joined the laptop to the hotspot with internet kept on Ethernet (`mohar-hotspot` connection, never the default route).
- So T4 was run against the public gateway: the board signed and sent a transaction, and the node decoded and judged it (`Nonce mismatch`, since that account isn't on the public chain).
- **Three bugs of mine, found on the board and fixed:** byte-at-a-time TLS writes (88 s down to 11 s); the signature wasn't copied for streaming; a 2.4 KB buffer was allocated permanently. Two earlier edits had silently not applied after a failed `cd`.

### About 12:00 to 12:45 DEV-7 and 0G-2: the checkpoint loop, written and run on the real board
- Wrote the whole device behaviour: `machine.*` (checkpoint timer, four modes, status and pulse LEDs), `rpc.*` (chain access over Wi-Fi/HTTPS or the USB bridge), `zerog.*` (the 0G call: one word, only exactly `RUN` or `INSPECT`, real request ID), `config.*` (provisioning), `meter.*` windows packed into each report.
- Each checkpoint: take the pulse window → read the ledger → fixed checks (peak above 13.8 kW, 3 or more glitches, any stuck line → INSPECT, no network) → ask 0G → pick the most cautious of {decision, ledger hold, credit} → show it on the LED → save intent, sign, send → compare the node's hash with its own.
- **What the real board did against the local chain** (`firmware/tools/behaviour_test.py`, USB bridge, injected decisions in place of 0G): normal load with credit gave RUN and a mined report whose ledger total equalled the board's pulse count (18 = 18); an INSPECT set the hold on-chain; an AI "run" afterwards did not clear it; the operator cleared it and it went back to RUN; a glitching line gave INSPECT from the local check with the decision service failing; no decision gave SAFE_STOP with an empty request ID; credit running out gave CREDIT_STOP with 14 pulses of arrears; a top-up paid the arrears first and returned to RUN.
- **Four bugs found by running it, all fixed:**
  1. A flash write held interrupts off for over 200 ms, so a normal 30 ms pulse looked 200 ms long and was reported as a stuck line. The interrupt can no longer declare a stuck line; only the main loop, sampling the pin, can. Pulses whose two edges arrive together are counted (and tallied separately).
  2. Commands sent during a checkpoint were swallowed while the board waited for the bridge. Now documented; tests send commands between checkpoints.
  3. `checkpoint-now` didn't work with the loop off.
  4. An INSPECT report still waiting to be mined **re-set the hold after the operator had cleared it**. That is correct ledger behaviour (an INSPECT report always raises the hold), so the tests now wait until each report is mined.
- **What slowed us down, measured:** the sidecar bundles transactions every **10 s** by default, so each report waited up to 10 s to be mined and every test step waited. Set to 1 s for the local sidecar only (`devnet/sidecar.sh`; it changes timing, not any admission rule). The behaviour run went from about 7 minutes to 152 s. Other slow things: the board's 4-minute key generation (done once; the key now survives), and my test steps depending on each other, so one failure cascaded (each step now starts from a known state).
- **Still open:** the "counting continues in CREDIT_STOP" check showed no new pulses between two checkpoints during a 12 kW surge. Idle counting is exact (27 = 26 over 30 s). Investigating whether it is a regression.

### About 12:45 Parallel work started
- Three agents are running, each limited to its own folder: ENS-2 (`meter-001.mohar.eth` and its permissions on Sepolia), 0G-4 (the episode log on 0G Storage; the 0.1 0G you sent arrived), and DEV-8 (the dashboard). The board and the local chain stay with me. They don't edit these shared documents or commit; I merge their results.

### About 15:00 to 15:40 Public devnet evidence (EF-1 and EF-2), and the plan rewritten for the Mohar Console
- **Devnet ETH arrived:** the faucet had been refilled, and sent 1 ETH. Public setup transactions need a real gas price (about 1 gwei, not the 7 wei of the local chain), so they now price from the network.
- **EF-1, first attempt:** the public alt mempool **admitted** the transaction (hash matched, outcome `accepted`), the miner relayed it four times, and it was **cancelled: "relayed 4 times without being included in a block"**. Cause: fees. At 2 gwei max / 1 gwei tip it was never included.
- **EF-1, second attempt at 5 gwei max / 2.5 gwei tip: mined** (block 1977, both frames succeeded, 169,146 gas, nonce 1 → 2).
- **The same run settled the staked-budget question, and corrected something I had told you:** a **staked account was admitted and mined with 150,000 verification gas**. The 100,000 cap I measured on the first night applied to unstaked senders. The docs' staked budgets are real. Our design stays within 100,000 and doesn't need the extra, but the earlier claim (in the plan, mechanism and the first-night log) was wrong for staked senders and is corrected.
- **EF-2 on the public devnet, T1 to T9, all pass:** same bytes refused by the canonical path and admitted by the alt mempool, mined in block 2010 with four frames succeeding, the account paid nothing, quota 10 → 9, and replay, over-quota, revoked and unstaked-paymaster transactions all refused.
- **Hardware:** added a structured event line for each pipeline stage on the board (`EV {...}`, documented in `docs/event-protocol.md`), so the dashboard can show only real firmware events. Cut 5.5 KB of permanent RAM (TLS needs about 28 KB of the free heap) by moving large buffers to per-call allocations. Fixed the false stuck-line alarm for good: the main loop now counts low samples only when they are taken back to back (a blocked loop was letting two different pulses look like one long one). **The full behaviour suite passes again, with the stuck count at 0 through the 12 kW surge.**
- **Agents:** the 0G Storage log agent finished (T1, T3, T4, T5 pass; details below). The dashboard agent was stopped; I restarted it against the expanded Mohar Console spec. The ENS-2 agent hit the usage limit mid-way with reads coming back empty; resumed.
- **Plan rewritten:** DEV-8 is now the Mohar Console from your brief: a live pipeline with eight real stages and provenance badges, a Demo Console (Web Serial, desktop), and a Meter Dashboard (phone-friendly), built in MVP / Strong / Polish levels with eleven tests.
- **The hotspot** went off at about 14:30 and was back at about 15:15. 0G-2 (the board calling 0G) still needs a Wi-Fi test.

### About 15:15 to 15:50 0G-2 on the board, the live run on the public devnet, ENS-2 and 0G-4 merged
- **The ESP8266 called 0G itself over Wi-Fi:** five meter windows, five answers as expected (normal and heavy → RUN; 8 kW overload, five glitches, and silence after load → INSPECT), each with a real request ID, about 6.2 s a call. My first "silence" test left out the previous-window sentence and got RUN; the fault was in my test text, not the model. Heap stayed above 37 KB.
- **The live run on the public devnet** (board on Wi-Fi, real 0G, real Pico pulses, fresh account, ledger and paymaster deployed there): checkpoint 1, normal → RUN, request ID on the report, mined, 20 s end to end; surge 12 kW → 0G said INSPECT → hold set on the ledger; back to normal → still INSPECT because of the hold. One checkpoint saw the public gateway unreachable for a moment and the board went SAFE_STOP, as designed; the test now retries that.
- **ENS-2 (agent): all eight tests pass on Sepolia.** The maintenance key edits maintenance status and is refused on the cryptographic root; the uploader key edits only the log pointer; a second meter's resolver refuses the first meter's key. **One surprise: a transfer is refused with `TransferUnsafeUntilRegistryIsEmancipated`, not `TransferDisallowed`, so I will not claim a per-name non-transferable role.** The agent also found why its first run read empty: the RPC returned a stale zero resolver right after registration.
- **0G-4 (agent):** the upload / proof-verified download / replay / tamper-detection / crash-safe-batching pipeline passes T1, T3, T4, T5. It is built on test data (injected decisions), so it is redone on the live run's data.

### About 15:50 to 16:25 The first soak, and what it found
- **30-minute soak on the public devnet:** 19 checkpoints, 17 reports mined (ledger sequence 22), each with a real 0G decision except the glitch cycle, which the fixed check handled without calling 0G. Heap never fell below 37.4 KB.
- **It did not pass:** the board **reset 6 times** (each recovered by itself: key loaded in milliseconds, the next checkpoint a normal mined report, no leaf reused), and in the last three minutes it sat in `SAFE_STOP` (chain unreachable).
- **Two causes:** (1) The phone hotspot **flipped back to 5 GHz** (channel 124) again; the ESP8266 cannot join it. (2) For the resets I suspect the TLS handshake: it computes for about 3 s without yielding, close to the 3.2 s software watchdog. I've disabled the software watchdog around the handshake (the 8 s hardware one stays on) and added reset-reason logging so the next soak says why. **Not yet confirmed**: a second soak was started and had to be stopped when the hotspot went 5 GHz again.
- **A real bug found on the way:** a board that was power-cycled never reconnected to Wi-Fi by itself (only my test command did). It now connects on demand and rejoins after a drop. That matters for the laptop-off demo.
- **0G Storage log on real data:** reports 19 to 22 of the public ledger uploaded (one batch, 0.0053 0G), downloaded back with proof verification, and compared with the chain: **4 of 4 match, with their real request IDs**. The root is now in `meter-001.mohar.eth`'s `mohar.log`, written by the restricted uploader key.
- **ENS now points at the live contracts:** `mohar.ledger`, `mohar.paymaster` and the chain-1337 address of `meter-001.mohar.eth` are the public-devnet contracts the board reports to.
- **Dashboard against real data (agent): 14 of 14 headless checks pass** — name → ENS → public ledger → status and decoded reports with request IDs, the root-mismatch warning, a dead RPC giving "Cannot read the chain", and 400 px. Not yet run with the real boards over Web Serial (needs you in Chrome) or with a real wallet.
- **Added:** README, LICENSE, a timed demo script with pre-flight and fallbacks, and manual tests 8f to 8k.

### About 16:30 to 17:05 Control centre, the watchdog, and 0G-1 closed
- **Control centre** (`npm run ctl`): every service with its port and health, the boards and who holds their serial ports, the hotspot band, the networks and the funds; `up`, `down`, `restart`, `logs`, `ports`, `doctor`, `free <port>`. **It immediately found why your dashboard wouldn't start:** a leftover test web server from one of the agents had been holding port 8088 since 13:20. `free 8088` then `up dashboard` fixed it, and the dashboard now runs from the tool.
- **Hotspot:** you fixed it; it is on channel 6 (2.4 GHz).
- **Soak 2 caught the actual reset cause.** Reset-reason logging reported `Hardware Watchdog`, with the program counter in `millis()`: the CPU was spinning in a library wait loop that never yields. My earlier guard (switching off the software watchdog around the handshake) only moved the reset to the 8 s hardware watchdog. The fix is now a hardware-timer interrupt that feeds the watchdog every 100 ms during a TLS exchange, with a deadline so a dead connection still resets. Soak 3 is running with it.
- **0G-1 closed:** `verify_tee` is accepted but `qwen3.8-flash` returns no TEE attestation (it isn't a TEE-attested model), so we make no "TEE-verified" claim; the 401, 404 and 400 errors come back clean; the request format is frozen in `docs/0g-request-format.md`.

### About 16:50 to 17:20 The reset hunt: it was the stack
- Soak 3 (interrupt-fed watchdog) had 6 resets in 11 minutes, now including a real crash: a fault inside `strtoull` reading from an address in code memory. Different addresses every time is the signature of **stack overflow**.
- **Measured:** the free-stack high-water mark was only **~800 bytes of 4,096** in the Wi-Fi + TLS + signing path. Moved the large locals (a 420-byte text buffer, two 290-byte report structs, a 512-byte write buffer, a 388-byte calldata buffer) off the stack, and raised the core's stack to 6 KB (`-DCONT_STACKSIZE=6144`): free stack is now **~2,850 bytes**, heap unchanged at ~35.5 KB.
- **Result: 0 resets over the whole 20-minute soak**, against 6 resets in 11 minutes before. Lowest heap 35.5 KB, lowest free stack 2.7 KB. **But 4 of its 12 checkpoints couldn't complete** (chain unreachable, or a resend rejected), each recovering on the next one; I don't yet know whether that is the public gateway, the hotspot or Wi-Fi. It is the next thing to chase. The first soak's 6 resets were most likely this same overflow; the watchdog theory was a symptom, not the cause.
- **ENS-3 (agent):** the dashboard's Identity page dry-runs each edit as the maintenance key, the uploader key and a stranger against the live Sepolia resolver and shows the contract's real answer (allowed, or the real `EACUnauthorizedAccountRoles` revert). No key is in the browser. All five ENS3 checks pass.

### Dashboard redesign (Fri, after 17:30)
- Rebuilt the Console UI for less clutter: light-first warm neutral palette with one dark theme, Inter and JetBrains Mono, hairline-ring cards in the shadcn style, a React Bits-style count-up on the headline number, and pill controls. No gradients or glow.
- Ten pages became five plus Settings: Overview, Console, Ledger, Identity, Activity. Live Meter, Verified Report and AI Insights are folded into Overview, Console and Activity; Usage is dropped (it only drew a chart once enough history exists). Uppercase provenance badges are now a few plain tags (Replay, Simulated, Stale, Sepolia, Devnet) used only where the source changes a number's meaning. Explanatory paragraphs and tooltips are removed.
- Data, store, chain, ENS and serial code are unchanged. **Not rerun:** `dashboard/test/e2e.py` still names the old pages and labels, so it needs updating before it counts as evidence. Checked only by build, typecheck and a replay in the browser.

### Fri 19:30 to 21:00 Report-size experiment (parked), local end-to-end run, finalise
- **Question from you:** can the signed report be smaller and cheaper? **Measured on the local chain with real signatures:** gas = 3,248 + 64 x raw bytes exactly, while the size floor binds; a 63-byte compact report saves 328 bytes and 7.4% gas; **w=32 costs 11 to 13% more gas** (validation 74k to 115k, slower ESP signing) so w=16 is the minimum. Public-devnet confirmation was not possible (see below).
- **Decision:** you asked to keep the older contract. All of it is parked on the branch `exp/report-optimization`; main has the original ledger, firmware and signer. A bug the work caught in my first compact version (replay checks missing) is in the branch notes.
- **Public devnet stopped mining:** its sidecar admits our transactions (`New`) but its bundler never includes them: same result with the original code and a fresh key. Not our bug; the local chain is the demo path.
- **Run end to end, locally:** board behaviour test ALL PASS (counting, INSPECT hold, credit-stop, arrears, top-up recovery); unit 9/9; integration 38 (1 timeout from running board tests at the same time, passes alone); control centre doctor: nothing wrong.
- **Test-harness fix:** board tests now switch the checkpoint loop off after boot (a provisioned board interleaved its own traffic and made the transaction-vector test time out). Safety test T9a needs the fixed test key, so the board is given the fixed key for the test and a real key afterwards.
- **Frontend connections checked:** the dashboard talks only to the chain RPC (local 18545 or the EF devnet), four Sepolia RPCs for ENS, and the boards over Web Serial; all three RPC kinds send CORS `*`, so a browser can call them. No hard-coded addresses or keys; no text claims a disconnection.

---

## Current state (Fri 17:30)

**Done:** DEV-0 to DEV-6 and most of DEV-7; EF-1 and EF-2 on the public devnet; EF-2L; 0G-1 to 0G-4 (0G-3 partly); ENS-1 to ENS-3; the dashboard (Mohar Console, new theme); the control centre; README, LICENSE, demo script.
**Open:** why 4 of 12 soak checkpoints couldn't complete; the pulse-wire unplug test (you); the laptop-off run, EF-3 (you); the dashboard with the real boards over Web Serial and a real wallet (you); a really blocked 0G network; two rehearsals, a fresh key and contracts, the video; the GitHub repo (you).
