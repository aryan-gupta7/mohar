// Experiment E1: does the devnet accept a plain frame transaction built by our own code?
// Sender is a plain EOA using a SECP256K1 signature. This is the known-good baseline before any WOTS work.
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { frame, newTx, secp256k1Placeholder, signTx, txHash } from "@forshtat/hegota-support/tx";
import { toWire } from "@forshtat/hegota-support/rpc";
import { CHAIN_ID, deployerAddress, deployerKey, ensureFunded, getBalance, getNonce, rpc, waitMined } from "../src/devnet.ts";

const id = Number(await rpc("eth_chainId"));
console.log(`chain id: ${id}`);
if (id !== CHAIN_ID) throw new Error("wrong chain");

const me = deployerAddress();
console.log(`deployer: ${me}`);
const balance = await ensureFunded(me, 100_000_000_000_000_000n); // 0.1 ETH
console.log(`balance:  ${Number(balance) / 1e18} ETH`);

const nonce = await getNonce(me);
const tx = await signTx(
  profile,
  newTx({
    chainId: CHAIN_ID,
    sender: me,
    nonceSeq: nonce,
    fees: { maxFeePerGas: 2_000_000_000n },
    signatures: [secp256k1Placeholder(profile)],
    frames: [
      frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", execution: 30_000n }),
      frame(profile, "SENDER", { target: "0x8943545177806ED17B9F23F0a21ee5948eCaa776", execution: 50_000n, state: 200_000n, value: 1_000_000_000n }),
    ],
  }),
  deployerKey(),
);
console.log(`local tx hash: ${txHash(profile, tx)}`);
const hash = await rpc("eth_sendFrameTransaction", [toWire(tx)]);
console.log(`sent via alt mempool: ${hash}`);
const receipt = await waitMined(hash);
console.log(`mined in block ${Number(receipt.blockNumber)}, status ${receipt.status}`);
console.log("frames:", JSON.stringify(receipt.frameReceipts ?? receipt.frames ?? "n/a"));
console.log("gas used:", receipt.gasUsed, "balance after:", Number(await getBalance(me)) / 1e18);
