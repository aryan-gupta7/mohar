// Bench 1: least-squares fit of total transaction gas against raw bytes, account-validation gas, and report-frame gas,
// over many real simulations (different request-id lengths and digests). MOHAR_NET=local node signer/bench/b01_regress.ts
import { keccak_256 } from "@noble/hashes/sha3.js";
import { encodeFunctionData } from "viem";
import { deployerAddress, sendLegacy } from "../src/devnet.ts";
import { DEVICE_STEP_LIMIT, LEDGER_ABI, PAYMASTER_ABI, REPORT_SELECTOR, STAKE, buildTx, deployAccount, deployLedger, deployPaymaster, encodeReport, rawTx, signTx, simulate, steps } from "../src/mohar.ts";
import { WotsKey } from "../src/wots.ts";

const key = new WotsKey(keccak_256(new TextEncoder().encode("bench1 " + Date.now())));
const ledger = await deployLedger({ owner: deployerAddress(), operator: deployerAddress(), tariffWeiPerPulse: 1_000_000_000n });
const account = await deployAccount({ key, target: ledger, selector: REPORT_SELECTOR, stake: STAKE });
await sendLegacy({ to: ledger, data: encodeFunctionData({ abi: LEDGER_ABI, functionName: "bindMachine", args: [account] }) });
await sendLegacy({ to: ledger, data: encodeFunctionData({ abi: LEDGER_ABI, functionName: "topUp" }), value: 10n ** 16n });
const paymaster = await deployPaymaster({ stake: STAKE, funding: 10n ** 17n });
await sendLegacy({ to: paymaster, data: encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "setPolicy", args: [account, 100n, 3_000_000n] }) });

const rows: number[][] = [];
for (let i = 0; i < 48; i++) {
  const len = (i * 7) % 65;
  let salt = i * 1000;
  const mk = () => buildTx({ account, nonce: 1n, target: ledger, paymaster, data: encodeReport({ seq: 1n, total: BigInt(i + 5), mode: 0, reason: 0, confidence: 0, model: 0, salt, sensors: `0x${"00".repeat(32)}`, requestId: "q".repeat(len) }) });
  let tx = mk();
  while (steps(tx) > DEVICE_STEP_LIMIT) { salt++; tx = mk(); }
  const signed = signTx(tx, key);
  const sim = await simulate(signed);
  if (sim.executionStatus !== "success") continue;
  const f = sim.frames!.map((x) => Number(x.gasUsed));
  rows.push([Number(sim.gasUsed), (rawTx(signed).length - 2) / 2, f[0], f[2]]);
}
// least squares: gas = c0 + c1*bytes + c2*frame0 + c3*frame2
const X = rows.map((r) => [1, r[1], r[2], r[3]]), y = rows.map((r) => r[0]);
const T = (m: number[][]) => m[0].map((_, j) => m.map((r) => r[j]));
const mul = (a: number[][], b: number[][]) => a.map((r) => T(b).map((c) => r.reduce((s, v, k) => s + v * c[k], 0)));
const XtX = mul(T(X), X), Xty = mul(T(X), y.map((v) => [v]));
// solve by Gauss
const n = 4, A = XtX.map((r, i) => [...r, Xty[i][0]]);
for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k; [A[i], A[p]] = [A[p], A[i]]; for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j <= n; j++) A[k][j] -= f * A[i][j]; } }
const c = Array(n).fill(0); for (let i = n - 1; i >= 0; i--) c[i] = (A[i][n] - A[i].slice(i + 1, n).reduce((s, v, k) => s + v * c[i + 1 + k], 0)) / A[i][i];
const resid = Math.sqrt(rows.reduce((s, r, i) => s + (y[i] - X[i].reduce((a, v, k) => a + v * c[k], 0)) ** 2, 0) / rows.length);
console.log(`${rows.length} samples. total gas = ${c[0].toFixed(0)} + ${c[1].toFixed(2)} x rawBytes + ${c[2].toFixed(3)} x accountValidationGas + ${c[3].toFixed(3)} x reportFrameGas   (rms error ${resid.toFixed(0)} gas)`);
console.log(`raw bytes range ${Math.min(...rows.map((r) => r[1]))}..${Math.max(...rows.map((r) => r[1]))}; validation gas range ${Math.min(...rows.map((r) => r[2]))}..${Math.max(...rows.map((r) => r[2]))}`);
