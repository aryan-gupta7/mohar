// Winternitz parameter w as a variable, for the size-versus-cost experiments. The tested w=16 code stays in wots.ts.
// Same construction as wots.ts (same tweak layout, same Merkle tree); only the digit width changes.
import { keccak_256 } from "@noble/hashes/sha3.js";

const N = 32, HEIGHT = 8, LEAVES = 256;
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let a = 0; for (const x of p) { o.set(x, a); a += x.length; } return o; };

export class Params {
  readonly w: number; readonly bits: number; readonly msgChains: number; readonly csumChains: number; readonly chains: number; readonly sigBytes: number;
  constructor(w: number) {
    this.w = w;
    this.bits = Math.log2(w);
    if (!Number.isInteger(this.bits)) throw new Error("w must be a power of two");
    this.msgChains = Math.ceil(256 / this.bits);
    this.csumChains = Math.ceil(Math.ceil(Math.log2(this.msgChains * (w - 1) + 1)) / this.bits);
    this.chains = this.msgChains + this.csumChains;
    this.sigBytes = (this.chains + HEIGHT) * N;
  }
  /** Message digits, most significant bits first; the last one zero-padded on the right. Then the checksum digits. */
  digits(digest: Uint8Array): number[] {
    const out: number[] = [];
    let csum = 0;
    for (let i = 0; i < this.msgChains; i++) {
      let d = 0;
      for (let b = 0; b < this.bits; b++) {
        const bit = i * this.bits + b;
        d = (d << 1) | (bit < 256 ? (digest[bit >> 3] >> (7 - (bit & 7))) & 1 : 0);
      }
      out.push(d); csum += this.w - 1 - d;
    }
    for (let i = this.csumChains - 1; i >= 0; i--) out.push((csum >> (i * this.bits)) & (this.w - 1));
    return out;
  }
  verifySteps = (digest: Uint8Array) => this.digits(digest).reduce((s, d) => s + (this.w - 1 - d), 0);
  signSteps = (digest: Uint8Array) => this.digits(digest).reduce((s, d) => s + d, 0);
}

function tweak(pubSeed: Uint8Array, leaf: number, chain: number, step: number) {
  const t = new Uint8Array(N); t.set(pubSeed, 0);
  const v = new DataView(t.buffer); v.setUint32(16, leaf); v.setUint32(20, chain); v.setUint32(28, step);
  return t;
}
const walk = (start: Uint8Array, ps: Uint8Array, leaf: number, chain: number, from: number, to: number) => {
  let v = start; for (let s = from; s < to; s++) v = keccak_256(cat(v, tweak(ps, leaf, chain, s))); return v;
};

export class WotsKeyW {
  readonly seed: Uint8Array; readonly p: Params; readonly pubSeed: Uint8Array; readonly levels: Uint8Array[][];
  constructor(seed: Uint8Array, p: Params) {
    this.seed = seed; this.p = p;
    this.pubSeed = keccak_256(cat(seed, new Uint8Array(N).fill(0xff))).slice(0, 16);
    const leaves: Uint8Array[] = [];
    for (let leaf = 0; leaf < LEAVES; leaf++) {
      const pk: Uint8Array[] = [];
      for (let c = 0; c < p.chains; c++) pk.push(walk(this.secret(leaf, c), this.pubSeed, leaf, c, 0, p.w - 1));
      leaves.push(keccak_256(cat(...pk)));
    }
    this.levels = [leaves];
    for (let l = 0; l < HEIGHT; l++) { const b = this.levels[l], a: Uint8Array[] = []; for (let i = 0; i < b.length; i += 2) a.push(keccak_256(cat(b[i], b[i + 1]))); this.levels.push(a); }
  }
  get root() { return this.levels[HEIGHT][0]; }
  get pubSeedWord() { const w = new Uint8Array(N); w.set(this.pubSeed, 0); return w; }
  private secret(leaf: number, chain: number) { const i = new Uint8Array(64); i.set(this.seed, 0); const v = new DataView(i.buffer); v.setUint32(32, leaf); v.setUint32(36, chain); return keccak_256(i); }
  sign(digest: Uint8Array, leaf: number): Uint8Array {
    const parts = this.p.digits(digest).map((d, c) => walk(this.secret(leaf, c), this.pubSeed, leaf, c, 0, d));
    let idx = leaf; for (let l = 0; l < HEIGHT; l++) { parts.push(this.levels[l][idx ^ 1]); idx >>= 1; }
    return cat(...parts);
  }
}
export function recoverRootW(p: Params, digest: Uint8Array, leaf: number, sig: Uint8Array, pubSeed: Uint8Array): Uint8Array {
  const pk = p.digits(digest).map((d, c) => walk(sig.slice(c * N, (c + 1) * N), pubSeed, leaf, c, d, p.w - 1));
  let node = keccak_256(cat(...pk)), idx = leaf;
  for (let l = 0; l < HEIGHT; l++) { const sib = sig.slice((p.chains + l) * N, (p.chains + l + 1) * N); node = idx & 1 ? keccak_256(cat(sib, node)) : keccak_256(cat(node, sib)); idx >>= 1; }
  return node;
}
