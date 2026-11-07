# Mohar

**A method that makes any IoT device verifiable.**

Today a device's reading reaches the people who rely on it through someone's server, and they take that server's word. Mohar removes the server from the trust path. The device holds its own key, signs its own report, asks an AI for a second opinion that can only make it more careful, and sends the report straight to a chain that anyone can read. Its name on ENS tells everyone where to look.

Built for ETHGlobal Mumbai 2026. Tracks: Ethereum Foundation (frame transaction alternative mempool), ENS (ENSv2), 0G (Physical AI).

> **The demo is a prepaid electricity meter. The project is the method.** A Raspberry Pi Pico H plays the impulse output of an electricity meter, and an ESP8266 counts the pulses and does everything else on its own: judges, signs, sends. The meter is the example we chose because it has a clear problem (tenant, owner and maintenance staff each have reason to doubt a reading). Swap the pulse input for any sensor and the rest stays.
>
> **What is real and what is simulated.** The meter's pulses are simulated. Everything after the pulse wire is real hardware and a real network. Nothing measures real electricity and **nothing disconnects a supply**: running out of credit is recorded as arrears, not enforced.

## The method

Four parts, none of them specific to meters:

| Part | What the device gets | Built with |
|---|---|---|
| **Identity** | A name (`meter-001.mohar.eth`) that points to its account, ledger, paymaster and key root. Each party may edit only its own records. | ENSv2 on Sepolia: a subname registry, a permissioned resolver, role-based edit rights |
| **Signature** | A key only the device holds. It signs every report itself, builds the transaction itself, never reuses a one-time key, and survives power loss. The device pays no gas. | A hash-based one-time signature (256 keys under a Merkle root), a frame transaction, a quota paymaster, the ERC-8421 alternative mempool |
| **Judgement** | A second opinion on every report. The AI can add caution, never remove it. If it can't be reached the device stops safely; it never guesses. | A 0G Private Computer model called by the device itself, over TLS, with a request ID kept with every decision |
| **Record** | A ledger anyone can read, and an episode log that can be replayed and compared with the chain. | A ledger contract on the devnet, and a log on 0G Storage whose root is published in ENS |

### What changes for another device

| Stays the same | Is specific to the demo meter |
|---|---|
| The account, signature scheme and paymaster | The Pico pulse input, 3,200 pulses per kWh |
| The report shape: sequence, running total, mode, reason, a packed sensor word, the AI's request ID | The fixed checks (peak load, glitches, stuck line) |
| The decision rule: the most cautious of the device's checks, the AI and the ledger wins | The prepaid credit, arrears and tariff in the ledger |
| The ENS record layout and the permission model | The two roles we demoed: maintenance and log uploader |

To bring a new device: give it a name and a key, write its sensor window and fixed checks, point its account at a ledger, and set its policy. The ledger's credit logic is the meter demo and would be replaced by whatever the new device needs to track.

## How a report happens (the demo meter)

1. The Pico pulls GP0 low for 30 ms per pulse. The ESP8266 counts them on D6.
2. Every checkpoint the ESP8266 closes a window of pulses, reads the ledger, and runs fixed checks (peak load, glitches, stuck line).
3. It asks 0G (`qwen3.8-flash`, reasoning off) `RUN` or `INSPECT`. Anything other than those exact words is "no decision", and no decision means `SAFE_STOP`.
4. It picks the most cautious of its own checks, the AI answer and the ledger's state (a hold, or credit that can't cover a pulse). **AI can only add caution: it cannot clear a hold or override credit.**
5. It signs the report with a one-time key, after saving its intent to flash, and sends it over Wi-Fi and TLS to a public RPC. There is no relayer and no application backend.
6. `MoharAccount` verifies the signature and only allows reports to one ledger. `QuotaPaymaster` pays the gas within a quota. `MachineLedger` records pulses, charges credit, keeps arrears, and holds on `INSPECT`.

## How each track is used

**Ethereum Foundation: frame transaction alternative mempool.** The device holds no ETH. Its account's own code decides what is valid (EIP-8141), and a paymaster pays from a daily quota, which needs the paymaster to read its own storage. The canonical rules refuse that shape (`StorageReadNonSender`); the alt mempool admits the same bytes. This is both "something only an alt mempool makes possible" lanes: a post-quantum-style hash-based wallet and a quota paymaster. Public devnet evidence: the same signed report refused on the public path and admitted on the alt path, mined with four frames succeeding and the account paying nothing (hash `0x161873f67ec01b34a6b1d7f473b169c81fe00699700860cfac3da9422df50e0b`, block 2010). A report the ESP8266 built, signed and sent itself, admitted with "every rule passed" and mined with the paymaster as payer: [on the explorer](https://explorer.altmempool.wtf/tx/0x5648ba4ac3c546525b465dbc17a09f9df3c25ad279943017f691b78c08c8e54c?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc), with a screenshot in [docs/evidence](docs/evidence/explorer-admitted-report.png). The signature check uses 89,161 of the 90,000 gas allowed in frame 0; a staked account was also admitted and mined at 150,000.

**ENS: ENSv2.** ENS is how the device is found and who may change what. `meter-001.mohar.eth` on Sepolia holds the ledger, paymaster, key root, policy, operator, maintenance status and log pointer. The dashboard discovers everything from the name. A maintenance key can edit only `mohar.maintenance.status`; the same key editing `mohar.pq.root` is refused by the resolver with `EACUnauthorizedAccountRoles`. The Identity page runs this against the live resolver. ENS permissions control ENS records only, not the devnet contracts.

**0G: Physical AI, agents with a body.** A real 0G call sits inside the device's decision loop, and its answer changes the device's state and status LED. A 0G `INSPECT` set a hold on the public ledger. Every report carries the request ID. Reports are batched to 0G Storage, the root is published in ENS (`mohar.log`), and a replay tool verifies proofs and compares every record with the chain. If 0G can't be reached the device goes to `SAFE_STOP` with an empty request ID. No code path invents a decision.

## Contract addresses

Mohar devnet (EF alt mempool devnet, chain 1337, RPC `https://altmempool.forshtat.com`). These change with every redeploy, so the Connect page of the dashboard shows the ones in use.

| Contract | Address |
|---|---|
| MachineLedger | `0x3fdec3e95601c36b4b9d5ad9dec10dbee4ba5741` |
| MoharAccount (the device's account) | `0x7eb63c0acd9ef3e494b5de676f63feaaed522291` |
| QuotaPaymaster | `0x3f98eb9ed81bf51cda95f7d6fab4ad322dcf5164` |

Sepolia (ENS): the `mohar.eth` subregistry `0x53AD330F425412DCFFf888d58d7CB21f28BEeA01` and resolver `0x7c0768Ca185865Ab3A10D65e5CFD8Fc29288B6ab`. Every transaction hash is in [docs/evidence/ens-1.json](docs/evidence/ens-1.json) and [ens-2.json](docs/evidence/ens-2.json).

## What was proven, and where

| Claim | Evidence |
|---|---|
| A signed frame transaction is mined on the **public EF devnet** | [docs/evidence/ef-1.json](docs/evidence/ef-1.json) |
| The canonical mempool refuses the transaction (`StorageReadNonSender`) and the alt mempool admits **the same bytes**; four frames succeed, the account pays nothing | [docs/evidence/ef-2-public.json](docs/evidence/ef-2-public.json) |
| The ESP8266 builds, signs and sends its own transactions, and survives power loss without reusing a key | [mechanism.md](mechanism.md) sections 7b and 12, three real power pulls |
| Real 0G decisions from the board, with request IDs, drive the device's state | [docs/evidence/live-run-public.json](docs/evidence/live-run-public.json) |
| Device identity and key-scoped permissions on ENSv2 (Sepolia) | [docs/evidence/ens-2.json](docs/evidence/ens-2.json) |
| An episode log on 0G Storage with proof-verified replay | [docs/evidence/0g-4.json](docs/evidence/0g-4.json) |

[mechanism.md](mechanism.md) explains how each part works and what was measured. [dev-plan.md](dev-plan.md) has every phase with its tests and results. [update-log.md](update-log.md) is the dated record of what happened, including the mistakes.

## Dashboard

[dashboard/](dashboard/) is a static site (Vite, React, TypeScript): no backend, no trackers, no secrets in the browser. `/` is the entry page that explains the method; `#overview` is the working dashboard for the demo meter. It finds the meter from its ENS name (no addresses in the code), reads the devnet over RPC, and with a board plugged in over USB (desktop Chrome or Edge) it shows the live pipeline. Without a board it works from the chain alone. `.github/workflows/pages.yml` publishes it with GitHub Pages (set Pages > Source to GitHub Actions).

## Honest limits

- **The signature scheme is custom and unaudited.** It follows the Winternitz one-time idea with a Merkle tree, but it is not LMS, XMSS or WOTS+. Do not protect anything valuable with it.
- ESP8266 flash is readable: anyone holding the board can extract the seed.
- 256 signatures per key. There is no key migration.
- The meter's readings are simulated, and a signature proves that the key signed, not that the reading is true.
- EIP-8141 and ERC-8421 are drafts and run only on the devnet. ENS is on Sepolia; the Mohar contracts are on the EF devnet.
- The TLS connection does not yet verify the server's certificate (a signed transaction can't be altered by a network attacker, but reads could be spoofed).
- The 0G model's answer carries no confidence value; the ledger's `confidence` field is 0.

## Layout

| Folder | Contents |
|---|---|
| `contracts/` | `MoharAccount` and `QuotaPaymaster` in Yul, `MachineLedger` in Solidity |
| `signer/` | the TypeScript signer, tests, and the scripts that produced the evidence |
| `firmware/mohar/` | the ESP8266 firmware (PlatformIO) · `firmware/pico-meter/` the simulated meter (CircuitPython) |
| `ens/` | ENS scripts for Sepolia · `uploader/` the 0G Storage log and replay |
| `dashboard/` | the entry page and the working dashboard (static site) |
| `devnet/` | a local copy of the devnet and the alt mempool sidecar for development |
| `docs/` | evidence, the event protocol, notes |

## Control centre

One command shows every service, the port it owns, whether it is healthy, the boards, the hotspot band, and the funds, and starts, stops and diagnoses them:

```sh
npm run ctl                     # status of everything
npm run ctl -- up               # local chain + block producer + alt mempool sidecar
npm run ctl -- up dashboard     # the dashboard on http://127.0.0.1:8088/
npm run ctl -- down             # stop the dev stack
npm run ctl -- doctor           # what is wrong, and the exact fix
npm run ctl -- ports            # every listening port and who owns it
npm run ctl -- free 8088        # stop whatever is holding a port
npm run ctl -- logs sidecar     # last lines of a service's log
```

## Run it

Needs Node 23.6+, Foundry (it provides solc 0.8.28), Docker and PlatformIO. Full manual tests with expected output are in
[mechanism.md](mechanism.md) section 12.

```sh
npm install --ignore-scripts && npm run build && npm test          # signer and contracts
./devnet/up.sh && node devnet/producer.ts 1                          # a local chain (second terminal)
./devnet/sidecar.sh                                                  # the alt mempool, locally (third terminal)
npm run test:integration                                             # 38 integration tests
MOHAR_NET=public node signer/tools/ef2.ts                            # the alt mempool proof on the public devnet (needs devnet ETH)
cd dashboard && npm install && npm run build && ./serve.sh           # the dashboard on http://127.0.0.1:8088/
```

Secrets stay out of git: `.secrets/` (keys), `firmware/mohar/src/secrets.h` (Wi-Fi and a 0G key). Copy `secrets.example.h` and fill it in.
The 0G key flashed to a board must be a low-limit key, because flash is readable.

## How AI was used

This project was built with Claude Code (Anthropic) as a pair-programmer under human direction: the contracts, signer, firmware,
scripts, dashboard and documents were written and tested by Claude Code agents, with the human choosing the idea and the tracks,
supplying the hardware, doing the physical tests (power pulls, wiring) and reviewing results. At runtime the device uses 0G
Private Computer (`qwen3.8-flash`) to judge meter windows. Every decision is logged with its request ID.

## License

MIT. See [LICENSE](LICENSE).
