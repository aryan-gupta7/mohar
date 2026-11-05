// WOTS-like one-time signatures under a Merkle tree. This must match contracts/src/MoharAccount.yul and the
// firmware byte for byte. It's a custom, unaudited construction, not LMS, XMSS or WOTS+.
import { keccak_256 } from "@noble/hashes/sha3.js";

export const N = 32;
export const W = 16;
export const MSG_CHAINS = 64;
export const CHECKSUM_CHAINS = 3;
export const CHAINS = MSG_CHAINS + CHECKSUM_CHAINS;
export const HEIGHT = 8;
export const LEAVES = 1 << HEIGHT;
export const SIG_BYTES = (CHAINS + HEIGHT) * N; // 2,400

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export const toHex = (b: Uint8Array): `0x${string}` => `0x${Buffer.from(b).toString("hex")}`;
export const fromHex = (h: string): Uint8Array => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));

/** 64 message digits, most significant nibble first, then the checksum as 3 nibbles. */
export function digits(digest: Uint8Array): number[] {
  if (digest.length !== N) throw new Error("digest must be 32 bytes");
  const out: number[] = [];
  let csum = 0;
  for (const byte of digest) {
    for (const d of [byte >> 4, byte & 15]) {
      out.push(d);
      csum += W - 1 - d;
    }
  }
  out.push((csum >> 8) & 15, (csum >> 4) & 15, csum & 15);
  return out;
}

/** Hash steps a verifier needs for this digest. Each one costs validation gas. */
export const verifySteps = (digest: Uint8Array): number => digits(digest).reduce((sum, d) => sum + (W - 1 - d), 0);
/** Hash steps a signer needs for this digest. */
export const signSteps = (digest: Uint8Array): number => digits(digest).reduce((sum, d) => sum + d, 0);

/** pubSeed (16) | leaf (4) | chain (4) | step (8), big-endian: the second word of every chain hash. */
function tweak(pubSeed: Uint8Array, leaf: number, chain: number, step: number): Uint8Array {
  const t = new Uint8Array(N);
  t.set(pubSeed, 0);
  const view = new DataView(t.buffer);
  view.setUint32(16, leaf);
  view.setUint32(20, chain);
  view.setUint32(28, step); // the top 4 bytes of the step field stay zero
  return t;
}

const walk = (start: Uint8Array, pubSeed: Uint8Array, leaf: number, chain: number, from: number, to: number): Uint8Array => {
  let v = start;
  for (let step = from; step < to; step++) v = keccak_256(concat(v, tweak(pubSeed, leaf, chain, step)));
  return v;
};

export class WotsKey {
  readonly seed: Uint8Array;
  readonly pubSeed: Uint8Array;
  /** levels[0] holds leaf hashes; the last level holds the root. */
  readonly levels: Uint8Array[][];

  constructor(seed: Uint8Array) {
    if (seed.length !== N) throw new Error("seed must be 32 bytes");
    this.seed = seed;
    this.pubSeed = keccak_256(concat(seed, new Uint8Array(N).fill(0xff))).slice(0, 16);
    const leaves: Uint8Array[] = [];
    for (let leaf = 0; leaf < LEAVES; leaf++) leaves.push(this.leafHash(leaf));
    this.levels = [leaves];
    for (let level = 0; level < HEIGHT; level++) {
      const below = this.levels[level];
      const above: Uint8Array[] = [];
      for (let i = 0; i < below.length; i += 2) above.push(keccak_256(concat(below[i], below[i + 1])));
      this.levels.push(above);
    }
  }

  get root(): Uint8Array {
    return this.levels[HEIGHT][0];
  }

  /** Word used by the contract: pubSeed in the high 16 bytes. */
  get pubSeedWord(): Uint8Array {
    const w = new Uint8Array(N);
    w.set(this.pubSeed, 0);
    return w;
  }

  private secret(leaf: number, chain: number): Uint8Array {
    const input = new Uint8Array(64);
    input.set(this.seed, 0);
    const view = new DataView(input.buffer);
    view.setUint32(32, leaf);
    view.setUint32(36, chain);
    return keccak_256(input);
  }

  private leafHash(leaf: number): Uint8Array {
    const pk: Uint8Array[] = [];
    for (let chain = 0; chain < CHAINS; chain++) pk.push(walk(this.secret(leaf, chain), this.pubSeed, leaf, chain, 0, W - 1));
    return keccak_256(concat(...pk));
  }

  /** Signs one digest with one key. Callers must never sign two different digests with the same leaf. */
  sign(digest: Uint8Array, leaf: number): Uint8Array {
    if (!Number.isInteger(leaf) || leaf < 0 || leaf >= LEAVES) throw new Error(`leaf ${leaf} out of range`);
    const parts: Uint8Array[] = [];
    digits(digest).forEach((d, chain) => parts.push(walk(this.secret(leaf, chain), this.pubSeed, leaf, chain, 0, d)));
    let idx = leaf;
    for (let level = 0; level < HEIGHT; level++) {
      parts.push(this.levels[level][idx ^ 1]);
      idx >>= 1;
    }
    return concat(...parts);
  }
}

/** Off-chain copy of the contract's check. Returns the Merkle root the signature leads to. */
export function recoverRoot(digest: Uint8Array, leaf: number, signature: Uint8Array, pubSeed: Uint8Array): Uint8Array {
  if (signature.length !== SIG_BYTES) throw new Error(`signature must be ${SIG_BYTES} bytes`);
  const pk: Uint8Array[] = [];
  digits(digest).forEach((d, chain) => {
    const value = signature.slice(chain * N, (chain + 1) * N);
    pk.push(walk(value, pubSeed, leaf, chain, d, W - 1));
  });
  let node = keccak_256(concat(...pk));
  let idx = leaf;
  for (let level = 0; level < HEIGHT; level++) {
    const sibling = signature.slice((CHAINS + level) * N, (CHAINS + level + 1) * N);
    node = idx & 1 ? keccak_256(concat(sibling, node)) : keccak_256(concat(node, sibling));
    idx >>= 1;
  }
  return node;
}
