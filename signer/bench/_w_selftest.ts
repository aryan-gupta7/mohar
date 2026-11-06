import { keccak_256 } from "@noble/hashes/sha3.js";
import { Params, WotsKeyW, recoverRootW } from "../src/wots_w.ts";
import { WotsKey, recoverRoot } from "../src/wots.ts";
const seed = keccak_256(new TextEncoder().encode("selftest"));
for (const w of [16, 32]) {
  const p = new Params(w); const k = new WotsKeyW(seed, p);
  const d = keccak_256(new TextEncoder().encode("digest"));
  const sig = k.sign(d, 5);
  console.log(`w=${w}: chains ${p.chains} (${p.msgChains}+${p.csumChains}), signature ${p.sigBytes} B, recovers root: ${Buffer.from(recoverRootW(p, d, 5, sig, k.pubSeed)).equals(Buffer.from(k.root))}`);
}
// w=16 must equal the tested implementation exactly
const a = new WotsKey(seed), b = new WotsKeyW(seed, new Params(16)), d = keccak_256(new Uint8Array([9]));
console.log("w=16 generic equals the tested signer byte for byte:", Buffer.from(a.sign(d, 3)).equals(Buffer.from(b.sign(d, 3))), Buffer.from(a.root).equals(Buffer.from(b.root)));
