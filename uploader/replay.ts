// Replays an episode log: downloads a batch from 0G Storage (with proof verification), rebuilds every record from the
// chain, and compares. Anyone can run this; it needs no keys.
// Usage: node uploader/replay.ts --root 0x…           download from 0G Storage, then compare with the chain
//        node uploader/replay.ts --file batch.json     compare a local copy (to show an edited copy is caught)
//        add --rpc URL to use a different chain endpoint
import fs from "node:fs";
import type { Address } from "viem";
import { downloadBytes } from "./zerog.ts";
import { canonical, readReports, toRecord, type Batch } from "./records.ts";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const rpcUrl = arg("rpc", "http://127.0.0.1:18545")!;
const root = arg("root");
const file = arg("file");
if (!root && !file) throw new Error("pass --root 0x… or --file path");

const bytes = root ? await downloadBytes(root) : new Uint8Array(fs.readFileSync(file!));
if (root) console.log(`downloaded ${bytes.length} bytes from 0G Storage with proof verification`);
const batch = JSON.parse(new TextDecoder().decode(bytes)) as Batch;
if (batch.schema !== "mohar-episode-log/1") throw new Error(`unknown schema ${batch.schema}`);

const chain = await readReports(rpcUrl, batch.ledger as Address, batch.fromSeq - 1);
const bySeq = new Map(chain.map((r) => [r.seq, r]));
let mismatches = 0;
console.log(`\nepisode log for ${batch.device}, ledger ${batch.ledger}, seq ${batch.fromSeq}..${batch.toSeq}\n`);
for (const rec of batch.records) {
  const onChain = bySeq.get(rec.seq);
  let verdict = "MATCH";
  if (!onChain) verdict = "MISSING ON CHAIN";
  else {
    const rebuilt = await toRecord(rpcUrl, batch.device, batch.ledger as Address, onChain);
    if (canonical(rebuilt) !== canonical(rec)) {
      const fields = Object.keys(rebuilt).filter((k) => canonical((rebuilt as any)[k]) !== canonical((rec as any)[k]));
      verdict = `MISMATCH in ${fields.join(", ")}`;
    }
  }
  if (verdict !== "MATCH") mismatches++;
  const when = new Date(rec.timestamp * 1000).toISOString().slice(11, 19);
  console.log(
    `${when}  seq ${String(rec.seq).padStart(3)}  ${rec.selected_mode.padEnd(11)}  ${rec.meter.total_pulses.padStart(5)} pulses  ${String(rec.meter.avg_watts).padStart(5)} W  ` +
      `${rec.decision.reason.padEnd(26)}  rid ${(rec.request_id ?? "-").slice(0, 12).padEnd(12)}  ${verdict}`,
  );
}
const expected = batch.toSeq - batch.fromSeq + 1;
console.log(`\n${batch.records.length} records (${expected} expected by the seq range). ${mismatches === 0 && batch.records.length === expected ? "ALL MATCH THE CHAIN" : `${mismatches} PROBLEM(S)`}`);
process.exit(mismatches === 0 && batch.records.length === expected ? 0 : 1);
