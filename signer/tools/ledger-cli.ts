// Operator actions and reads on a ledger, for tests. Acts as the deployer, who is the owner and operator of test ledgers.
// Usage: MOHAR_NET=local-alt node signer/tools/ledger-cli.ts deploy <root> <pubSeed>   -> JSON with addresses (compact report selector; REPORT_FORMAT=abi for the old one)
//        MOHAR_NET=local-alt node signer/tools/ledger-cli.ts status <ledger>
//        MOHAR_NET=local-alt node signer/tools/ledger-cli.ts topup <ledger> <pulses>   (tariff-sized units)
//        MOHAR_NET=local-alt node signer/tools/ledger-cli.ts clearhold <ledger>
import { decodeFunctionResult, encodeFunctionData, type Address, type Hex } from "viem";
import { deployerAddress, getBalance, rpc, sendLegacy } from "../src/devnet.ts";
import { LEDGER_ABI, PACKED_SELECTOR, PAYMASTER_ABI, REPORT_SELECTOR, STAKE, deployAccount, deployLedger, deployPaymaster } from "../src/mohar.ts";
import { fromHex, type WotsKey } from "../src/wots.ts";

const TARIFF = 1_000_000_000n;
const [cmd, a, b] = process.argv.slice(2);
const send = async (to: Address, abi: any, functionName: string, args: unknown[] = [], value?: bigint) => {
  const { receipt } = await sendLegacy({ to, data: encodeFunctionData({ abi, functionName, args } as any), value });
  if (receipt.status !== "0x1") throw new Error(`${functionName} reverted`);
};
const status = async (ledger: Address) => {
  const out = await rpc<Hex>("eth_call", [{ to: ledger, data: encodeFunctionData({ abi: LEDGER_ABI, functionName: "status" }) }, "latest"]);
  const [credit, hold, lastSeq, lastTotal, tariff, earned, arrears, lastMode, ledgerMode] = decodeFunctionResult({ abi: LEDGER_ABI, functionName: "status", data: out }) as any;
  return { creditPulses: Number(credit / TARIFF), hold, lastSeq: Number(lastSeq), lastTotal: Number(lastTotal), earnedPulses: Number(earned / TARIFF), arrearsPulses: Number(arrears / TARIFF), lastMode, ledgerMode };
};

if (cmd === "deploy") {
  const key = { root: fromHex(a), pubSeedWord: Uint8Array.from([...fromHex(b), ...new Uint8Array(16)]) } as unknown as WotsKey;
  const ledger = await deployLedger({ owner: deployerAddress(), operator: deployerAddress(), tariffWeiPerPulse: TARIFF });
  const account = await deployAccount({ key, target: ledger, selector: process.env.REPORT_FORMAT === "abi" ? REPORT_SELECTOR : PACKED_SELECTOR, stake: STAKE });
  await send(ledger, LEDGER_ABI, "bindMachine", [account]);
  const paymaster = await deployPaymaster({ stake: STAKE, funding: 10n ** 17n });
  await send(paymaster, PAYMASTER_ABI, "setPolicy", [account, 200n, 3_000_000n]);
  console.log(JSON.stringify({ account, ledger, paymaster }));
} else if (cmd === "status") {
  console.log(JSON.stringify(await status(a as Address)));
} else if (cmd === "topup") {
  await send(a as Address, LEDGER_ABI, "topUp", [], BigInt(b) * TARIFF);
  console.log(JSON.stringify(await status(a as Address)));
} else if (cmd === "clearhold") {
  await send(a as Address, LEDGER_ABI, "clearHold", []);
  console.log(JSON.stringify(await status(a as Address)));
} else {
  console.error("usage: deploy|status|topup|clearhold");
  process.exit(2);
}
