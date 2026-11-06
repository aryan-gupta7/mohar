# ENS-2 handoff (partial, updated as work proceeds)

Network: Sepolia. Parent name `mohar.eth` (ENS-1). Fleet registry `0x53AD330F425412DCFFf888d58d7CB21f28BEeA01`, fleet resolver `0x7c0768Ca185865Ab3A10D65e5CFD8Fc29288B6ab`.
Read through the Universal Resolver proxy `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe`: `resolve(bytes dnsName, bytes data) returns (bytes result, address resolver)`, with `data` = `text(bytes32,string)` (0x59d1d43c) or `addr(bytes32,uint256)` (0xf1cb7e06) on `namehash(name)`. Text results are ABI-encoded strings.

## Addresses
| Item | Value |
|---|---|
| meter-001.mohar.eth resolver (its own) | `0x81407d1c7C9F482a1cDCC00110E7A0dAD374758a` |
| meter-002.mohar.eth resolver | `0xf37AaBEB5051DD2fE5934B0af464AaeE4108d03E` |
| owner (deployer) | `0xcfb296f635254A4B3281D2e285174E98D643Ef60` |
| maintenance / uploader keys | throwaway, in `.secrets/ens-maintenance.key`, `.secrets/ens-uploader.key`; addresses in docs/evidence/ens-2.json |

## Records (to be confirmed by the rerun; placeholders marked)
mohar.chainId=1337; mohar.ledger / mohar.paymaster / addr(coinType 0x80000539) = PLACEHOLDER local-chain test addresses, replace after EF-1/EF-2; mohar.pq.scheme=wots-w16-h8-keccak256-v1; mohar.pq.root=0x6c0937ea…7701; mohar.pq.pubSeed=0x0a2886f4dcbaff6c44092ce15806b2c8; mohar.policy=(the 0G policy text); mohar.deviceType=electricity-meter; mohar.capabilities; mohar.tariff=1000000000 wei per pulse; mohar.operator=owner; mohar.maintenance.status; mohar.log; agent-context; agent-endpoint[web]=PLACEHOLDER https://mohar.invalid/dashboard.

## Status
First run wrote records to address zero (stale RPC read of getResolver right after registration), so T1-T4 results from it are void. Rerun in progress.
