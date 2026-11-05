import test from "node:test";
import assert from "node:assert/strict";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { CHAINS, HEIGHT, LEAVES, N, SIG_BYTES, W, WotsKey, digits, recoverRoot, signSteps, verifySteps, toHex } from "../src/wots.ts";

const seed = keccak_256(new TextEncoder().encode("mohar test seed"));
const key = new WotsKey(seed);
const digest = keccak_256(new TextEncoder().encode("a transaction"));
const same = (a: Uint8Array, b: Uint8Array) => toHex(a) === toHex(b);

test("parameters match the contract's fixed sizes", () => {
  assert.equal(CHAINS, 67);
  assert.equal(HEIGHT, 8);
  assert.equal(LEAVES, 256);
  assert.equal(SIG_BYTES, 2400);
});

test("a valid signature leads back to the root, for first, middle and last keys", () => {
  for (const leaf of [0, 1, 37, 128, 255]) {
    const sig = key.sign(digest, leaf);
    assert.equal(sig.length, SIG_BYTES);
    assert.ok(same(recoverRoot(digest, leaf, sig, key.pubSeed), key.root), `leaf ${leaf}`);
  }
});

test("a signature fails against a different digest", () => {
  const sig = key.sign(digest, 5);
  const other = keccak_256(new TextEncoder().encode("another transaction"));
  assert.ok(!same(recoverRoot(other, 5, sig, key.pubSeed), key.root));
});

test("a signature fails under the wrong leaf index", () => {
  const sig = key.sign(digest, 5);
  assert.ok(!same(recoverRoot(digest, 6, sig, key.pubSeed), key.root));
});

test("changing any single byte of the signature breaks it", () => {
  const sig = key.sign(digest, 9);
  for (const at of [0, 31, 32, N * 66, N * CHAINS, SIG_BYTES - 1]) {
    const bad = sig.slice();
    bad[at] ^= 0x01;
    assert.ok(!same(recoverRoot(digest, 9, bad, key.pubSeed), key.root), `byte ${at}`);
  }
});

test("a different seed gives a different root", () => {
  const other = new WotsKey(keccak_256(new TextEncoder().encode("another seed")));
  assert.ok(!same(other.root, key.root));
});

test("the checksum stops an attacker walking chains forward", () => {
  // Raising any message digit means walking that chain forward, which an attacker can do from a signature.
  // The checksum falls by the same amount, and walking a checksum chain backward requires inverting the hash.
  const low = new Uint8Array(N).fill(0x00);
  const higher = low.slice();
  higher[0] = 0x10;
  const csum = (d: Uint8Array) => { const x = digits(d); return (x[64] << 8) | (x[65] << 4) | x[66]; };
  assert.ok(csum(higher) < csum(low));
});

test("digit extremes are handled", () => {
  const zero = new Uint8Array(N).fill(0x00);
  const ones = new Uint8Array(N).fill(0xff);
  assert.equal(verifySteps(ones), 15 * 3 - (0 + 0 + 0)); // all message digits are 15, so only the checksum chains walk
  assert.equal(signSteps(ones), 15 * 64);
  assert.deepEqual(digits(zero).slice(64), [(960 >> 8) & 15, (960 >> 4) & 15, 960 & 15]);
  for (const d of [zero, ones]) {
    const sig = key.sign(d, 3);
    assert.ok(same(recoverRoot(d, 3, sig, key.pubSeed), key.root));
  }
  assert.equal(W, 16);
});

test("out of range leaves are refused", () => {
  assert.throws(() => key.sign(digest, 256));
  assert.throws(() => key.sign(digest, -1));
  assert.throws(() => key.sign(digest, 1.5));
});
