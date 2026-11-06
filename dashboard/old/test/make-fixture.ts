// Test fixture for the dashboard: a ledger on the local chain whose machine is an ordinary key, with an INSPECT report
// (so the hold is set) and a RUN report before it. No device key involved. Prints the ledger address.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData } from "viem";
import { deployerAddress, sendLegacy } from "../../signer/src/devnet.ts";
import { LEDGER_ABI, deployLedger, encodeReport, MODE } from "../../signer/src/mohar.ts";
const key = generatePrivateKey(); const machine = privateKeyToAccount(key).address;
const ledger = await deployLedger({ owner: deployerAddress(), operator: deployerAddress(), tariffWeiPerPulse: 1_000_000_000n });
const tx = async (data: any, o: any = {}) => { const { receipt } = await sendLegacy({ to: ledger, data, ...o }); if (receipt.status !== "0x1") throw new Error("reverted"); };
await sendLegacy({ to: machine, value: 10n ** 17n });
await tx(encodeFunctionData({ abi: LEDGER_ABI, functionName: "bindMachine", args: [machine] }));
await tx(encodeFunctionData({ abi: LEDGER_ABI, functionName: "topUp" }), { value: 500n * 1_000_000_000n });
// sensors word: 120 pulses, 4 glitches, 1 stuck-low, avg 3000 W, peak 3300 W, window 60000 ms, longest gap 2500 ms, cumulative 120
const be = (n: number, bytes: number) => n.toString(16).padStart(bytes * 2, "0");
const sensors = ("0x" + be(120, 4) + be(4, 2) + be(1, 2) + be(3000, 2) + be(3300, 2) + be(60000, 4) + be(2500, 4) + be(0, 4) + be(120, 4) + "00000000") as `0x${string}`;
const send = (seq: bigint, total: bigint, mode: number, reason: number, rid: string) =>
  sendLegacy({ to: ledger, key, data: encodeReport({ seq, total, mode, reason, confidence: 0, model: rid ? 1 : 0, salt: 0, sensors, requestId: rid }) });
await send(1n, 60n, MODE.RUN, 0, "11111111-2222-3333-4444-555555555555");
await send(2n, 120n, MODE.INSPECT, 2, "");
console.log(JSON.stringify({ ledger, machine, sensors }));
