// Writes firmware/vectors/tx.json: what the firmware must produce for each report transaction, taken from the
// @forshtat/hegota-support library. Each case lists the console command and the expected outputs.
// Usage: node signer/tools/make-tx-vectors.ts
import fs from "node:fs";
import path from "node:path";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { toWire } from "@forshtat/hegota-support/rpc";
import { buildTx, digestOf, encodeReport, hashOf, rawTx, steps, DEVICE_STEP_LIMIT, type Report } from "../src/mohar.ts";
import { WotsKey, toHex } from "../src/wots.ts";
import { signTx } from "../src/mohar.ts";
import type { Address, Hex } from "viem";

// The firmware tests use this seed's key (firmware/vectors/wots.json), so signed bytes can be compared too.
const testKey = new WotsKey(keccak_256(new TextEncoder().encode("mohar device test seed v1")));
const addr = (label: string) => toHex(keccak_256(new TextEncoder().encode(label)).slice(0, 20)) as Address;
const sender = addr("vector sender"), ledger = addr("vector ledger"), paymaster = addr("vector paymaster");
const patternSig = toHex(Uint8Array.from({ length: 2400 }, (_, i) => (i * 13 + 5) & 255)) as Hex;
const hexNo0x = (h: string) => h.replace(/^0x/, "");

type Case = { name: string; nonce: bigint; prio: bigint; maxFee: bigint; report: Report };
const rid = (n: number) => "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-_.:"
  .repeat(2).slice(0, n);
const sensorsOf = (i: number) => toHex(keccak_256(new Uint8Array([i]))) as Hex;

const nonces = [1n, 2n, 127n, 128n, 129n, 255n, 256n];
const idLens = [0, 16, 36, 64];
const feePairs: [bigint, bigint][] = [
  [1_000_000n, 2_000_000_000n], [0n, 7n], [1n, 127n], [127n, 128n], [128n, 255n], [255n, 256n], [256n, 65_535n], [65_535n, 65_536n],
  [2n ** 32n, 2n ** 40n], [2n ** 63n, 2n ** 64n - 1n],
];
const cases: Case[] = [];
let i = 0;
for (const nonce of nonces) {
  for (const len of idLens) {
    const [prio, maxFee] = feePairs[i % feePairs.length];
    cases.push({
      name: `nonce ${nonce}, request id ${len} bytes, fees ${prio}/${maxFee}`,
      nonce, prio, maxFee,
      report: { seq: BigInt(i + 1), total: BigInt(i * 1000), mode: i % 4, reason: (i * 37) % 256, confidence: (i * 11) % 101, model: i % 3, salt: 0, sensors: sensorsOf(i), requestId: rid(len) },
    });
    i++;
  }
}
cases.push({ name: "maximum field values", nonce: 255n, prio: 2n ** 64n - 1n, maxFee: 2n ** 64n - 1n, report: { seq: 2n ** 64n - 1n, total: 2n ** 64n - 1n, mode: 3, reason: 255, confidence: 100, model: 255, salt: 0xffffffff, sensors: `0x${"ff".repeat(32)}`, requestId: rid(64) } });
cases.push({ name: "all zero except nonce", nonce: 1n, prio: 0n, maxFee: 0n, report: { seq: 0n, total: 0n, mode: 0, reason: 0, confidence: 0, model: 0, salt: 0, sensors: `0x${"00".repeat(32)}`, requestId: "" } });

// A case whose first digest needs more than 630 verifier steps, so the salt must change.
const guardBase: Report = { seq: 9n, total: 0n, mode: 0, reason: 0, confidence: 0, model: 0, salt: 0, sensors: sensorsOf(99), requestId: "" };
let guardTotal = 0n;
for (; guardTotal < 2_000_000n; guardTotal++) {
  const t = buildTx({ account: sender, nonce: 7n, target: ledger, data: encodeReport({ ...guardBase, total: guardTotal }), paymaster, fees: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n } });
  if (steps(t) > DEVICE_STEP_LIMIT) break;
}
cases.push({ name: "step guard: first digest above 630 steps", nonce: 7n, prio: 1_000_000n, maxFee: 2_000_000_000n, report: { ...guardBase, total: guardTotal } });

const out = cases.map((c) => {
  // The device's guard: raise the salt until the digest fits.
  let report = c.report;
  const make = (r: Report) => buildTx({ account: sender, nonce: c.nonce, target: ledger, data: encodeReport(r), paymaster, fees: { maxFeePerGas: c.maxFee, maxPriorityFeePerGas: c.prio } });
  let tx = make(report);
  const firstSteps = steps(tx);
  while (steps(tx) > DEVICE_STEP_LIMIT) { report = { ...report, salt: (report.salt + 1) >>> 0 }; tx = make(report); }
  const withSig = { ...tx, signatures: [{ ...tx.signatures[0], signature: patternSig }] };
  const args = [hexNo0x(sender), hexNo0x(ledger), hexNo0x(paymaster), c.nonce, c.prio, c.maxFee, c.report.seq, c.report.total, c.report.mode, c.report.reason, c.report.confidence, c.report.model, c.report.salt, hexNo0x(c.report.sensors), c.report.requestId ? Buffer.from(c.report.requestId).toString("hex") : "-"];
  return {
    name: c.name,
    command: args.join(" "),
    firstSteps,
    expect: {
      steps: steps(tx),
      salt: report.salt,
      calldata: hexNo0x(encodeReport(report)),
      digest: hexNo0x(toHex(digestOf(tx))),
      raw: hexNo0x(rawTx(withSig)),
      json: toWire(withSig),
      txHash: hashOf(withSig),
      // Signed with the test key at leaf nonce-1. Only valid for the test seed.
      signedRaw: hexNo0x(rawTx(signTx(tx, testKey))),
    },
  };
});
const file = path.resolve(import.meta.dirname, "../../firmware/vectors/tx.json");
fs.writeFileSync(file, JSON.stringify({ description: "Report transaction vectors. `command` is the dev console's build arguments; signature is the stand-in pattern byte i = (i*13+5)&255.", sender, ledger, paymaster, cases: out }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 1) + "\n");
console.log(`${out.length} tx vectors; ${out.filter((o) => o.firstSteps > DEVICE_STEP_LIMIT).length} need the step guard (guard case total=${guardTotal}); raw sizes ${Math.min(...out.map((o) => o.expect.raw.length / 2))}..${Math.max(...out.map((o) => o.expect.raw.length / 2))} bytes`);
