// EF-1: a WOTS-signed frame transaction on the PUBLIC devnet, admitted by the alt mempool and mined.
// Also settles the staked-budget question: does a staked account get more than 100,000 verification gas?
// Usage: MOHAR_NET=public node signer/tools/ef1.ts      Evidence: docs/evidence/ef-1.json
import fs from "node:fs";
import path from "node:path";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { frame } from "@forshtat/hegota-support/tx";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { toWire } from "@forshtat/hegota-support/rpc";
import { concat, encodeAbiParameters, type Address, type Hex } from "viem";
import { CHAIN_ID, ETHREX_URL, EXPLORER_URL, NETWORK, STAKING_REGISTRY, deployerAddress, getBalance, getNonce, rpc, waitMined } from "../src/devnet.ts";
import { DEFAULT_FEES, STAKE, buildTx, deployAccount, deployRaw, hashOf, signTx, simulate, steps } from "../src/mohar.ts";
import { WotsKey } from "../src/wots.ts";

if (NETWORK !== "public") throw new Error("EF-1 runs on the public devnet: MOHAR_NET=public");
const ev: Record<string, unknown> = { network: NETWORK, startedAt: new Date().toISOString(), explorer: EXPLORER_URL };
const say = (k: string, v: unknown) => { ev[k] = v; console.log(k + ":", typeof v === "string" ? v : JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x))); };
const err = (e: any) => String(e?.message ?? e);

// 0. Is this the expected devnet?
say("chainId", Number(await rpc<Hex>("eth_chainId")));
if (ev.chainId !== CHAIN_ID) throw new Error("unexpected chain");
say("clientVersion", await rpc("web3_clientVersion", [], ETHREX_URL));
say("stakingRegistryHasCode", ((await rpc<Hex>("eth_getCode", [STAKING_REGISTRY, "latest"])).length > 2));
say("deployerBalanceETH", (Number(await getBalance(deployerAddress())) / 1e18).toString());

// 1. Contracts: a target to call, and a staked self-paying account that trusts only our key.
const gwei = BigInt(process.env.FEE_GWEI ?? "0");
const FEES = gwei ? { maxFeePerGas: gwei * 1_000_000_000n, maxPriorityFeePerGas: gwei * 500_000_000n } : DEFAULT_FEES; // FEE_GWEI=5 tests higher fees
say("fees", { maxFeePerGas: FEES.maxFeePerGas.toString(), maxPriorityFeePerGas: FEES.maxPriorityFeePerGas.toString() });
const SELECTOR = 0x969b1cdbn; // report(uint256)
const data = (n: bigint): Hex => concat(["0x969b1cdb", encodeAbiParameters([{ type: "uint256" }], [n])]);
const sink = await deployRaw("Sink");
const key = new WotsKey(keccak_256(new TextEncoder().encode(`mohar ef1 ${Date.now()} ${Math.random()}`)));
const account = await deployAccount({ key, target: sink, selector: SELECTOR, stake: STAKE, value: 10n ** 16n });
say("contracts", { sink, account, accountBalanceETH: Number(await getBalance(account)) / 1e18 });

// 2. EF1-T1/T2/T4/T5: sign and send a 2-frame, self-paying transaction through the alt mempool.
const nonce = await getNonce(account);
const tx = signTx(buildTx({ account, nonce, target: sink, data: data(1234n), fees: FEES }), key);
say("verifierSteps", steps(buildTx({ account, nonce, target: sink, data: data(1234n), fees: FEES })));
const localHash = hashOf(tx);
const sim = await simulate(tx);
say("simulation", { status: sim.executionStatus, canonicalValid: sim.canonicalMempoolValid, violation: sim.canonicalMempoolViolation, frames: sim.frames });
let hash: Hex;
try {
  hash = await rpc<Hex>("eth_sendFrameTransaction", [toWire(tx)]);
} catch (e) {
  say("EF1 submit error", err(e));
  throw e;
}
say("EF1-T2 returned hash equals the locally computed one", hash.toLowerCase() === localHash.toLowerCase());
const receipt = await waitMined(hash, 150);
say("EF1-T1 receipt", { status: receipt.status, block: Number(receipt.blockNumber), frames: receipt.frameReceipts.map((f: any) => ({ status: f.status, gasUsed: Number(f.gasUsed) })), gasUsed: Number(receipt.gasUsed) });
say("EF1-T3 explorer", { page: EXPLORER_URL, txHash: hash, note: "search the hash in the explorer; its history is in memory only, so save a screenshot" });
try { say("EF1-T4 skandha_frameTransactionStatus", await rpc("skandha_frameTransactionStatus", [hash])); } catch (e) { say("EF1-T4 skandha_frameTransactionStatus", err(e)); }
say("EF1-T5 nonce", { before: nonce.toString(), after: (await getNonce(account)).toString() });

// 3. EF1-T6: the staked-budget question. Same staked account, verification gas limit raised to 150,000.
const nonce2 = await getNonce(account);
const big = signTx(
  buildTx({
    account, nonce: nonce2, target: sink, data: data(5678n),
    frames: [
      frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", execution: 150_000n }),
      frame(profile, "SENDER", { target: sink, execution: 50_000n, state: 100_000n, data: data(5678n) }),
    ],
  }),
  key,
);
try {
  const h2 = await rpc<Hex>("eth_sendFrameTransaction", [toWire(big)]);
  say("EF1-T6 staked account, 150,000 verification gas", { verdict: "ADMITTED", hash: h2 });
} catch (e) {
  say("EF1-T6 staked account, 150,000 verification gas", { verdict: "REFUSED", message: err(e) });
}

ev.finishedAt = new Date().toISOString();
const dir = path.resolve(import.meta.dirname, "../../docs/evidence");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "ef-1.json"), JSON.stringify(ev, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2) + "\n");
console.log("saved docs/evidence/ef-1.json");
