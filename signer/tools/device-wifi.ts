// DEV6-T4: the board signs and submits whole transactions over Wi-Fi by itself, to the local alt mempool.
// The laptop only provides the chain (and a bridge on the hotspot address); it does not touch the transaction.
// Needs: local chain + producer + sidecar running, the laptop on the same hotspot as the board, and a socat bridge
// from the laptop's hotspot address to the sidecar (see mechanism.md Test 8f).
// Usage: MOHAR_NET=local-alt node signer/tools/device-wifi.ts <laptop-hotspot-ip>
import { execFileSync } from "node:child_process";
import path from "node:path";
import { encodeFunctionData, decodeFunctionResult, type Address, type Hex } from "viem";
import { deployerAddress, getBalance, getNonce, rpc, sendLegacy, waitMined } from "../src/devnet.ts";
import { LEDGER_ABI, PAYMASTER_ABI, REPORT_SELECTOR, STAKE, deployAccount, deployLedger, deployPaymaster } from "../src/mohar.ts";
import { fromHex, type WotsKey } from "../src/wots.ts";

const laptop = process.argv[2];
if (!laptop) throw new Error("usage: device-wifi.ts <laptop hotspot ip>");
const port = process.env.ESP_PORT ?? "/dev/serial/by-id/usb-1a86_USB_Single_Serial_5717135611-if00";
const py = (...args: string[]) => {
  try {
    return JSON.parse(execFileSync("uv", ["run", "--quiet", "--no-project", "--with", "pyserial", "python", "-I", path.resolve(import.meta.dirname, "../../firmware/tools/device_sign.py"), port, ...args]).toString());
  } catch (e: any) {
    const out = e.stdout?.toString().trim();
    throw new Error(`board helper failed: ${out || e.stderr?.toString().slice(-300)}`);
  }
};

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
py("reset"); // a fresh account starts at nonce 1, so the board's leaf counter must start at 0 too
console.log(`board key ${info.root.slice(0, 18)}…  account ${account}`);

const hex = (a: string) => a.toLowerCase().replace(/^0x/, "");
for (let i = 1; i <= 3; i++) {
  const nonce = await getNonce(account);
  const args = [laptop, "14337", "0", hex(account), hex(ledger), hex(paymaster), String(nonce), "1000000", "2000000000", String(i), String(i * 40), "0", "0", "0", "0", "0", "00".repeat(32), Buffer.from(`wifi-${i}`).toString("hex")];
  const out = py("submit", ...args);
  if (out.error) throw new Error(out.error);
  const s = out.submit;
  console.log("  board reports:", JSON.stringify(s), "body:", out.body.slice(0, 200));
  const body = out.body ? JSON.parse(out.body) : {};
  if (s.status !== "200" || !body.result) throw new Error(`board submit failed: ${JSON.stringify(out)}`);
  if (body.result.toLowerCase() !== out.localHash.toLowerCase()) throw new Error(`hash mismatch: node ${body.result}, device ${out.localHash}`);
  const receipt = await waitMined(body.result as Hex, 120);
  const frames = receipt.frameReceipts.map((f: any) => f.status);
  console.log(`report ${i}: nonce ${nonce}, send ${s.totalMs} ms, heap low ${s.heapLowest}, hash matches, ${frames.join(" ")}, status ${receipt.status}`);
  if (receipt.status !== "0x1" || frames.some((f: string) => f !== "0x1")) throw new Error("not all frames succeeded");
}
const out = await rpc<Hex>("eth_call", [{ to: ledger, data: encodeFunctionData({ abi: LEDGER_ABI, functionName: "status" }) }, "latest"]);
const [, , lastSeq, lastTotal] = decodeFunctionResult({ abi: LEDGER_ABI, functionName: "status", data: out }) as any;
console.log(`ledger lastSeq ${lastSeq}, lastTotal ${lastTotal}; account balance ${await getBalance(account)}`);
if (lastSeq !== 3n || lastTotal !== 120n) throw new Error("ledger state is not what three reports imply");
console.log("DEV6-T4 PASS: the board signed and submitted three transactions over Wi-Fi; the node's hashes equal the board's own");
