// Bench 0: what does a byte of calldata, a frame, and validation actually cost on this chain? Everything below is a measured
// simulation of the same report with one thing changed. Run: MOHAR_NET=local node signer/bench/b00_gas_model.ts
import { keccak_256 } from "@noble/hashes/sha3.js";
import { deployerAddress } from "../src/devnet.ts";
import { DEVICE_STEP_LIMIT, LEDGER_ABI, MODE, REPORT_SELECTOR, STAKE, buildTx, deployAccount, deployLedger, deployPaymaster, encodeReport, rawTx, signTx, simulate, steps } from "../src/mohar.ts";
import { WotsKey } from "../src/wots.ts";
import { encodeFunctionData } from "viem";
import { sendLegacy } from "../src/devnet.ts";
import { PAYMASTER_ABI } from "../src/mohar.ts";

const key = new WotsKey(keccak_256(new TextEncoder().encode("bench0 " + Date.now())));
const ledger = await deployLedger({ owner: deployerAddress(), operator: deployerAddress(), tariffWeiPerPulse: 1_000_000_000n });
const account = await deployAccount({ key, target: ledger, selector: REPORT_SELECTOR, stake: STAKE });
await sendLegacy({ to: ledger, data: encodeFunctionData({ abi: LEDGER_ABI, functionName: "bindMachine", args: [account] }) });
await sendLegacy({ to: ledger, data: encodeFunctionData({ abi: LEDGER_ABI, functionName: "topUp" }), value: 10n ** 16n });
const paymaster = await deployPaymaster({ stake: STAKE, funding: 10n ** 17n });
await sendLegacy({ to: paymaster, data: encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "setPolicy", args: [account, 100n, 3_000_000n] }) });

const zero = `0x${"00".repeat(32)}` as const, ones = `0x${"ff".repeat(32)}` as const;
async function gas(label: string, o: { id?: string; sensors?: `0x${string}`; total?: bigint }) {
  let salt = 0;
  const mk = () => buildTx({ account, nonce: 1n, target: ledger, paymaster, data: encodeReport({ seq: 1n, total: o.total ?? 5n, mode: 0, reason: 0, confidence: 0, model: 0, salt, sensors: o.sensors ?? zero, requestId: o.id ?? "" }) });
  let tx = mk();
  while (steps(tx) > DEVICE_STEP_LIMIT) { salt++; tx = mk(); }
  const signed = signTx(tx, key);
  const sim = await simulate(signed);
  const bytes = (rawTx(signed).length - 2) / 2;
  console.log(`${label.padEnd(34)} raw ${String(bytes).padStart(5)} B  total gas ${sim.gasUsed ? Number(sim.gasUsed) : "FAILED: " + sim.executionError}  frames ${(sim.frames ?? []).map((f) => Number(f.gasUsed)).join("/")}`);
  return { bytes, gas: Number(sim.gasUsed), frames: (sim.frames ?? []).map((f) => Number(f.gasUsed)) };
}
console.log("--- calldata: change only the request id length (zero bytes of padding are included)");
const a = await gas("request id 0 chars", { id: "" });
const b = await gas("request id 32 chars", { id: "x".repeat(32) });
const c = await gas("request id 64 chars", { id: "x".repeat(64) });
console.log(`   slope: ${((c.gas - a.gas) / (c.bytes - a.bytes)).toFixed(1)} gas per added raw byte (ids 0 to 64)`);
console.log("--- zero bytes versus non-zero bytes, same length");
const z = await gas("sensors word all zero", { sensors: zero });
const n = await gas("sensors word all 0xff", { sensors: ones });
console.log(`   difference all-0xff vs all-zero: ${n.gas - z.gas} gas for the same length (a zero-byte price would show here)`);
console.log("--- the fixed part: how much of total gas is NOT per-byte?");
const perByte = (c.gas - a.gas) / (c.bytes - a.bytes);
console.log(`   total ${a.gas} gas for ${a.bytes} bytes; if every byte cost ${perByte.toFixed(1)} that would be ${Math.round(perByte * a.bytes)}; frames' own execution ${a.frames.reduce((x, y) => x + y, 0)}`);
