// Experiment E3: what do the frame opcodes return, and which nonce forms does the client accept?
import fs from "node:fs";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, frame, newTx, sigHash } from "@forshtat/hegota-support/tx";
import { toHex, type Address, type Hex } from "viem";
import { CHAIN_ID, ETHREX_URL, NETWORK, deployerAddress, getBalance, rpc, sendLegacy } from "../src/devnet.ts";

const artifact = JSON.parse(fs.readFileSync(new URL("../../contracts/out/Probe.yul/Probe.json", import.meta.url), "utf8"));
console.log(`network: ${NETWORK}, deployer balance: ${Number(await getBalance(deployerAddress())) / 1e18} ETH`);
const { receipt } = await sendLegacy({ to: null, data: artifact.bytecode.object as Hex, value: 10n ** 18n, gas: 2_000_000n });
if (receipt.status !== "0x1") throw new Error("probe deploy reverted");
const probe = receipt.contractAddress as Address;
const nonce = BigInt(await rpc("eth_getTransactionCount", [probe, "latest"]));
console.log(`probe ${probe}, nonce ${nonce}, deploy gas ${Number(receipt.gasUsed)}\n`);

const sigBytes = ("0x" + Array.from({ length: 2400 }, (_, i) => (i % 251).toString(16).padStart(2, "0")).join("")) as Hex;
const MAX_NONCE_SEQ = 2n ** 64n - 1n;

function build(nonceKeys: bigint[] | undefined, nonceSeq: bigint, data: Hex, verifyGas = 90_000n) {
  return newTx({
    chainId: CHAIN_ID, sender: probe, nonceSeq, nonceKeys,
    fees: { maxFeePerGas: 2_000_000_000n },
    signatures: [{ scheme: 0, signer: "0x", msg: "0x", signature: sigBytes }],
    frames: [
      frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", execution: verifyGas, data }),
      frame(profile, "SENDER", { target: "0x00000000000000000000000000000000000000ff", execution: 30_000n, state: 200_000n }),
    ],
  });
}
const sim = (tx: any, trace = false) => rpc("ethrex_simulateFrameTransaction", [encodeTx(profile, tx), "latest", { trace }], ETHREX_URL);

const NAMES = ["TYPE","NONCE","SENDER","MAX_PRIORITY_FEE","MAX_FEE","MAX_COST(0x06)","SIG_HASH","FRAME_COUNT","CURRENT_FRAME","SIG_COUNT","LEGACY_NONCE","NONCE_KEY_COUNT","NONCE_KEYS_HASH","NONCE_KEY_0","SIG_SCHEME","SIG_LENGTH","FRAME_TARGET","FRAME_EXEC_LIMIT","FRAME_MODE","FRAME_FLAGS","FRAME_ALLOWED_SCOPE"];
function dump(hex: string) {
  const body = hex.slice(2);
  return NAMES.map((n, i) => `${n}=${BigInt("0x" + body.slice(i * 64, i * 64 + 64)).toString(16)}`).join(" ");
}

const forms: [string, bigint[] | undefined, bigint][] = [
  ["keys=[] seq=nonce (EIP legacy form)", [], nonce],
  ["keys=[0] seq=nonce (workshop form)", [0n], nonce],
  ["keys=[1] seq=0", [1n], 0n],
  ["keys=[1] seq=MAX (single use)", [1n], MAX_NONCE_SEQ],
  ["keys=[1,2] seq=0", [1n, 2n], 0n],
];
for (const [label, keys, seq] of forms) {
  console.log(`--- ${label}`);
  try {
    const tx = build(keys, seq, "0x01");
    const r = await sim(tx);
    console.log(`  dump: haltReason=${r.haltReason} frame=${r.failedFrameIndex}`);
    if (r.revertData) {
      console.log("  " + dump(r.revertData));
      console.log(`  local sigHash: ${sigHash(profile, tx)}`);
    } else console.log("  no revert data:", JSON.stringify(r).slice(0, 400));
    const ok = await sim(build(keys, seq, "0x"));
    console.log(`  approve: valid=${ok.valid} canonical=${ok.canonicalMempoolValid} shape=${ok.prefixShape} status=${ok.executionStatus} frames=${JSON.stringify(ok.frames)} violation=${ok.violation ?? ok.canonicalMempoolViolation} error=${ok.executionError}`);
  } catch (e: any) {
    console.log(`  RPC error: ${e.message}`);
  }
}

console.log("\n--- SIGDATACOPY first 64 bytes");
const r2 = await sim(build([0n], nonce, "0x02"));
console.log(`  expected ${sigBytes.slice(0, 130)}\n  got      ${r2.revertData}`);
