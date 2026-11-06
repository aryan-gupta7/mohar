// Funds a key's address on the LOCAL chain from the local deployer. Refuses to run against the public devnet.
// Usage: MOHAR_NET=local node devnet/fund.ts <key-file> [eth]
// Prints the funded address.
import fs from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { NETWORK, getBalance, sendLegacy } from "../signer/src/devnet.ts";

const [keyFile, eth = "10"] = process.argv.slice(2);
if (NETWORK !== "local") throw new Error("fund.ts only runs with MOHAR_NET=local");
if (!keyFile) throw new Error("usage: node devnet/fund.ts <key-file> [eth]");
const address = privateKeyToAccount(fs.readFileSync(keyFile, "utf8").trim() as Hex).address;
const want = BigInt(Math.round(Number(eth) * 1e6)) * 10n ** 12n;
const have = await getBalance(address);
if (have < want) {
  const { receipt } = await sendLegacy({ to: address, value: want - have });
  if (receipt.status !== "0x1") throw new Error(`funding ${address} failed`);
}
console.log(address);
