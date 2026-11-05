// Experiment E5: real validation gas for w=16 and w=4 on the client, across many digests.
// Implements both schemes independently of signer/src/wots.ts so the comparison can't depend on one setting.
import fs from "node:fs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, frame, newTx, sigHash } from "@forshtat/hegota-support/tx";
import { concat, encodeAbiParameters, type Address, type Hex } from "viem";
import { CHAIN_ID, ETHREX_URL, STAKING_REGISTRY, getNonce, rpc, sendLegacy } from "../src/devnet.ts";

const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let a = 0; for (const x of p) { o.set(x, a); a += x.length; } return o; };
const hx = (b: Uint8Array) => ("0x" + Buffer.from(b).toString("hex")) as Hex;
const artifact = (n: string) => JSON.parse(fs.readFileSync(new URL(`../../contracts/out/${n}.yul/${n}.json`, import.meta.url), "utf8")).bytecode.object as Hex;

class Scheme {
  logW: number; w: number; msg: number; cs: number; chains: number; h = 8; seed: Uint8Array; pub: Uint8Array; levels: Uint8Array[][] = [];
  constructor(logW: number, seedText: string) {
    this.logW = logW; this.w = 1 << logW; this.msg = 256 / logW; this.cs = logW === 4 ? 3 : 5; this.chains = this.msg + this.cs;
    this.seed = keccak_256(new TextEncoder().encode(seedText));
    this.pub = keccak_256(cat(this.seed, new Uint8Array(32).fill(0xff))).slice(0, 16);
    const leaves = []; for (let l = 0; l < 256; l++) leaves.push(this.leaf(l));
    this.levels = [leaves];
    for (let i = 0; i < this.h; i++) { const b = this.levels[i], a = []; for (let j = 0; j < b.length; j += 2) a.push(keccak_256(cat(b[j], b[j + 1]))); this.levels.push(a); }
  }
  tweak(leaf: number, chain: number, step: number) { const t = new Uint8Array(32); t.set(this.pub, 0); const v = new DataView(t.buffer); v.setUint32(16, leaf); v.setUint32(20, chain); v.setUint32(28, step); return t; }
  sk(leaf: number, chain: number) { const i = new Uint8Array(64); i.set(this.seed, 0); const v = new DataView(i.buffer); v.setUint32(32, leaf); v.setUint32(36, chain); return keccak_256(i); }
  walk(s: Uint8Array, leaf: number, chain: number, from: number, to: number) { let x = s; for (let t = from; t < to; t++) x = keccak_256(cat(x, this.tweak(leaf, chain, t))); return x; }
  leaf(l: number) { const pk = []; for (let c = 0; c < this.chains; c++) pk.push(this.walk(this.sk(l, c), l, c, 0, this.w - 1)); return keccak_256(cat(...pk)); }
  digits(d: Uint8Array) { const o: number[] = []; let csum = 0; const big = BigInt(hx(d)); for (let i = 0; i < this.msg; i++) { const x = Number((big >> BigInt(256 - this.logW * (i + 1))) & BigInt(this.w - 1)); o.push(x); csum += this.w - 1 - x; } for (let i = 0; i < this.cs; i++) o.push((csum >> (this.logW * (this.cs - 1 - i))) & (this.w - 1)); return o; }
  steps(d: Uint8Array) { return this.digits(d).reduce((s, x) => s + this.w - 1 - x, 0); }
  sign(d: Uint8Array, l: number) { const p: Uint8Array[] = []; this.digits(d).forEach((x, c) => p.push(this.walk(this.sk(l, c), l, c, 0, x))); let i = l; for (let k = 0; k < this.h; k++) { p.push(this.levels[k][i ^ 1]); i >>= 1; } return cat(...p); }
  get root() { return this.levels[this.h][0]; }
  get pubWord() { const w = new Uint8Array(32); w.set(this.pub, 0); return w; }
}

const sink = (await sendLegacy({ to: null, data: artifact("Sink"), gas: 1_000_000n })).receipt.contractAddress as Address;
const SELECTOR = 0x969b1cdbn;

async function run(name: string, logW: number, samples: number) {
  const key = new Scheme(logW, `compare ${name} ${Date.now()}`);
  const args = encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }], [hx(key.root), hx(key.pubWord), sink, SELECTOR, STAKING_REGISTRY, 0n, 86400n]);
  const dep = await sendLegacy({ to: null, data: concat([artifact(name), args]), value: 10n ** 17n, gas: 5_000_000n });
  if (dep.receipt.status !== "0x1") throw new Error("deploy reverted");
  const account = dep.receipt.contractAddress as Address;
  const nonce = await getNonce(account);
  const rows: { steps: number; gas: number }[] = [];
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const data = concat(["0x969b1cdb", encodeAbiParameters([{ type: "uint256" }], [BigInt(i)])]);
    const tx = newTx({ chainId: CHAIN_ID, sender: account, nonceSeq: nonce, nonceKeys: [0n], fees: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n },
      signatures: [{ scheme: 0, signer: "0x", msg: "0x", signature: "0x" }],
      frames: [frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", execution: 99_900n }), frame(profile, "SENDER", { target: sink, execution: 50_000n, state: 100_000n, data })] });
    const d = Uint8Array.from(Buffer.from(sigHash(profile, tx).slice(2), "hex"));
    const signed = { ...tx, signatures: [{ ...tx.signatures[0], signature: hx(key.sign(d, Number(nonce) - 1)) }] };
    const r = await rpc("ethrex_simulateFrameTransaction", [encodeTx(profile, signed), "latest", { trace: false }], ETHREX_URL);
    if (r.executionStatus !== "success" || !r.frames) throw new Error(`sim failed: ${JSON.stringify(r).slice(0, 400)}`);
    rows.push({ steps: key.steps(d), gas: Number(r.frames[0].gasUsed) });
    total = Number(BigInt(r.gasUsed));
  }
  const n = rows.length, sx = rows.reduce((a, r) => a + r.steps, 0), sy = rows.reduce((a, r) => a + r.gas, 0), sxx = rows.reduce((a, r) => a + r.steps ** 2, 0), sxy = rows.reduce((a, r) => a + r.steps * r.gas, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), base = (sy - slope * sx) / n;
  const gs = rows.map((r) => r.gas).sort((a, b) => a - b), ss = rows.map((r) => r.steps).sort((a, b) => a - b);
  console.log(`${name}: w=${key.w} chains=${key.chains} sigBytes=${(key.chains + 8) * 32} runtime=${(((await rpc<string>("eth_getCode", [account, "latest"])).length - 2) / 2)}B samples=${n}`);
  console.log(`  verify gas: min ${gs[0]} avg ${Math.round(sy / n)} max ${gs[n - 1]}; steps: min ${ss[0]} avg ${Math.round(sx / n)} max ${ss[n - 1]}; fit gas = ${Math.round(base)} + ${slope.toFixed(1)} per step`);
  console.log(`  total tx gas (last sample): ${total}`);
  console.log(`  hashes: sign worst ${key.chains * (key.w - 1)}, keygen 256 leaves ${256 * key.chains * (key.w - 1)}`);
}
await run("MoharAccount", 4, 60);
await run("MoharAccountW4", 2, 60);
