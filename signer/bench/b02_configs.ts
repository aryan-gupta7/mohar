// Bench 2: the four configurations, same report, same contracts, same fees.
//   baseline  w=16, ABI report      A  w=16, compact report      B  w=32, ABI report      C  w=32, compact report
// Local chain + the real alt mempool sidecar (MOHAR_NET=local-alt). For each: raw bytes, gas (simulated steady state, and the first
// slot-creating report), account validation gas, hash steps (so ESP time), and a real mined transaction admitted by the sidecar.
import fs from "node:fs";
import path from "node:path";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { concat, decodeEventLog, encodeAbiParameters, encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { STAKING_REGISTRY, deployerAddress, getNonce, sendLegacy, waitMined, rpc } from "../src/devnet.ts";
import { LEDGER_ABI, LIMITS, MODE, PAYMASTER_ABI, STAKE, UNSTAKE_DELAY, REPORT_SELECTOR, artifact, buildTx, deployLedger, deployPaymaster, digestOf, encodeReport, rawTx, simulate, submit, hashOf } from "../src/mohar.ts";
import { toHex } from "../src/wots.ts";
import { Params, WotsKeyW } from "../src/wots_w.ts";

const SAMPLES = Number(process.env.SAMPLES ?? 24);
const PACKED_SELECTOR = 0x4d505231n;
const ZERO = `0x${"00".repeat(32)}` as Hex;
const rnd = (i: number) => keccak_256(new TextEncoder().encode(`sample ${i}`));

type Cfg = { name: string; w: 16 | 32; packed: boolean; verifyGas: bigint; stepLimit: number };
const CONFIGS: Cfg[] = [
  { name: "baseline  w=16 ABI report    ", w: 16, packed: false, verifyGas: 90_000n, stepLimit: 630 },
  { name: "A         w=16 compact report", w: 16, packed: true, verifyGas: 90_000n, stepLimit: 630 },
  { name: "B         w=32 ABI report    ", w: 32, packed: false, verifyGas: 160_000n, stepLimit: 1200 },
  { name: "C         w=32 compact report", w: 32, packed: true, verifyGas: 160_000n, stepLimit: 1200 },
];

/** The 63-byte compact report. The 20-byte sensors are the first 20 bytes of the 32-byte word (the rest was a copy of `total` and zeros); the request id is the UUID's raw 16 bytes. */
function packed(seq: bigint, total: bigint, mode: number, reason: number, model: number, salt: number, sensors32: Hex, requestId: string): Hex {
  const u = (v: bigint | number, bytes: number) => BigInt(v).toString(16).padStart(bytes * 2, "0");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId) ? requestId.replace(/-/g, "") : "00".repeat(16);
  return `0x${u(PACKED_SELECTOR, 4)}${u(seq, 8)}${u(total, 8)}${u(mode, 1)}${u(reason, 1)}${u(model, 1)}${u(salt, 4)}${sensors32.slice(2, 42)}${uuid}` as Hex;
}
const sensors32 = (i: number): Hex => `0x${Buffer.from(keccak_256(new Uint8Array([i]))).toString("hex")}`;
const REQ = "e44e6d2c-a218-4e75-b422-041096bba39f"; // a real-length 0G request id (36 chars)

async function deployAccountVariant(cfg: Cfg, root: Uint8Array, pubSeedWord: Uint8Array, target: Address, selector: bigint): Promise<Address> {
  const name = cfg.w === 32 ? "MoharAccountW32" : "MoharAccount";
  const args = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
    [toHex(root), toHex(pubSeedWord), target, selector, STAKING_REGISTRY, STAKE, UNSTAKE_DELAY],
  );
  const { receipt } = await sendLegacy({ to: null, data: concat([artifact(name), args]), value: STAKE });
  if (receipt.status !== "0x1") throw new Error(`${name} deploy failed`);
  return receipt.contractAddress as Address;
}

const only = (process.env.ONLY ?? "").split(",").filter(Boolean);
const rows: any[] = [];
for (const cfg of CONFIGS.filter((c) => !only.length || only.includes(c.name.trim()[0] === "b" ? "baseline" : c.name.trim()[0]))) {
  const P = new Params(cfg.w);
  const key = new WotsKeyW(keccak_256(new TextEncoder().encode(`bench2 ${cfg.name} ${Date.now()}`)), P);
  const ledger = await deployLedger({ owner: deployerAddress(), operator: deployerAddress(), tariffWeiPerPulse: 1_000_000_000n });
  const account = await deployAccountVariant(cfg, key.root, key.pubSeedWord, ledger, cfg.packed ? PACKED_SELECTOR : BigInt(REPORT_SELECTOR));
  const send = (to: Address, data: Hex, value?: bigint) => sendLegacy({ to, data, value });
  await send(ledger, encodeFunctionData({ abi: LEDGER_ABI, functionName: "bindMachine", args: [account] }));
  await send(ledger, encodeFunctionData({ abi: LEDGER_ABI, functionName: "topUp" }), 10n ** 16n);
  const paymaster = await deployPaymaster({ stake: STAKE, funding: 10n ** 17n });
  await send(paymaster, encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "setPolicy", args: [account, 100_000n, 3_000_000n] }));
  LIMITS.accountVerify = cfg.verifyGas;

  /** Builds and signs one report for `nonce`, raising the salt until the verifier fits the config's step limit. */
  const make = (nonce: bigint, i: number, seq: bigint) => {
    let salt = 0;
    const data = () => (cfg.packed ? packed(seq, BigInt(100 + i), MODE.RUN, 0, 1, salt, sensors32(i), REQ) : encodeReport({ seq, total: BigInt(100 + i), mode: MODE.RUN, reason: 0, confidence: 0, model: 1, salt, sensors: sensors32(i), requestId: REQ }));
    let tx = buildTx({ account, nonce, target: ledger, data: data(), paymaster });
    while (P.verifySteps(digestOf(tx)) > cfg.stepLimit) { salt++; tx = buildTx({ account, nonce, target: ledger, data: data(), paymaster }); }
    const digest = digestOf(tx);
    const sig = key.sign(digest, Number(nonce) - 1);
    return { tx: { ...tx, signatures: [{ ...tx.signatures[0], signature: toHex(sig) }] }, digest };
  };

  // 1. The first report on a fresh ledger (creates a storage slot), really mined through the alt mempool.
  const first = make(1n, 0, 1n);
  const hash1 = await submit(first.tx);
  const rc1 = await waitMined(hash1, 240);
  const firstGas = Number(rc1.gasUsed);
  const firstOk = rc1.status === "0x1" && rc1.frameReceipts.every((f: any) => f.status === "0x1");

  // 2. Steady state: simulate many reports at nonce 2.
  const gasS: number[] = [], valS: number[] = [], bytesS: number[] = [], vsteps: number[] = [], ssteps: number[] = [];
  let simFail = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    const { tx, digest } = make(2n, i, 2n);
    const sim = await simulate(tx);
    if (sim.executionStatus !== "success") { simFail++; continue; }
    gasS.push(Number(sim.gasUsed)); valS.push(Number(sim.frames![0].gasUsed)); bytesS.push((rawTx(tx).length - 2) / 2);
    vsteps.push(P.verifySteps(digest)); ssteps.push(P.signSteps(digest));
  }
  // 3. One steady-state report really mined, with its ledger event decoded.
  const second = make(2n, 99, 2n);
  const hash2 = await submit(second.tx);
  const rc2 = await waitMined(hash2, 240);
  const ev = rc2.logs.find((l: any) => l.address.toLowerCase() === ledger.toLowerCase());
  const st = await rpc<Hex>("eth_call", [{ to: ledger, data: encodeFunctionData({ abi: LEDGER_ABI, functionName: "status" }) }, "latest"]);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length, max = (a: number[]) => Math.max(...a);
  const row = {
    config: cfg.name, w: cfg.w, packed: cfg.packed, signatureBytes: P.sigBytes, reportCalldataBytes: cfg.packed ? 63 : 4 + 32 * 9 + 32 + 32 * Math.ceil(REQ.length / 32) + 32,
    rawTxBytes: Math.round(avg(bytesS)), steadyGasAvg: Math.round(avg(gasS)), steadyGasMax: max(gasS), firstReportGas: firstGas,
    accountValidationGasAvg: Math.round(avg(valS)), accountValidationGasMax: max(valS), verifyLimit: Number(cfg.verifyGas),
    verifyStepsAvg: Math.round(avg(vsteps)), verifyStepsMax: max(vsteps), signStepsAvg: Math.round(avg(ssteps)), signStepsMax: max(ssteps),
    espSignMsAvg: Math.round(avg(ssteps) * 0.88 + 30), espSignMsWorst: Math.round(P.chains * (cfg.w - 1) * 0.88 + 30),
    floorPrediction64PerByte: Math.round(3248 + 64 * avg(bytesS)),
    minedFirst: firstOk, minedSecond: rc2.status === "0x1" && rc2.frameReceipts.every((f: any) => f.status === "0x1"), minedSecondGas: Number(rc2.gasUsed),
    simFailures: simFail, ledgerEventEmitted: !!ev, ledgerStatusWordsOk: st.length >= 2 + 9 * 64,
  };
  rows.push(row);
  console.log(`${cfg.name} | sig ${row.signatureBytes} B | raw tx ${row.rawTxBytes} B | steady ${row.steadyGasAvg} gas (floor@64/B ${row.floorPrediction64PerByte}) | first ${row.firstReportGas} | validation ${row.accountValidationGasAvg} avg / ${row.accountValidationGasMax} max | verify steps ${row.verifyStepsAvg}/${row.verifyStepsMax} | ESP sign ~${row.espSignMsAvg} ms (worst ${row.espSignMsWorst}) | mined ${row.minedFirst && row.minedSecond}`);
}
fs.mkdirSync(path.resolve(import.meta.dirname, "../../docs/evidence"), { recursive: true });
fs.writeFileSync(path.resolve(import.meta.dirname, "../../docs/evidence/bench-configs-" + (process.env.MOHAR_NET ?? "local") + ".json"), JSON.stringify({ at: new Date().toISOString(), samples: SAMPLES, rows }, null, 2) + "\n");
console.log("saved docs/evidence/bench-configs.json");
