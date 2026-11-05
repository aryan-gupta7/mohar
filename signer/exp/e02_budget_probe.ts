// Experiment E2: what does the live devnet actually enforce for the validation gas budget?
// Costs nothing: an unfunded sender can't be included, and we only read the verdicts.
// We submit a self-relay transaction with VERIFY limits below and above 100,000 and record each path's answer.
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, frame, newTx, secp256k1Placeholder, signTx } from "@forshtat/hegota-support/tx";
import { toWire } from "@forshtat/hegota-support/rpc";
import { CHAIN_ID, deployerAddress, deployerKey, ETHREX_URL, getBalance, getNonce, rpc } from "../src/devnet.ts";

const me = deployerAddress();
console.log(`sender ${me}, balance ${await getBalance(me)} wei, nonce ${await getNonce(me)}`);

const build = (verifyGas: bigint) =>
  signTx(
    profile,
    newTx({
      chainId: CHAIN_ID,
      sender: me,
      nonceSeq: 0n,
      fees: { maxFeePerGas: 2_000_000_000n },
      signatures: [secp256k1Placeholder(profile)],
      frames: [
        frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", execution: verifyGas }),
        frame(profile, "SENDER", { target: "0x8943545177806ED17B9F23F0a21ee5948eCaa776", execution: 50_000n, state: 200_000n, value: 1n }),
      ],
    }),
    deployerKey(),
  );

async function attempt(label: string, fn: () => Promise<unknown>) {
  try {
    console.log(`  ${label}: OK ${JSON.stringify(await fn()).slice(0, 900)}`);
  } catch (e: any) {
    console.log(`  ${label}: REJECTED code=${e.code} ${e.message}`);
  }
}

for (const gas of [30_000n, 97_100n, 97_200n, 100_001n, 150_000n, 300_000n, 2_000_000n]) {
  const tx = await build(gas);
  const raw = encodeTx(profile, tx);
  console.log(`\nVERIFY limit ${gas} (plus 2,800 secp256k1 intrinsic)`);
  await attempt("ethrex simulate", () =>
    rpc("ethrex_simulateFrameTransaction", [raw, "latest", {}], ETHREX_URL).then((r: any) => ({
      valid: r.valid, canonicalMempoolValid: r.canonicalMempoolValid, canonicalMempoolViolation: r.canonicalMempoolViolation,
      violation: r.violation, prefixShape: r.prefixShape, executionError: r.executionError, haltReason: r.haltReason, maxCost: r.maxCost,
    })),
  );
  await attempt("sidecar eth_sendFrameTransaction", () => rpc("eth_sendFrameTransaction", [toWire(tx)]));
}
