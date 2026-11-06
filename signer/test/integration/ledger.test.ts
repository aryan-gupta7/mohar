// DEV-3: MachineLedger tests against a running node. Local: ./devnet/up.sh, then node devnet/producer.ts
// Most logic tests bind an ordinary key as the machine, which is quicker. DEV3-T1, T8, T9 and T12 use the
// real path: a WOTS-signed account sending 4-frame transactions through the quota paymaster.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { decodeErrorResult, decodeFunctionResult, encodeFunctionData, parseEventLogs, type Address, type Hex } from "viem";
import { deployerAddress, getBalance, getNonce, rpc, sendLegacy, waitMined } from "../../src/devnet.ts";
import {
  DEVICE_STEP_LIMIT, LEDGER_ABI, MODE, PAYMASTER_ABI, REPORT_SELECTOR, STAKE, buildTx, deployAccount, deployLedger,
  deployPaymaster, encodeReport, signTx, simulate, steps, submit, type Report,
} from "../../src/mohar.ts";
import { WotsKey, toHex } from "../../src/wots.ts";

const TARIFF = 1_000_000_000_000n; // wei per pulse
const ZERO32 = `0x${"00".repeat(32)}` as Hex;
const quantity = (v: bigint) => `0x${v.toString(16)}`;

const operatorKey = generatePrivateKey();
const machineKey = generatePrivateKey();
const strangerKey = generatePrivateKey();
const operator = privateKeyToAccount(operatorKey).address;
const machineEoa = privateKeyToAccount(machineKey).address;
const stranger = privateKeyToAccount(strangerKey).address;

let logic: Address; // machine = an ordinary key, for fast logic tests
let ledger: Address; // machine = a real Mohar account
let key: WotsKey;
let account: Address;
let paymaster: Address;

const call = (to: Address, functionName: string, args: unknown[] = [], from?: Address, value?: bigint) =>
  rpc<Hex>("eth_call", [{ from, to, data: encodeFunctionData({ abi: LEDGER_ABI, functionName, args } as any), value: value === undefined ? undefined : quantity(value) }, "latest"]);

const send = async (to: Address, functionName: string, args: unknown[] = [], o: { key?: Hex; value?: bigint } = {}) => {
  const { hash, receipt } = await sendLegacy({ to, data: encodeFunctionData({ abi: LEDGER_ABI, functionName, args } as any), value: o.value, gas: 300_000n, key: o.key });
  assert.equal(receipt.status, "0x1", `${functionName} ${hash} reverted`);
  return receipt;
};

/** Expects a revert with this exact custom error. */
async function reverts(p: Promise<unknown>, errorName: string) {
  let error: any;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  assert.ok(error, `expected ${errorName}, but the call succeeded`);
  const data = typeof error.data === "string" ? error.data : error.data?.data;
  assert.ok(typeof data === "string" && data.startsWith("0x") && data.length >= 10, `expected ${errorName}, got no revert data: ${error.message}`);
  assert.equal(decodeErrorResult({ abi: LEDGER_ABI, data: data as Hex }).errorName, errorName);
}

async function status(at: Address) {
  const out = await call(at, "status");
  const [credit, hold, lastSeq, lastTotal, tariff, earned, arrears, lastMode, ledgerMode] = decodeFunctionResult({ abi: LEDGER_ABI, functionName: "status", data: out }) as any;
  return { credit, hold, lastSeq, lastTotal, tariff, earned, arrears, lastMode, ledgerMode };
}

const report = (seq: bigint, total: bigint, mode: number = MODE.RUN, extra: Partial<Report> = {}): Report => ({
  seq, total, mode, reason: 0, confidence: 0, model: 0, salt: 0, sensors: ZERO32, requestId: "", ...extra,
});
const sendReport = (r: Report) => send(logic, "report", [r.seq, r.total, r.mode, r.reason, r.confidence, r.model, r.salt, r.sensors, r.requestId], { key: machineKey });

/** The ledger's ETH must always equal unspent credit plus unwithdrawn earnings. */
async function solvent(at: Address) {
  const s = await status(at);
  assert.equal(await getBalance(at), s.credit + s.earned, "ledger ETH = credit + earned");
}

before(async () => {
  for (const to of [operator, machineEoa, stranger]) {
    const { receipt } = await sendLegacy({ to, value: 10n ** 18n });
    assert.equal(receipt.status, "0x1", "funding transfer");
  }
  logic = await deployLedger({ owner: deployerAddress(), operator, tariffWeiPerPulse: TARIFF });
  await send(logic, "bindMachine", [machineEoa]);

  ledger = await deployLedger({ owner: deployerAddress(), operator, tariffWeiPerPulse: TARIFF });
  key = new WotsKey(keccak_256(new TextEncoder().encode(`mohar ledger test ${Date.now()}`)));
  account = await deployAccount({ key, target: ledger, selector: REPORT_SELECTOR, stake: STAKE });
  await send(ledger, "bindMachine", [account]);
  paymaster = await deployPaymaster({ stake: STAKE, funding: 10n ** 18n });
  const { receipt } = await sendLegacy({ to: paymaster, data: encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "setPolicy", args: [account, 10n, 3_000_000n] }), gas: 300_000n });
  assert.equal(receipt.status, "0x1");
});

test("DEV3-T1: only the bound machine can report", async () => {
  const data = report(1n, 1n);
  const args = [data.seq, data.total, data.mode, data.reason, data.confidence, data.model, data.salt, data.sensors, data.requestId];
  await reverts(call(ledger, "report", args, stranger), "NotMachine");
  await reverts(call(ledger, "report", args, deployerAddress()), "NotMachine"); // not even the owner
  // The bound account succeeding is proven by mined frame transactions in DEV3-T8. eth_call can't stand in:
  // the node refuses calls "from" an address that has code.
});

test("DEV3-T2: sequence must rise and the total can't fall", async () => {
  await sendReport(report(1n, 10n));
  const r = (seq: bigint, total: bigint) => { const x = report(seq, total); return [x.seq, x.total, x.mode, x.reason, x.confidence, x.model, x.salt, x.sensors, x.requestId]; };
  await reverts(call(logic, "report", r(1n, 20n), machineEoa), "StaleSeq");
  await reverts(call(logic, "report", r(0n, 20n), machineEoa), "StaleSeq");
  await reverts(call(logic, "report", r(2n, 9n), machineEoa), "TotalWentDown");
  await call(logic, "report", r(2n, 10n), machineEoa); // equal total is allowed: no usage
  await call(logic, "report", r(5n, 11n), machineEoa); // gaps in seq are allowed
});

test("bad fields are refused: mode above 3, confidence above 100, request ID over 64 bytes", async () => {
  const args = (x: Report) => [x.seq, x.total, x.mode, x.reason, x.confidence, x.model, x.salt, x.sensors, x.requestId];
  await reverts(call(logic, "report", args(report(2n, 10n, 4)), machineEoa), "BadMode");
  await reverts(call(logic, "report", args(report(2n, 10n, 0, { confidence: 101 })), machineEoa), "BadConfidence");
  await reverts(call(logic, "report", args(report(2n, 10n, 0, { requestId: "x".repeat(65) })), machineEoa), "RequestIdTooLong");
  await call(logic, "report", args(report(2n, 10n, 0, { confidence: 100, requestId: "x".repeat(64) })), machineEoa);
});

test("DEV3-T3: usage is charged exactly; shortfall becomes arrears, and top-ups pay arrears first", async () => {
  const s0 = await status(logic);
  assert.deepEqual([s0.credit, s0.earned, s0.arrears, s0.lastTotal], [0n, 0n, 10n * TARIFF, 10n], "first report had no credit: 10 pulses owed");
  assert.equal(s0.ledgerMode, MODE.CREDIT_STOP);

  await send(logic, "topUp", [], { key: strangerKey, value: 100n * TARIFF }); // anyone can top up
  let s = await status(logic);
  assert.deepEqual([s.credit, s.earned, s.arrears], [90n * TARIFF, 10n * TARIFF, 0n], "arrears paid first");
  assert.equal(s.ledgerMode, MODE.RUN);

  await sendReport(report(2n, 40n)); // 30 pulses
  s = await status(logic);
  assert.deepEqual([s.credit, s.earned, s.arrears], [60n * TARIFF, 40n * TARIFF, 0n]);

  const receipt = await sendReport(report(3n, 140n)); // 100 pulses, only 60 covered
  s = await status(logic);
  assert.deepEqual([s.credit, s.earned, s.arrears], [0n, 100n * TARIFF, 40n * TARIFF]);
  assert.equal(s.ledgerMode, MODE.CREDIT_STOP);
  const [ev] = parseEventLogs({ abi: LEDGER_ABI, logs: receipt.logs, eventName: "Report" }) as any[];
  assert.deepEqual([ev.args.usage, ev.args.charged, ev.args.owed], [100n, 60n * TARIFF, 40n * TARIFF]);

  await send(logic, "topUp", [], { key: strangerKey, value: 15n * TARIFF });
  s = await status(logic);
  assert.deepEqual([s.credit, s.earned, s.arrears], [0n, 115n * TARIFF, 25n * TARIFF], "partial top-up only reduces arrears");

  // A plain transfer is a top-up too.
  const { receipt: plain } = await sendLegacy({ to: logic, value: 50n * TARIFF, gas: 100_000n, key: strangerKey });
  assert.equal(plain.status, "0x1");
  s = await status(logic);
  assert.deepEqual([s.credit, s.earned, s.arrears], [25n * TARIFF, 140n * TARIFF, 0n]);
  await reverts(call(logic, "topUp", [], stranger, 0n), "NothingSent");
  await solvent(logic);
});

test("DEV3-T4: INSPECT sets the hold; RUN, CREDIT_STOP and SAFE_STOP never change it", async () => {
  await sendReport(report(4n, 140n, MODE.RUN));
  assert.equal((await status(logic)).hold, false);
  await sendReport(report(5n, 141n, MODE.CREDIT_STOP));
  assert.equal((await status(logic)).hold, false);
  await sendReport(report(6n, 142n, MODE.SAFE_STOP));
  assert.equal((await status(logic)).hold, false);
  const receipt = await sendReport(report(7n, 143n, MODE.INSPECT, { reason: 3, confidence: 91, model: 1, requestId: "inspect-1" }));
  assert.equal(parseEventLogs({ abi: LEDGER_ABI, logs: receipt.logs, eventName: "HoldSet" }).length, 1);
  let s = await status(logic);
  assert.equal(s.hold, true);
  assert.equal(s.ledgerMode, MODE.INSPECT);
  await sendReport(report(8n, 144n, MODE.RUN)); // a RUN decision can't clear it
  s = await status(logic);
  assert.equal(s.hold, true);
  assert.equal(s.lastMode, MODE.RUN);
});

test("DEV3-T5: a top-up raises credit and leaves the hold set", async () => {
  const before = await status(logic);
  await send(logic, "topUp", [], { key: strangerKey, value: 7n });
  const after = await status(logic);
  assert.equal(after.credit, before.credit + 7n);
  assert.equal(after.hold, true);
});

test("DEV3-T6: only the operator clears a hold", async () => {
  await reverts(call(logic, "clearHold", [], stranger), "NotOperator");
  await reverts(call(logic, "clearHold", [], deployerAddress()), "NotOperator"); // the owner isn't the operator
  await reverts(call(logic, "clearHold", [], machineEoa), "NotOperator"); // nor is the machine
  const receipt = await send(logic, "clearHold", [], { key: operatorKey });
  assert.equal(parseEventLogs({ abi: LEDGER_ABI, logs: receipt.logs, eventName: "HoldCleared" }).length, 1);
  const s = await status(logic);
  assert.equal(s.hold, false);
  assert.equal(s.ledgerMode, MODE.RUN);
  await reverts(call(logic, "clearHold", [], operator), "NoHold");
});

test("DEV3-T7: a machine can be bound once, by the owner only", async () => {
  await reverts(call(logic, "bindMachine", [stranger], deployerAddress()), "AlreadyBound");
  const fresh = await deployLedger({ owner: deployerAddress(), operator, tariffWeiPerPulse: TARIFF });
  await reverts(call(fresh, "bindMachine", [stranger], stranger), "NotOwner");
  await reverts(call(fresh, "bindMachine", ["0x0000000000000000000000000000000000000000"], deployerAddress()), "ZeroAddress");
});

test("only the owner changes the operator or withdraws, and never more than earned", async () => {
  await reverts(call(logic, "setOperator", [stranger], stranger), "NotOwner");
  await reverts(call(logic, "setOperator", [stranger], operator), "NotOwner");
  const { earned } = await status(logic);
  await reverts(call(logic, "withdraw", [stranger, 1n], stranger), "NotOwner");
  await reverts(call(logic, "withdraw", [stranger, earned + 1n], deployerAddress()), "OverEarned");
  const before = await getBalance(stranger);
  await send(logic, "withdraw", [stranger, earned]);
  assert.equal(await getBalance(stranger), before + earned, "exact amount arrives");
  assert.equal((await status(logic)).earned, 0n);
  await solvent(logic);
});

test("compact report: 63 bytes in, the same accounting as the ABI report, the full request id in the event", async () => {
  const { PACKED_SELECTOR, encodeReportPacked, bytes16Uuid } = await import("../../src/mohar.ts");
  const fresh = await deployLedger({ owner: deployerAddress(), operator, tariffWeiPerPulse: TARIFF });
  await send(fresh, "bindMachine", [machineEoa]);
  await send(fresh, "topUp", [], { value: 100n * TARIFF });
  const uuid = "e44e6d2c-a218-4e75-b422-041096bba39f";
  const r = report(1n, 30n, MODE.INSPECT, { reason: 4, model: 1, salt: 77, sensors: `0x${"ab".repeat(32)}`, requestId: uuid });
  const data = encodeReportPacked(r);
  assert.equal((data.length - 2) / 2, 63, "63 bytes");
  assert.equal(data.slice(0, 10), "0x4d505231");
  const strangerTx = rpc("eth_call", [{ from: stranger, to: fresh, data }, "latest"]);
  await reverts(strangerTx, "NotMachine");
  await reverts(rpc("eth_call", [{ from: machineEoa, to: fresh, data: data.slice(0, -2) as Hex }, "latest"]), "BadPacked");
  await reverts(rpc("eth_call", [{ from: machineEoa, to: fresh, data: ("0xdeadbeef" + data.slice(10)) as Hex }, "latest"]), "BadPacked");
  await reverts(rpc("eth_call", [{ from: machineEoa, to: fresh, data: (data.slice(0, 42) + "09" + data.slice(44)) as Hex }, "latest"]), "BadMode");
  const { hash, receipt } = await sendLegacy({ to: fresh, data, key: machineKey });
  assert.equal(receipt.status, "0x1", hash);
  const [ev] = parseEventLogs({ abi: LEDGER_ABI, logs: receipt.logs, eventName: "ReportPacked" }) as any[];
  assert.deepEqual([ev.args.seq, ev.args.total, ev.args.usage, ev.args.charged, ev.args.owed, ev.args.mode, ev.args.reason, ev.args.model, ev.args.salt], [1n, 30n, 30n, 30n * TARIFF, 0n, MODE.INSPECT, 4, 1, 77]);
  assert.equal(ev.args.sensors, `0x${"ab".repeat(20)}`);
  assert.equal(bytes16Uuid(ev.args.requestId), uuid, "the full request id is on chain");
  const s = await status(fresh);
  assert.deepEqual([s.credit, s.earned, s.arrears, s.hold, s.lastSeq, s.lastTotal], [70n * TARIFF, 30n * TARIFF, 0n, true, 1n, 30n]);
  await reverts(rpc("eth_call", [{ from: machineEoa, to: fresh, data: encodeReportPacked(report(1n, 31n)) }, "latest"]), "StaleSeq");
  await reverts(rpc("eth_call", [{ from: machineEoa, to: fresh, data: encodeReportPacked(report(2n, 29n)) }, "latest"]), "TotalWentDown");
  await solvent(fresh);
});

test("DEV3-T12: the account's root() and pubSeed() return its key, and it refuses anything else", async () => {
  assert.equal(await rpc("eth_call", [{ to: account, data: "0xebf0c717" }, "latest"]), toHex(key.root));
  assert.equal(await rpc("eth_call", [{ to: account, data: "0x63e71ad4" }, "latest"]), toHex(key.pubSeedWord));
  await assert.rejects(rpc("eth_call", [{ from: stranger, to: account, data: "0xebf0c717", value: "0x1" }, "latest"]), "value refused");
  await assert.rejects(rpc("eth_call", [{ to: account, data: "0x12345678" }, "latest"]), "unknown selector refused");
});

test("DEV3-T8 and T9: three reports through full 4-frame transactions are mined, and each event matches its inputs", async () => {
  const cases: Report[] = [
    report(1n, 7n, MODE.RUN, { requestId: "" }),
    report(2n, 19n, MODE.INSPECT, { reason: 7, confidence: 91, model: 1, sensors: toHex(keccak_256(new Uint8Array([1]))), requestId: "0123456789abcdef" }),
    report(3n, 19n, MODE.SAFE_STOP, { reason: 255, confidence: 100, model: 2, salt: 0xfffffff0, sensors: `0x${"ff".repeat(32)}`, requestId: "123e4567-e89b-12d3-a456-426614174000" }),
  ];
  assert.deepEqual(cases.map((c) => c.requestId.length), [0, 16, 36]);
  await send(ledger, "topUp", [], { value: 10n * TARIFF });
  for (const input of cases) {
    const nonce = await getNonce(account);
    // The device's step guard: change the salt until the digest fits.
    let r = input;
    let tx = buildTx({ account, nonce, target: ledger, data: encodeReport(r), paymaster });
    while (steps(tx) > DEVICE_STEP_LIMIT) {
      r = { ...r, salt: (r.salt + 1) >>> 0 };
      tx = buildTx({ account, nonce, target: ledger, data: encodeReport(r), paymaster });
    }
    const signed = signTx(tx, key);
    const sim = await simulate(signed);
    assert.equal(sim.executionStatus, "success", sim.executionError ?? "");
    const hash = await submit(signed);
    const receipt = await waitMined(hash);
    assert.equal(receipt.status, "0x1");
    assert.deepEqual(receipt.frameReceipts.map((f: any) => f.status), ["0x1", "0x1", "0x1", "0x1"], `seq ${r.seq} frames`);
    const [ev] = parseEventLogs({ abi: LEDGER_ABI, logs: receipt.logs, eventName: "Report" }) as any[];
    assert.ok(ev, "Report event present");
    assert.equal(ev.address.toLowerCase(), ledger.toLowerCase());
    const a = ev.args;
    assert.deepEqual(
      [a.seq, a.total, a.mode, a.reason, a.confidence, a.model, a.salt, a.sensors, a.requestId],
      [r.seq, r.total, r.mode, r.reason, r.confidence, r.model, r.salt, r.sensors, r.requestId],
    );
    console.log(`  seq ${r.seq}: steps ${steps(tx)}, frames ${receipt.frameReceipts.map((f: any) => Number(f.gasUsed)).join(" / ")}, total ${Number(receipt.gasUsed)} gas, max cost ${BigInt(sim.maxCost)} wei`);
  }
  const s = await status(ledger);
  assert.deepEqual([s.lastSeq, s.lastTotal, s.hold, s.lastMode], [3n, 19n, true, MODE.SAFE_STOP]);
  assert.deepEqual([s.credit, s.earned, s.arrears], [0n, 10n * TARIFF, 9n * TARIFF], "19 pulses: 10 paid from credit, 9 owed");
  assert.equal(await getBalance(account), 0n, "the account paid nothing");
  await solvent(ledger);
});

test("worst case fits the frame limits: first report on an unfunded ledger, INSPECT, 64-byte request ID", async () => {
  // This report has to create the ledger's second storage slot, which is the most expensive thing a report does.
  const fresh = await deployLedger({ owner: deployerAddress(), operator, tariffWeiPerPulse: TARIFF });
  const k = new WotsKey(keccak_256(new TextEncoder().encode(`mohar worst case ${Date.now()}`)));
  const acct = await deployAccount({ key: k, target: fresh, selector: REPORT_SELECTOR, stake: STAKE });
  await send(fresh, "bindMachine", [acct]);
  const { receipt: pol } = await sendLegacy({ to: paymaster, data: encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "setPolicy", args: [acct, 10n, 3_000_000n] }) });
  assert.equal(pol.status, "0x1");
  let r = report(1n, 1_000_000n, MODE.INSPECT, { reason: 200, confidence: 100, model: 255, sensors: `0x${"ab".repeat(32)}`, requestId: "r".repeat(64) });
  let tx = buildTx({ account: acct, nonce: 1n, target: fresh, data: encodeReport(r), paymaster });
  while (steps(tx) > DEVICE_STEP_LIMIT) {
    r = { ...r, salt: r.salt + 1 };
    tx = buildTx({ account: acct, nonce: 1n, target: fresh, data: encodeReport(r), paymaster });
  }
  const signed = signTx(tx, k);
  const sim = await simulate(signed);
  assert.equal(sim.executionStatus, "success", sim.executionError ?? "");
  const receipt = await waitMined(await submit(signed));
  assert.deepEqual(receipt.frameReceipts.map((f: any) => f.status), ["0x1", "0x1", "0x1", "0x1"]);
  const frames = receipt.frameReceipts.map((f: any) => Number(f.gasUsed));
  const outside = Number(receipt.gasUsed) - frames.reduce((a: number, b: number) => a + b, 0);
  console.log(`  worst case: report frame ${frames[2]} gas, gas outside frames ${outside} (intrinsic plus state), total ${Number(receipt.gasUsed)}, max cost ${BigInt(sim.maxCost)} wei`);
  const s = await status(fresh);
  assert.deepEqual([s.hold, s.arrears, s.credit], [true, 1_000_000n * TARIFF, 0n]);
});
