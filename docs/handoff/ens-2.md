# ENS-2 handoff

Network: Sepolia. Parent `mohar.eth` (ENS-1). Evidence: docs/evidence/ens-2.json (all tx hashes). Script: ens/02-machine.ts (resumable; reruns cost a little gas).

**Read path (for the dashboard):** call the Universal Resolver proxy `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe`: `resolve(bytes dnsName, bytes data) returns (bytes result, address resolver)`. `data` is `text(bytes32 node,string key)` (selector 0x59d1d43c) or `addr(bytes32 node,uint256 coinType)` (0xf1cb7e06), node = namehash(name). Text results are ABI-encoded `string`, addr results ABI-encoded `bytes` (20 raw bytes). Chain-1337 address: coin type `0x80000539`. `findResolver(bytes)` also works on it. **The public Sepolia RPC can serve state a few seconds old right after a write: retry reads.**

## Addresses
| Item | Value |
|---|---|
| Fleet registry | `0x53AD330F425412DCFFf888d58d7CB21f28BEeA01` |
| meter-001 resolver (its own) | `0x81407d1c7C9F482a1cDCC00110E7A0dAD374758a` |
| meter-002 resolver | `0xf37AaBEB5051DD2fE5934B0af464AaeE4108d03E` |
| owner / operator | `0xcfb296f635254A4B3281D2e285174E98D643Ef60` |
| maintenance key (only mohar.maintenance.status) | `0xFA129F48deF75d7d870e2F60142dc56a906D5391` (private key in .secrets/ens-maintenance.key) |
| uploader key (only mohar.log) | `0x4ab4b0AFeEb0ED50a9B4A31aBDC09887Fc6e6AFf` (private key in .secrets/ens-uploader.key) |

meter-001 lease: 7 days from registration (expiry 1794556180, unix). Token id (label hash): 17290027328679010741964140994828050516707487482904385513452757343069989240832.

## Records on meter-001.mohar.eth (read back through the Universal Resolver)
PLACEHOLDER = must be replaced by the owner once real values exist (setText/setAddress on the meter-001 resolver, owner key).
| Key | Value |
|---|---|
| addr, coin type 0x80000539 | 0x1cd7ac2c28711039bdca389b94d101e22e6e90a5 **PLACEHOLDER** (a local-chain test account) |
| mohar.chainId | 1337 |
| mohar.ledger | 0xf480f92a9affd0c44ddf50281ee000a8f99e6e0a **PLACEHOLDER** (local chain) |
| mohar.paymaster | 0xe5aae3ab748602149c52daba4372f02b02e9022e **PLACEHOLDER** (local chain) |
| mohar.pq.scheme | wots-w16-h8-keccak256-v1 |
| mohar.pq.root | 0x6c0937ea06ed23562708791235b395d11e0888eccf5c6271fb79e4c254687701 (the board test key) |
| mohar.pq.pubSeed | 0x0a2886f4dcbaff6c44092ce15806b2c8 |
| mohar.policy | the exact 0G policy text (firmware zerog.cpp / signer/tools/0g-eval.ts) |
| mohar.deviceType | electricity-meter |
| mohar.capabilities | pulse-3200-imp-kwh,self-signed-reports,inspect-hold |
| mohar.tariff | 1000000000 wei per pulse |
| mohar.operator | 0xcfb296f635254A4B3281D2e285174E98D643Ef60 |
| mohar.maintenance.status | inspected 2026-11-06 (changed by the maintenance key in T2) |
| mohar.log | 0g://test-root-placeholder (changed by the uploader key in T4) |
| agent-context | text describing the meter (ENSIP-26) |
| agent-endpoint[web] | https://mohar.invalid/dashboard **PLACEHOLDER** |

## Tests (all real, on Sepolia)
| Test | Result |
|---|---|
| T1 | PASS: 15 text records and the 0x80000539 address read back through the Universal Resolver |
| T2 | PASS: the maintenance key set mohar.maintenance.status |
| T3 | PASS: the maintenance key editing mohar.pq.root is refused with `EACUnauthorizedAccountRoles` (0x4b27a133); the root is unchanged |
| T4 | PASS: the uploader key set mohar.log; editing mohar.policy is refused with the same error; policy unchanged |
| T5 | PASS: meter-002 resolver refuses the maintenance key (same error), also when it is given meter-001 name |
| T6 | PASS with a different error than the plan expected: transfer of meter-001 reverts with `TransferUnsafeUntilRegistryIsEmancipated` (0x54838f98), not `TransferDisallowed`. The name cannot be moved, but the stated reason is that the registry is not yet "emancipated"; do not claim a per-name no-transfer role |
| T7 | Observed: a name registered with a 100 s lease read REGISTERED before; after expiry it is AVAILABLE, ownerOf returns the zero address, resolution returns empty (0x), and re-registering simulates OK |
| T8 | PASS: the owner unregistered a test subname; status went REGISTERED to AVAILABLE |

## Things that were surprising
- The deployed Sepolia contracts are an older version than contracts-v2 head: name-based setters (setText(bytes name,string key,string value), setAddress(bytes,uint256,bytes)), `grantSetterRoles(bytes setter,address)` where the setter is an encoded setText call naming the one key to allow, and `initialize((address,uint256)[],bytes[])`.
- Role-scoped writes work as the track needs: one key can write exactly one record. Refusals are the real contract error, usable for the live demo.
- First run wrote to address zero because getResolver was read stale right after registration; fixed with retries.
- Leftover test names registered on mohar.eth: meter-002, lease-test (expired), temp-test (unregistered).
