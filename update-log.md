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

## Current state

**Done:** DEV-0, DEV-1 and DEV-2, on the local chain.
**Next:** DEV-3, the machine ledger.

**Blocked on you:**
1. Devnet ETH for `0xcfb296f635254A4B3281D2e285174E98D643Ef60`.
2. 2.4 GHz Wi-Fi details.
3. 0G API key and credits.
4. Sepolia ETH for the same address.
