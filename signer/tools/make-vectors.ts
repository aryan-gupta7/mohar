// Writes the expected values the firmware must reproduce byte for byte.
// Usage: node signer/tools/make-vectors.ts
// Output: firmware/vectors/report.json (DEV-3). DEV-4 and DEV-5 add Keccak, WOTS and transaction vectors.
import fs from "node:fs";
import path from "node:path";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { MODE, REPORT_SELECTOR, encodeReport, type Report } from "../src/mohar.ts";
import { toHex } from "../src/wots.ts";

const OUT = path.resolve(import.meta.dirname, "../../firmware/vectors");
fs.mkdirSync(OUT, { recursive: true });

const base: Report = { seq: 1n, total: 0n, mode: MODE.RUN, reason: 0, confidence: 0, model: 0, salt: 0, sensors: `0x${"00".repeat(32)}`, requestId: "" };
const cases: { name: string; report: Report }[] = [
  { name: "first report, all zero", report: base },
  { name: "normal reading", report: { ...base, seq: 2n, total: 1234n, confidence: 97, model: 1, sensors: toHex(keccak_256(new Uint8Array([2]))), requestId: "0123456789abcdef" } },
  { name: "inspect with uuid request id", report: { ...base, seq: 3n, total: 1300n, mode: MODE.INSPECT, reason: 3, confidence: 91, model: 1, salt: 7, requestId: "123e4567-e89b-12d3-a456-426614174000" } },
  { name: "safe stop, no decision", report: { ...base, seq: 4n, total: 1300n, mode: MODE.SAFE_STOP, reason: 20 } },
  { name: "credit stop", report: { ...base, seq: 5n, total: 1301n, mode: MODE.CREDIT_STOP, reason: 10 } },
  { name: "maximum field values, 64-byte request id", report: { seq: 2n ** 64n - 1n, total: 2n ** 64n - 1n, mode: 3, reason: 255, confidence: 100, model: 255, salt: 0xffffffff, sensors: `0x${"ff".repeat(32)}`, requestId: "z".repeat(64) } },
  { name: "request id of 31 bytes (one short of a word)", report: { ...base, seq: 6n, total: 1302n, requestId: "a".repeat(31) } },
  { name: "request id of 33 bytes (one over a word)", report: { ...base, seq: 7n, total: 1303n, requestId: "b".repeat(33) } },
];

const vectors = {
  description: "ABI-encoded MachineLedger.report calldata. The firmware must produce `calldata` exactly from the fields.",
  selector: `0x${REPORT_SELECTOR.toString(16)}`,
  signature: "report(uint64,uint64,uint8,uint8,uint8,uint8,uint32,bytes32,string)",
  cases: cases.map(({ name, report: r }) => ({
    name,
    fields: { ...r, seq: r.seq.toString(), total: r.total.toString() },
    calldata: encodeReport(r),
  })),
};
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(vectors, null, 2) + "\n");
console.log(`wrote ${vectors.cases.length} report vectors to firmware/vectors/report.json`);
