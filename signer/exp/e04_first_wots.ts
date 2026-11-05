// Experiment E4: the EF kill test. Send a real WOTS-signed frame transaction and have it mined.
// Usage: node signer/exp/e04_first_wots.ts
import fs from "node:fs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, frame, newTx, sigHash, txHash } from "@forshtat/hegota-support/tx";
import { concat, encodeAbiParameters, type Address, type Hex } from "viem";
import { CHAIN_ID, ETHREX_URL, NETWORK, STAKING_REGISTRY, deployerAddress, getBalance, getNonce, rpc, sendLegacy, waitMined } from "../src/devnet.ts";
import { WotsKey, fromHex, recoverRoot, toHex, verifySteps } from "../src/wots.ts";

const artifact = (name: string) =>
  JSON.parse(fs.readFileSync(new URL(`../../contracts/out/${name}.yul/${name}.json`, import.meta.url), "utf8")).bytecode.object as Hex;

console.log(`network: ${NETWORK}, deployer ${deployerAddress()}`);

const sink = await sendLegacy({ to: null, data: artifact("Sink"), gas: 1_000_000n });
if (sink.receipt.status !== "0x1") throw new Error("sink deploy reverted");
const target = sink.receipt.contractAddress as Address;
console.log(`target ${target}`);

const seed = keccak_256(new TextEncoder().encode(`mohar experiment ${Date.now()}`));
const key = new WotsKey(seed);
const selector = 0x969b1cdbn; // report(uint256), for this experiment
const args = encodeAbiParameters(
  [{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
  [toHex(key.root), toHex(key.pubSeedWord), target, selector, STAKING_REGISTRY, 0n, 86400n],
);
const deployed = await sendLegacy({ to: null, data: concat([artifact("MoharAccount"), args]), value: 10n ** 17n, gas: 3_000_000n });
if (deployed.receipt.status !== "0x1") throw new Error("account deploy reverted");
const account = deployed.receipt.contractAddress as Address;
const code = await rpc<Hex>("eth_getCode", [account, "latest"]);
const nonce = await getNonce(account);
console.log(`account ${account}: code ${(code.length - 2) / 2} bytes, nonce ${nonce}, balance ${Number(await getBalance(account)) / 1e18} ETH, deploy gas ${Number(deployed.receipt.gasUsed)}`);

function unsigned(nonceSeq: bigint, verifyGas: bigint, reading: bigint) {
  return newTx({
    chainId: CHAIN_ID, sender: account, nonceSeq, nonceKeys: [0n],
    fees: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n },
    signatures: [{ scheme: 0, signer: "0x", msg: "0x", signature: "0x" }],
    frames: [
      frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", execution: verifyGas }),
      frame(profile, "SENDER", { target, execution: 50_000n, state: 100_000n, data: concat(["0x969b1cdb", encodeAbiParameters([{ type: "uint256" }], [reading])]) }),
    ],
  });
}

function sign(tx: any, leaf: number) {
  const digest = fromHex(sigHash(profile, tx));
  const signature = key.sign(digest, leaf);
  const root = recoverRoot(digest, leaf, signature, key.pubSeed);
  if (toHex(root) !== toHex(key.root)) throw new Error("local verification failed");
  return { signed: { ...tx, signatures: [{ ...tx.signatures[0], signature: toHex(signature) }] }, digest };
}

const { signed, digest } = sign(unsigned(nonce, 99_900n, 1234n), Number(nonce) - 1);
console.log(`digest ${toHex(digest)}, verifier steps ${verifySteps(digest)}`);

const sim = await rpc("ethrex_simulateFrameTransaction", [encodeTx(profile, signed), "latest", { trace: false }], ETHREX_URL);
console.log("simulate:", JSON.stringify({
  canonical: sim.canonicalMempoolValid, violation: sim.canonicalMempoolViolation, shape: sim.prefixShape, status: sim.executionStatus,
  frames: sim.frames?.map((f: any) => ({ gas: Number(f.gasUsed), ok: f.succeeded })), error: sim.executionError, halt: sim.haltReason, frame: sim.failedFrameIndex, revert: sim.revertData,
}));

const hash = await rpc<Hex>("eth_sendRawTransaction", [encodeTx(profile, signed)]);
console.log(`sent ${hash} (local hash ${txHash(profile, signed)})`);
const receipt = await waitMined(hash);
console.log(`MINED block ${Number(receipt.blockNumber)} status ${receipt.status}, total gas ${Number(receipt.gasUsed)}`);
console.log("frame receipts:", JSON.stringify(receipt.frameReceipts?.map((f: any) => ({ status: f.status, gas: Number(f.gasUsed), state: Number(f.stateGasUsed), logs: f.logs?.length }))));
console.log(`nonce now ${await getNonce(account)}`);
