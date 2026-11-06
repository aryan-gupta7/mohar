# Mohar

**A prepaid electricity meter that signs its own readings.**

An ESP8266 counts the pulses of a meter's impulse output, asks an AI (0G) whether the readings look normal, signs its own
report with a hash-based key, and submits it to Ethereum through the ERC-8421 alternative mempool. A ledger contract keeps
credit, arrears and inspection holds. The meter has a name on ENS (`meter-001.mohar.eth`). There is **no application backend,
no custodial signer and no relayer**: the only things between the device and the chain are Wi-Fi and a public RPC.

Built for ETHGlobal Mumbai 2026. Tracks: Ethereum Foundation (alternative mempool), ENS (ENSv2), 0G (Physical AI).

> **What is real and what is simulated.** The electricity meter is simulated: a Raspberry Pi Pico H generates the pulse train a
> real meter's impulse output would, at 3,200 pulses per kWh. Everything after the pulse wire is real hardware and a real network:
> the ESP8266 counts the pulses, calls 0G, signs and sends. Nothing measures real electricity and **nothing disconnects a supply**:
> running out of credit is recorded as arrears, not enforced.

## How a report happens

1. The Pico (a simulated meter) pulls GP0 low for 30 ms per pulse. The ESP8266 counts them on D6.
2. Every checkpoint the ESP8266 closes a window of pulses, reads the ledger, and runs fixed checks (peak load, glitches, stuck line).
3. It asks 0G (`qwen3.8-flash`, reasoning off) `RUN` or `INSPECT`. Anything other than those exact words is "no decision", and no decision means `SAFE_STOP`.
4. It picks the most cautious of its own checks, the AI answer and the ledger's state (a hold, or credit that can't cover a pulse). **AI can only add caution: it cannot clear a hold or override credit.**
5. It signs the report with a one-time key (WOTS-like, Keccak, 256 keys under a Merkle root), after saving its intent to flash, and sends it.
6. `MoharAccount` verifies the signature and only allows reports to one ledger. `QuotaPaymaster` pays the gas within a quota. `MachineLedger` records pulses, charges credit, keeps arrears, and holds on `INSPECT`.

## What was proven, and where

| Claim | Evidence |
|---|---|
| A WOTS-signed frame transaction is mined on the **public EF devnet** | [docs/evidence/ef-1.json](docs/evidence/ef-1.json) |
| The canonical mempool refuses the transaction (`StorageReadNonSender`) and the alt mempool admits **the same bytes**; four frames succeed, the account pays nothing | [docs/evidence/ef-2-public.json](docs/evidence/ef-2-public.json) |
| The ESP8266 builds, signs and sends its own transactions; survives power loss without reusing a key | [mechanism.md](mechanism.md) sections 7b and 12, three real power pulls |
| Real 0G decisions from the board, with request IDs, drive the device's state | [docs/evidence/live-run-public.json](docs/evidence/live-run-public.json) |
| Machine identity and key-scoped permissions on ENSv2 (Sepolia) | [docs/evidence/ens-2.json](docs/evidence/ens-2.json) |
| An episode log on 0G Storage with proof-verified replay | [docs/evidence/0g-4.json](docs/evidence/0g-4.json) |

[mechanism.md](mechanism.md) explains how each part works and what was measured. [dev-plan.md](dev-plan.md) has every phase with its
tests and results. [update-log.md](update-log.md) is the dated record of what happened, including the mistakes.

## Honest limits

- **The signature scheme is custom and unaudited.** It follows the Winternitz one-time idea with a Merkle tree, but it is not LMS, XMSS or WOTS+. Do not protect anything valuable with it.
- ESP8266 flash is readable: anyone holding the board can extract the seed.
- 256 signatures per key. There is no key migration.
- Sensor readings are simulated, and a signature proves that the key signed, not that the reading is true.
- EIP-8141 and ERC-8421 are drafts and run only on the devnet. ENS is on Sepolia; the Mohar contracts are on the EF devnet. ENS permissions control ENS records only, not the devnet contracts.
- The TLS connection does not yet verify the server's certificate (a signed transaction can't be altered by a network attacker, but reads could be spoofed).
- The 0G model's answer carries no confidence value; the ledger's `confidence` field is 0.

## Layout

| Folder | Contents |
|---|---|
| `contracts/` | `MoharAccount` and `QuotaPaymaster` in Yul, `MachineLedger` in Solidity |
| `signer/` | the TypeScript signer, tests, and the scripts that produced the evidence |
| `firmware/mohar/` | the ESP8266 firmware (PlatformIO) · `firmware/pico-meter/` the simulated meter (CircuitPython) |
| `ens/` | ENS scripts for Sepolia · `uploader/` the 0G Storage log and replay |
| `dashboard/` | the Mohar Console (static site) |
| `devnet/` | a local copy of the devnet and the alt mempool sidecar for development |
| `docs/` | evidence, the event protocol, notes |

## Run it

Needs Node 23.6+, Foundry (it provides solc 0.8.28), Docker and PlatformIO. Full manual tests with expected output are in
[mechanism.md](mechanism.md) section 12.

```sh
npm install --ignore-scripts && npm run build && npm test          # signer and contracts
./devnet/up.sh && node devnet/producer.ts 1                          # a local chain (second terminal)
./devnet/sidecar.sh                                                  # the alt mempool, locally (third terminal)
npm run test:integration                                             # 38 integration tests
MOHAR_NET=public node signer/tools/ef2.ts                            # the alt mempool proof on the public devnet (needs devnet ETH)
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
