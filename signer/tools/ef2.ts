// EF-2 / EF-2L: the alt mempool proof. The same signed bytes are refused by the canonical path and admitted
// by the alt mempool. Runs unchanged on MOHAR_NET=local-alt (our sidecar) and MOHAR_NET=public.
// Usage: MOHAR_NET=local-alt node signer/tools/ef2.ts
// Evidence: docs/evidence/ef-2-<network>.json
//
// Rule-breaking cases use throwaway accounts and paymasters, so the main ones keep a clean reputation, and
// no device key ever signs two different messages with one leaf.
import fs from "node:fs";
import path from "node:path";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { encodeFunctionData, decodeFunctionResult, type Address, type Hex } from "viem";
import { toWire } from "@forshtat/hegota-support/rpc";
import { CHAIN_ID, ETHREX_URL, GATEWAY_URL, NETWORK, deployerAddress, getBalance, getNonce, rpc, sendLegacy, waitMined } from "../src/devnet.ts";
import {
  DEVICE_STEP_LIMIT, LEDGER_ABI, MODE, PAYMASTER_ABI, REPORT_SELECTOR, STAKE, buildTx, deployAccount, deployLedger,
  deployPaymaster, encodeReport, hashOf, rawTx, signTx, simulate, steps, type Report,
} from "../src/mohar.ts";
import { WotsKey } from "../src/wots.ts";

if (NETWORK === "local") throw new Error("EF-2 needs a sidecar: use MOHAR_NET=local-alt or MOHAR_NET=public");

const evidence: Record<string, unknown> = { network: NETWORK, gateway: GATEWAY_URL, startedAt: new Date().toISOString() };
const log = (k: string, v: unknown) => {
  evidence[k] = v;
  console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x))}`);
};
const errText = (e: any) => String(e?.message ?? e);

async function expectRefused(label: string, p: Promise<unknown>) {
  try {
    const r = await p;
    log(label, { refused: false, result: r });
    return false;
  } catch (e) {
    log(label, { refused: true, error: errText(e) });
    return true;
  }
}

const admin = async (to: Address, functionName: string, args: unknown[] = [], value?: bigint, abi: any = PAYMASTER_ABI) => {
  const { hash, receipt } = await sendLegacy({ to, data: encodeFunctionData({ abi, functionName, args } as any), value });
  if (receipt.status !== "0x1") throw new Error(`${functionName} ${hash} reverted`);
};

const quota = async (paymaster: Address, account: Address) => {
  const out = await rpc<Hex>("eth_call", [{ to: paymaster, data: encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "policyOf", args: [account] }) }, "latest"]);
  return decodeFunctionResult({ abi: PAYMASTER_ABI, functionName: "policyOf", data: out }) >> 192n;
};

/** Builds and signs a report, changing the salt until the digest fits the device's step limit. */
function signedReport(key: WotsKey, account: Address, ledger: Address, paymaster: Address, nonce: bigint, r: Report) {
  let report = r;
  let tx = buildTx({ account, nonce, target: ledger, data: encodeReport(report), paymaster });
  while (steps(tx) > DEVICE_STEP_LIMIT) {
    report = { ...report, salt: report.salt + 1 };
    tx = buildTx({ account, nonce, target: ledger, data: encodeReport(report), paymaster });
  }
  return signTx(tx, key);
}

const report = (seq: bigint, total: bigint): Report => ({ seq, total, mode: MODE.RUN, reason: 0, confidence: 0, model: 0, salt: 0, sensors: `0x${"00".repeat(32)}`, requestId: "" });

async function freshMachine(label: string, paymaster: Address, stake: bigint) {
  const key = new WotsKey(keccak_256(new TextEncoder().encode(`mohar ef2 ${label} ${Date.now()} ${Math.random()}`)));
  const ledger = await deployLedger({ owner: deployerAddress(), operator: deployerAddress(), tariffWeiPerPulse: 1_000_000_000n });
  const account = await deployAccount({ key, target: ledger, selector: REPORT_SELECTOR, stake });
  await admin(ledger, "bindMachine", [account], undefined, LEDGER_ABI);
  await admin(ledger, "topUp", [], 10n ** 15n, LEDGER_ABI);
  await admin(paymaster, "setPolicy", [account, 10n, 3_000_000n]);
  return { key, ledger, account };
}

// --- 0. Which network is this?
log("chainId", Number(await rpc<Hex>("eth_chainId")));
if (Number(evidence.chainId) !== CHAIN_ID) throw new Error(`expected chain ${CHAIN_ID}`);
log("clientVersion", await rpc("web3_clientVersion", [], ETHREX_URL));
log("deployerBalanceWei", (await getBalance(deployerAddress())).toString());

// --- 1. Deploy the main machine: staked account, staked paymaster, ledger.
const paymaster = await deployPaymaster({ stake: STAKE, funding: 10n ** 17n });
const main = await freshMachine("main", paymaster, STAKE);
log("contracts", { ledger: main.ledger, account: main.account, paymaster });

// --- 2. Sign ONE report.
const signed = signedReport(main.key, main.account, main.ledger, paymaster, 1n, report(1n, 42n));
const raw = rawTx(signed);
const localHash = hashOf(signed);
log("localHash", localHash);
const sim = await simulate(signed);
log("simulation", { executionStatus: sim.executionStatus, canonicalMempoolValid: sim.canonicalMempoolValid, canonicalMempoolViolation: sim.canonicalMempoolViolation, prefixShape: sim.prefixShape, payer: sim.payer });

// --- 3. Canonical path: the node's own mempool must refuse these bytes.
await expectRefused("EF2-T1 canonical eth_sendRawTransaction", rpc("eth_sendRawTransaction", [raw], ETHREX_URL));

// --- 4. Alt path: the same bytes, through the sidecar.
const quotaBefore = await quota(paymaster, main.account);
const altHash = await rpc<Hex>("eth_sendFrameTransaction", [toWire(signed)]);
log("EF2-T2 alt eth_sendFrameTransaction", { hash: altHash, matchesLocal: altHash.toLowerCase() === localHash.toLowerCase() });

// --- 5. The sidecar's rule-by-rule admission record.
try {
  log("EF2-T3 admission", await rpc("skandha_explorer_getTransaction", [altHash]));
} catch (e) {
  log("EF2-T3 admission", { error: errText(e) });
}

// --- 6. Mined, with every frame succeeding, paid by the paymaster.
const receipt = await waitMined(altHash, 180);
log("EF2-T4 receipt", {
  status: receipt.status,
  block: Number(receipt.blockNumber),
  payer: receipt.payer,
  gasUsed: Number(receipt.gasUsed),
  frames: receipt.frameReceipts.map((f: any) => ({ status: f.status, gasUsed: Number(f.gasUsed) })),
});
log("accountBalanceWei", (await getBalance(main.account)).toString());
const quotaAfter = await quota(paymaster, main.account);
log("EF2-T5 quota", { before: quotaBefore, after: quotaAfter });
try {
  log("sidecarStatus", await rpc("skandha_frameTransactionStatus", [altHash]));
} catch (e) {
  log("sidecarStatus", { error: errText(e) });
}

// --- 7. Refusals.
// Replay of the mined transaction.
await expectRefused("EF2-T8 replay", rpc("eth_sendFrameTransaction", [toWire(signed)]));

// Unstaked paymaster: a throwaway paymaster with no stake, and a throwaway account.
const unstakedPm = await deployPaymaster({ stake: 0n, funding: 10n ** 16n });
const t7 = await freshMachine("unstaked-pm", unstakedPm, 0n);
await expectRefused("EF2-T7 unstaked paymaster", rpc("eth_sendFrameTransaction", [toWire(signedReport(t7.key, t7.account, t7.ledger, unstakedPm, 1n, report(1n, 1n)))]));

// Over quota and revoked: a throwaway staked paymaster, so the main one keeps a clean reputation.
const spare = await deployPaymaster({ stake: STAKE, funding: 10n ** 16n });
const t6 = await freshMachine("over-quota", spare, 0n);
await admin(spare, "setPolicy", [t6.account, 1n, 3_000_000n]);
const first = signedReport(t6.key, t6.account, t6.ledger, spare, 1n, report(1n, 1n));
const firstHash = await rpc<Hex>("eth_sendFrameTransaction", [toWire(first)]);
const firstReceipt = await waitMined(firstHash, 180);
log("EF2-T6 first report within quota", { hash: firstHash, status: firstReceipt.status });
await expectRefused("EF2-T6 second report over quota", rpc("eth_sendFrameTransaction", [toWire(signedReport(t6.key, t6.account, t6.ledger, spare, 2n, report(2n, 2n)))]));

const t9 = await freshMachine("revoked", spare, 0n);
await admin(spare, "revoke", [t9.account]);
await expectRefused("EF2-T9 revoked device", rpc("eth_sendFrameTransaction", [toWire(signedReport(t9.key, t9.account, t9.ledger, spare, 1n, report(1n, 1n)))]));

// --- Save.
evidence.finishedAt = new Date().toISOString();
const dir = path.resolve(import.meta.dirname, "../../docs/evidence");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `ef-2-${NETWORK}.json`);
fs.writeFileSync(file, JSON.stringify(evidence, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2) + "\n");
console.log(`\nevidence saved to ${path.relative(process.cwd(), file)}`);
