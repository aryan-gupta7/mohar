// DEV5-T9: the board builds, signs and returns whole transactions by itself. The laptop only forwards the bytes.
// Deploys fresh contracts for the board's key, then runs three reports. The board must hold the key it reports.
// Usage: MOHAR_NET=local-alt node signer/tools/device-report.ts [serial-port]
import { execFileSync } from "node:child_process";
import path from "node:path";
import { decodeTx } from "@forshtat/hegota-support/tx";
import { toWire } from "@forshtat/hegota-support/rpc";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeFunctionData, decodeFunctionResult, type Address, type Hex } from "viem";
import { deployerAddress, getBalance, getNonce, rpc, sendLegacy, waitMined } from "../src/devnet.ts";
import { LEDGER_ABI, PAYMASTER_ABI, REPORT_SELECTOR, STAKE, deployAccount, deployLedger, deployPaymaster, hashOf, simulate } from "../src/mohar.ts";
import { fromHex, toHex, type WotsKey } from "../src/wots.ts";

const port = process.argv[2] ?? "/dev/serial/by-id/usb-1a86_USB_Single_Serial_5717135611-if00";
const py = (...args: string[]) =>
  JSON.parse(execFileSync("uv", ["run", "--quiet", "--no-project", "--with", "pyserial", "python", "-I", path.resolve(import.meta.dirname, "../../firmware/tools/device_sign.py"), port, ...args]).toString());

const info = py("info");
const publicKey = { root: fromHex(info.root), pubSeedWord: Uint8Array.from([...fromHex(info.pubSeed), ...new Uint8Array(16)]) } as unknown as WotsKey;
const ledger = await deployLedger({ owner: deployerAddress(), operator: deployerAddress(), tariffWeiPerPulse: 1_000_000_000n });
const account = await deployAccount({ key: publicKey, target: ledger, selector: REPORT_SELECTOR, stake: STAKE });
const send = async (to: Address, abi: any, functionName: string, args: unknown[] = [], value?: bigint) => {
  const { receipt } = await sendLegacy({ to, data: encodeFunctionData({ abi, functionName, args } as any), value });
  if (receipt.status !== "0x1") throw new Error(`${functionName} reverted`);
};
await send(ledger, LEDGER_ABI, "bindMachine", [account]);
await send(ledger, LEDGER_ABI, "topUp", [], 10n ** 15n);
const paymaster = await deployPaymaster({ stake: STAKE, funding: 10n ** 17n });
await send(paymaster, PAYMASTER_ABI, "setPolicy", [account, 10n, 3_000_000n]);
console.log(`board key ${info.root.slice(0, 18)}…  account ${account}  ledger ${ledger}`);

const hex = (a: string) => a.toLowerCase().replace(/^0x/, "");
const status = async () => {
  const out = await rpc<Hex>("eth_call", [{ to: ledger, data: encodeFunctionData({ abi: LEDGER_ABI, functionName: "status" }) }, "latest"]);
  const [credit, hold, lastSeq, lastTotal] = decodeFunctionResult({ abi: LEDGER_ABI, functionName: "status", data: out }) as any;
  return { credit, hold, lastSeq, lastTotal };
};

for (let i = 1; i <= 3; i++) {
  const nonce = await getNonce(account);
  const mode = i === 2 ? 1 : 0; // the second report is an INSPECT, to see the hold land on chain
  const reqId = Buffer.from(`device-built-${i}`).toString("hex");
  const args = [hex(account), hex(ledger), hex(paymaster), String(nonce), "1000000", "2000000000", String(i), String(i * 40), String(mode), "0", "0", "0", "0", "00".repeat(32), reqId];
  const out = py("report", ...args);
  if (out.result !== "OK") throw new Error(`board refused: ${JSON.stringify(out)}`);
  const tx = decodeTx(profile, out.raw as Hex);
  const sim = await simulate(tx as any);
  if (sim.executionStatus !== "success") throw new Error(`simulation failed: ${sim.executionError}`);
  const hash = await rpc<Hex>("eth_sendFrameTransaction", [toWire(tx)]);
  if (hash.toLowerCase() !== hashOf(tx as any).toLowerCase()) throw new Error("hash mismatch");
  const receipt = await waitMined(hash, 120);
  const frames = receipt.frameReceipts.map((f: any) => f.status);
  console.log(`report ${i}: nonce ${nonce}, leaf ${out.fields.leaf}, steps ${out.fields.steps}, ${frames.join(" ")}, status ${receipt.status}`);
  if (receipt.status !== "0x1" || frames.some((f: string) => f !== "0x1")) throw new Error("not all frames succeeded");
}
const s = await status();
console.log(`ledger: lastSeq ${s.lastSeq}, lastTotal ${s.lastTotal}, hold ${s.hold}, credit ${s.credit}; account balance ${await getBalance(account)}`);
if (s.lastSeq !== 3n || s.lastTotal !== 120n || s.hold !== true) throw new Error("ledger state is not what the three reports imply");
console.log("DEV5-T9 PASS: three transactions built and signed by the ESP8266 were admitted and mined; the laptop only forwarded bytes");
