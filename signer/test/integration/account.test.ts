// Integration tests against a running node. Local: ./devnet/up.sh, then node devnet/producer.ts
// Run with: node --test "signer/test/integration/*.test.ts"
// These hold a valid device key on purpose: most cases model an attacker who has stolen it.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { frame } from "@forshtat/hegota-support/tx";
import { concat, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, type Address, type Hex } from "viem";
import { ETHREX_URL, STAKING_REGISTRY, deployerAddress, getBalance, getNonce, rpc, sendLegacy, waitMined } from "../../src/devnet.ts";
import { DEFAULT_FEES, DEVICE_STEP_LIMIT, LIMITS, PAYMASTER_ABI, STAKE, buildTx, deployAccount, deployPaymaster, deployRaw, digestOf, rawTx, signTx, simulate, steps, submit } from "../../src/mohar.ts";
import { SIG_BYTES, WotsKey, fromHex, recoverRoot, toHex } from "../../src/wots.ts";

const SELECTOR = 0x969b1cdbn; // report(uint256), for these tests
const report = (n: bigint): Hex => concat(["0x969b1cdb", encodeAbiParameters([{ type: "uint256" }], [n])]);

let sink: Address;
let otherSink: Address;
let key: WotsKey;
let account: Address;
let paymaster: Address;

const policy = async () => {
  const out = await rpc<Hex>("eth_call", [{ to: paymaster, data: encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "policyOf", args: [account] }) }, "latest"]);
  const word = decodeFunctionResult({ abi: PAYMASTER_ABI, functionName: "policyOf", data: out });
  return { remaining: word >> 192n, dailyLimit: (word >> 128n) & 0xffffffffffffffffn, lastRefill: (word >> 64n) & 0xffffffffffffffffn, maxCostGwei: word & 0xffffffffffffffffn };
};
const admin = async (functionName: any, args: any[] = []) => {
  const { receipt } = await sendLegacy({ to: paymaster, data: encodeFunctionData({ abi: PAYMASTER_ABI, functionName, args } as any), gas: 300_000n });
  return receipt;
};
const failsAt = (sim: any, frameIndex: number, label: string) => {
  assert.equal(sim.executionStatus === "success", false, `${label}: should not execute successfully (${JSON.stringify(sim).slice(0, 200)})`);
  assert.equal(sim.failedFrameIndex, frameIndex, `${label}: expected failure at frame ${frameIndex}, got ${sim.failedFrameIndex}: ${sim.executionError}`);
};

before(async () => {
  sink = await deployRaw("Sink");
  otherSink = await deployRaw("Sink");
  key = new WotsKey(keccak_256(new TextEncoder().encode(`mohar integration ${Date.now()}`)));
  account = await deployAccount({ key, target: sink, selector: SELECTOR, stake: STAKE });
  paymaster = await deployPaymaster({ stake: STAKE, funding: 10n ** 18n });
  const receipt = await admin("setPolicy", [account, 3n, 3_000_000n]);
  assert.equal(receipt.status, "0x1");
});

test("the account holds no spendable balance and starts at nonce 1", async () => {
  assert.equal(await getBalance(account), 0n);
  assert.equal(await getNonce(account), 1n);
});

test("constructors staked the account and the paymaster in the registry", async () => {
  const selector = "0x5287ce12"; // getDepositInfo(address)
  for (const entity of [account, paymaster]) {
    const out = await rpc<Hex>("eth_call", [{ to: STAKING_REGISTRY, data: concat([selector, encodeAbiParameters([{ type: "address" }], [entity])]) }, "latest"]);
    assert.equal(BigInt(out.slice(0, 66)), STAKE, `${entity} stake`);
  }
});

test("a valid report passes simulation within the 100,000 gas validation budget", async () => {
  const tx = buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster });
  const signed = signTx(tx, key);
  const digest = digestOf(tx);
  assert.deepEqual(recoverRoot(digest, 0, fromHex(signed.signatures[0].signature), key.pubSeed), key.root);
  const sim = await simulate(signed);
  assert.equal(sim.executionStatus, "success", sim.executionError ?? "");
  assert.equal(sim.payer?.toLowerCase(), paymaster.toLowerCase());
  const [verify, pay] = sim.frames!.map((f) => Number(f.gasUsed));
  assert.ok(verify <= Number(LIMITS.accountVerify), `account frame used ${verify}`);
  assert.ok(pay <= Number(LIMITS.paymasterVerify), `paymaster frame used ${pay}`);
  assert.equal(LIMITS.accountVerify + LIMITS.paymasterVerify + 100n, 100_000n);
  console.log(`  steps ${steps(tx)}, account ${verify} gas, paymaster ${pay} gas, settle ${Number(sim.frames![3].gasUsed)} gas, total ${Number(sim.gasUsed)} gas, max cost ${BigInt(sim.maxCost)} wei`);
});

test("the canonical rules refuse the paymaster's own-storage read", async () => {
  const sim = await simulate(signTx(buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster }), key));
  assert.equal(sim.canonicalMempoolValid, false);
  console.log(`  canonical violation: ${sim.canonicalMempoolViolation}`);
  assert.match(sim.canonicalMempoolViolation ?? "", /Storage/);
});

test("forged signatures fail in frame 0", async () => {
  const tx = buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster });
  const signed = signTx(tx, key);
  const bytes = fromHex(signed.signatures[0].signature);
  for (const at of [0, 31, 2143, 2144, SIG_BYTES - 1]) {
    const bad = bytes.slice();
    bad[at] ^= 0x01;
    failsAt(await simulate({ ...signed, signatures: [{ ...signed.signatures[0], signature: toHex(bad) }] }), 0, `flip byte ${at}`);
  }
  const stranger = new WotsKey(keccak_256(new TextEncoder().encode("a different device")));
  failsAt(await simulate(signTx(tx, stranger)), 0, "another key");
});

test("wrong signature lengths fail in frame 0", async () => {
  const signed = signTx(buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster }), key);
  const hex = signed.signatures[0].signature;
  failsAt(await simulate({ ...signed, signatures: [{ ...signed.signatures[0], signature: (hex + "00") as Hex }] }), 0, "one byte too long");
  failsAt(await simulate({ ...signed, signatures: [{ ...signed.signatures[0], signature: hex.slice(0, -2) as Hex }] }), 0, "one byte too short");
});

test("a signature made for one transaction can't authorise a different one", async () => {
  const signed = signTx(buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster }), key);
  const altered = buildTx({ account, nonce: 1n, target: sink, data: report(999n), paymaster });
  failsAt(await simulate({ ...altered, signatures: signed.signatures }), 0, "changed reading");
});

test("a signature made with the wrong leaf fails", async () => {
  const tx = buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster });
  const signature = key.sign(digestOf(tx), 5);
  failsAt(await simulate({ ...tx, signatures: [{ ...tx.signatures[0], signature: toHex(signature) }] }), 0, "leaf 5 at nonce 1");
});

test("stolen key: can't call a different contract", async () => {
  failsAt(await simulate(signTx(buildTx({ account, nonce: 1n, target: otherSink, data: report(1n), paymaster }), key)), 0, "other target");
});

test("stolen key: can't call a different function", async () => {
  failsAt(await simulate(signTx(buildTx({ account, nonce: 1n, target: sink, data: "0xdeadbeef", paymaster }), key)), 0, "other selector");
  failsAt(await simulate(signTx(buildTx({ account, nonce: 1n, target: sink, data: "0x", paymaster }), key)), 0, "empty calldata");
});

test("stolen key: can't send value", async () => {
  failsAt(await simulate(signTx(buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster, value: 1n }), key)), 0, "value");
});

test("stolen key: can't withdraw the account's stake", async () => {
  // unlockStake() on the registry is the first step in taking the stake out.
  const tx = buildTx({ account, nonce: 1n, target: STAKING_REGISTRY, data: "0xbb9fe6bf", paymaster });
  failsAt(await simulate(signTx(tx, key)), 0, "unlockStake");
});

test("stolen key: can't drop the settle frame to spend without using quota", async () => {
  const frames = [
    frame(profile, "VERIFY", { scope: "EXECUTION", execution: LIMITS.accountVerify }),
    frame(profile, "VERIFY", { scope: "PAYMENT", target: paymaster, execution: LIMITS.paymasterVerify }),
    frame(profile, "SENDER", { target: sink, execution: LIMITS.report, state: LIMITS.reportState, data: report(1n) }),
  ];
  failsAt(await simulate(signTx(buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster, frames }), key)), 1, "no settle");
});

test("stolen key: can't starve the settle frame of gas", async () => {
  const frames = [
    frame(profile, "VERIFY", { scope: "EXECUTION", execution: LIMITS.accountVerify }),
    frame(profile, "VERIFY", { scope: "PAYMENT", target: paymaster, execution: LIMITS.paymasterVerify }),
    frame(profile, "SENDER", { target: sink, execution: LIMITS.report, state: LIMITS.reportState, data: report(1n) }),
    frame(profile, "DEFAULT", { target: paymaster, execution: 39_999n, data: encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "settle" }) }),
  ];
  failsAt(await simulate(signTx(buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster, frames }), key)), 1, "low settle gas");
});

test("stolen key: can't exceed the per-transaction cost cap", async () => {
  const fees = { maxFeePerGas: 1_000_000_000_000n, maxPriorityFeePerGas: 1_000_000n };
  failsAt(await simulate(signTx(buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster, fees }), key)), 1, "high fee");
});

test("the account can't pay for itself: it has no balance", async () => {
  const sim = await simulate(signTx(buildTx({ account, nonce: 1n, target: sink, data: report(1n) }), key));
  assert.notEqual(sim.executionStatus, "success");
});

test("a paused paymaster and a revoked device both refuse payment", async () => {
  const signed = signTx(buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster }), key);
  await admin("setPaused", [true]);
  failsAt(await simulate(signed), 1, "paused");
  await admin("setPaused", [false]);
  assert.equal((await simulate(signed)).executionStatus, "success");
  const before = await policy();
  await admin("revoke", [account]);
  failsAt(await simulate(signed), 1, "revoked");
  await admin("setPolicy", [account, before.dailyLimit, before.maxCostGwei]);
  assert.equal((await simulate(signed)).executionStatus, "success");
});

test("only the owner can change policy", async () => {
  // Deployer is the owner, so call as someone else through eth_call.
  const data = encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "setPaused", args: [true] });
  await assert.rejects(rpc("eth_call", [{ from: "0x00000000000000000000000000000000000000ff", to: paymaster, data }, "latest"]));
});

test("end to end: reports are mined, quota is charged, the account pays nothing, and a fourth report is refused", async () => {
  const startBalance = await getBalance(paymaster);
  for (let i = 1n; i <= 3n; i++) {
    const nonce = await getNonce(account);
    assert.equal(nonce, i);
    const hash = await submit(signTx(buildTx({ account, nonce, target: sink, data: report(i), paymaster }), key));
    const receipt = await waitMined(hash);
    assert.equal(receipt.status, "0x1", `report ${i}`);
    const frames = receipt.frameReceipts.map((f: any) => f.status);
    assert.deepEqual(frames, ["0x1", "0x1", "0x1", "0x1"], `report ${i} frames`);
    assert.equal((await policy()).remaining, 3n - i, `quota after report ${i}`);
    if (i === 1n) console.log(`  mined: total gas ${Number(receipt.gasUsed)}, frames ${receipt.frameReceipts.map((f: any) => Number(f.gasUsed)).join(", ")}`);
  }
  assert.equal(await getNonce(account), 4n);
  assert.equal(await getBalance(account), 0n, "account paid nothing");
  assert.ok((await getBalance(paymaster)) < startBalance, "paymaster paid");
  failsAt(await simulate(signTx(buildTx({ account, nonce: 4n, target: sink, data: report(4n), paymaster }), key)), 1, "out of quota");
});

test("a mined transaction can't be replayed", async () => {
  // Same nonce and same signature as report 1, after it has already been mined.
  const signed = signTx(buildTx({ account, nonce: 1n, target: sink, data: report(1n), paymaster }), key);
  const sim = await simulate(signed);
  assert.notEqual(sim.executionStatus, "success", "replay must not execute");
  console.log(`  replay verdict: ${sim.canonicalMempoolViolation ?? sim.executionError}`);
  await assert.rejects(rpc("eth_sendRawTransaction", [rawTx(signed)]));
});

test("refill is refused until 24 hours have passed", async () => {
  const data = encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "refill", args: [account] });
  await assert.rejects(rpc("eth_call", [{ to: paymaster, data }, "latest"]));
});

test("the node can produce the trace the alt mempool's rules need, despite the canonical rejection", async () => {
  const tx = signTx(buildTx({ account, nonce: await getNonce(account), target: sink, data: report(50n), paymaster }), key);
  await admin("setPolicy", [account, 3n, 3_000_000n]);
  const sim = await rpc("ethrex_simulateFrameTransaction", [rawTx(tx), "latest", { trace: true }], ETHREX_URL);
  assert.equal(sim.canonicalMempoolValid, false);
  assert.equal(sim.executionStatus, "success");
  assert.equal(sim.erc7562TraceError, null);
  assert.ok(Array.isArray(sim.erc7562Trace) && sim.erc7562Trace.length === 4, "one trace entry per frame");
});

test("the account and paymaster refuse plain transfers, and deposit() funds the paymaster", async () => {
  await assert.rejects(rpc("eth_call", [{ from: deployerAddress(), to: account, value: "0x1" }, "latest"]), "account");
  await assert.rejects(rpc("eth_call", [{ from: deployerAddress(), to: paymaster, value: "0x1" }, "latest"]), "paymaster");
  const before = await getBalance(paymaster);
  const { receipt } = await sendLegacy({ to: paymaster, data: encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "deposit" }), value: 5n, gas: 100_000n });
  assert.equal(receipt.status, "0x1");
  assert.equal(await getBalance(paymaster), before + 5n);
});

test("only the owner can withdraw from the paymaster", async () => {
  const data = encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "withdraw", args: ["0x00000000000000000000000000000000000000ff", 1n] });
  await assert.rejects(rpc("eth_call", [{ from: "0x00000000000000000000000000000000000000ff", to: paymaster, data }, "latest"]));
  await rpc("eth_call", [{ from: deployerAddress(), to: paymaster, data }, "latest"]);
});

test("a digest at the device's step limit fits the 90,000 gas frame limit, and one far above it runs out of gas", async () => {
  // Search for rare digests by changing the reported value. Nothing is signed until a digest qualifies.
  const nonce = await getNonce(account);
  const find = (min: number, max: number) => {
    for (let i = 0n; i < 200_000n; i++) {
      const tx = buildTx({ account, nonce, target: sink, data: report(i), paymaster });
      const n = steps(tx);
      if (n >= min && n <= max) return { tx, n };
    }
    throw new Error(`no digest found with ${min}..${max} steps`);
  };
  await admin("setPolicy", [account, 3n, 3_000_000n]);
  const atLimit = find(628, DEVICE_STEP_LIMIT);
  const fits = await simulate(signTx(atLimit.tx, key));
  assert.equal(fits.executionStatus, "success", fits.executionError ?? "");
  const used = Number(fits.frames![0].gasUsed);
  assert.ok(used <= Number(LIMITS.accountVerify));
  console.log(`  ${atLimit.n} steps used ${used} of ${LIMITS.accountVerify} gas`);
  const tooMany = find(645, 700);
  const over = await simulate(signTx(tooMany.tx, key));
  assert.notEqual(over.executionStatus, "success");
  assert.equal(over.failedFrameIndex, 0);
  console.log(`  ${tooMany.n} steps fails in frame 0: ${over.haltReason}`);
});

test("the owner can restore quota, and reports then pass again", async () => {
  await admin("setPolicy", [account, 3n, 3_000_000n]);
  assert.equal((await policy()).remaining, 3n);
  const sim = await simulate(signTx(buildTx({ account, nonce: 4n, target: sink, data: report(4n), paymaster, fees: DEFAULT_FEES }), key));
  assert.equal(sim.executionStatus, "success", sim.executionError ?? "");
});
