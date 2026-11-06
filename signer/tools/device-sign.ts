// DEV4-T8: the board signs a real transaction, and the chain accepts it.
// Deploys an account that trusts the board's own public key, then has the board sign report #1 for it.
// Usage: MOHAR_NET=local node signer/tools/device-sign.ts [serial-port]
// The board must already have its key (it makes one on first boot). Uses leaf 0 of the board's tree, so run
// it once per key, or the chain's nonce and the board's leaf will no longer line up.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { deployerAddress, getBalance, rpc, sendLegacy, waitMined } from "../src/devnet.ts";
import {
  DEVICE_STEP_LIMIT, LEDGER_ABI, MODE, PAYMASTER_ABI, REPORT_SELECTOR, STAKE, buildTx, deployAccount, deployLedger,
  deployPaymaster, digestOf, encodeReport, simulate, steps, submit,
} from "../src/mohar.ts";
import { WotsKey, fromHex, recoverRoot, toHex } from "../src/wots.ts";

const port = process.argv[2] ?? "/dev/serial/by-id/usb-1a86_USB_Single_Serial_5717135611-if00";
const py = (...args: string[]) =>
  JSON.parse(execFileSync("uv", ["run", "--quiet", "--no-project", "--with", "pyserial", "python", "-I", path.resolve(import.meta.dirname, "../../firmware/tools/device_sign.py"), port, ...args]).toString());

const info = py("info");
console.log("board key:", info.root, info.pubSeed);
const root = fromHex(info.root);
const pubSeed = fromHex(info.pubSeed);

// The account takes root and pubSeed as plain bytes; deployAccount wants a WotsKey, so give it just those two fields.
const publicKey = { root, pubSeedWord: Uint8Array.from([...pubSeed, ...new Uint8Array(16)]) } as unknown as WotsKey;

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

const onchainRoot = await rpc<Hex>("eth_call", [{ to: account, data: "0xebf0c717" }, "latest"]);
if (onchainRoot !== info.root) throw new Error(`account root ${onchainRoot} != board root ${info.root}`);
console.log("account", account, "root() equals the board's root");

// The laptop finds a digest within the step limit (DEV-5 moves this onto the board), then the board signs it.
let salt = 0;
const report = (s: number) => encodeReport({ seq: 1n, total: 7n, mode: MODE.RUN, reason: 0, confidence: 0, model: 0, salt: s, sensors: `0x${"00".repeat(32)}`, requestId: "" });
let tx = buildTx({ account, nonce: 1n, target: ledger, data: report(salt), paymaster });
while (steps(tx) > DEVICE_STEP_LIMIT) tx = buildTx({ account, nonce: 1n, target: ledger, data: report(++salt), paymaster });
const digest = digestOf(tx);
console.log(`digest ${toHex(digest)} (${steps(tx)} verifier steps, salt ${salt})`);

const signed = py("sign", "0", Buffer.from(digest).toString("hex"));
console.log(`board signed in ${signed.ms} ms`);
const signature = fromHex(signed.signature);
const recovered = recoverRoot(digest, 0, signature, pubSeed);
if (toHex(recovered) !== info.root) throw new Error("the board's signature does not lead to its own root");

const full = { ...tx, signatures: [{ scheme: 0, signer: "0x" as Hex, msg: "0x" as Hex, signature: signed.signature as Hex }] };
const sim = await simulate(full);
if (sim.executionStatus !== "success") throw new Error(`simulation failed: ${sim.executionError}`);
const hash = await submit(full);
const receipt = await waitMined(hash, 120);
const frames = receipt.frameReceipts.map((f: any) => f.status);
console.log(`MINED status ${receipt.status}, frames ${JSON.stringify(frames)}, account balance ${await getBalance(account)}`);
if (receipt.status !== "0x1" || frames.some((s: string) => s !== "0x1")) throw new Error("not all frames succeeded");
console.log("DEV4-T8 PASS: a transaction signed by the ESP8266 was accepted on chain");
