// Episode log uploader. Reads a ledger's `Report` events, writes batches of records to 0G Storage, remembers progress.
// Holds no device keys: it only reads the chain and pays 0G gas from the deployer key.
// Usage: node uploader/upload.ts [--rpc URL] [--ledger 0x…] [--device name] [--batch-size 5] [--state path] [--dry]
// Chain-first design: the cursor in the state file is only a convenience. If it is lost or the process dies, the next
// run reads the chain again and continues. A batch that was uploaded but not recorded is detected by its root hash.
import fs from "node:fs";
import path from "node:path";
import type { Address } from "viem";
import { ETHREX_URL, rpc } from "../signer/src/devnet.ts";
import { balance, rootOf, uploadBytes } from "./zerog.ts";
import { batchBytes, readReports, toRecord, type Batch } from "./records.ts";
import { publishLogRoot } from "./ens-hook.ts";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const rpcUrl = arg("rpc", "http://127.0.0.1:18545")!;
const ledger = arg("ledger")?.toLowerCase() as Address | undefined;
if (!ledger) throw new Error("pass --ledger 0x… (the MachineLedger to log)");
const device = arg("device", "meter-001.mohar.eth")!;
const batchSize = Number(arg("batch-size", "5"));
const dry = process.argv.includes("--dry");
const statePath = arg("state", path.resolve(import.meta.dirname, `../.state/uploader-${ledger}.json`))!;

type State = { ledger: string; lastSeq: number; batches: { root: string; txHash: string; fromSeq: number; toSeq: number; at: string }[] };
const load = (): State => (fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { ledger, lastSeq: 0, batches: [] });
const save = (s: State) => {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmp = statePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, statePath); // atomic: a crash never leaves half a state file
};
// Test hooks for 0G4-T5: die at an exact point, as a power cut or kill would.
const crashAfter = process.env.UPLOADER_CRASH; // "after_upload" | "after_state"

const state = load();
const chainId = Number(BigInt(await rpc<string>("eth_chainId", [], rpcUrl)));
const reports = await readReports(rpcUrl, ledger, state.lastSeq);
console.log(`ledger ${ledger} on chain ${chainId}: ${reports.length} reports after seq ${state.lastSeq}`);
if (!reports.length) process.exit(0);

const startBalance = dry ? 0n : await balance();
for (let i = 0; i < reports.length; i += batchSize) {
  const slice = reports.slice(i, i + batchSize);
  const records = [];
  for (const r of slice) records.push(await toRecord(rpcUrl, device, ledger, r));
  const batch: Batch = { schema: "mohar-episode-log/1", device, ledger, chainId, fromSeq: slice[0].seq, toSeq: slice.at(-1)!.seq, records };
  const bytes = batchBytes(batch);
  const root = await rootOf(bytes);
  if (dry) { console.log(`dry run: batch ${batch.fromSeq}..${batch.toSeq}, ${bytes.length} bytes, root ${root}`); continue; }

  const known = state.batches.find((b) => b.root === root);
  if (known) {
    // Uploaded earlier but the cursor never advanced (a crash between the two): same bytes, same root. Just move on.
    console.log(`batch ${batch.fromSeq}..${batch.toSeq} already stored as ${root}; advancing the cursor`);
  } else {
    const up = await uploadBytes(bytes);
    if (up.root !== root) throw new Error(`root mismatch: expected ${root}, 0G returned ${up.root}`);
    console.log(`uploaded seq ${batch.fromSeq}..${batch.toSeq} (${bytes.length} bytes): root ${up.root}, tx ${up.txHash}`);
    state.batches.push({ root: up.root, txHash: up.txHash, fromSeq: batch.fromSeq, toSeq: batch.toSeq, at: new Date().toISOString() });
    if (crashAfter === "after_upload") { console.log("CRASH after upload, before the cursor was saved"); process.exit(1); }
    await publishLogRoot(device, up.root);
  }
  state.lastSeq = batch.toSeq;
  save(state);
  if (crashAfter === "after_state") { console.log("CRASH after the cursor was saved"); process.exit(1); }
}
if (!dry) {
  const spent = startBalance - (await balance());
  console.log(`done. newest root ${state.batches.at(-1)?.root}. gas paid this run: ${Number(spent) / 1e18} 0G`);
}
