// 0G4-T6: after each upload, the newest root is written to the ENS `mohar.log` text record of the device, by the
// uploader key. That key holds ONLY the setter role for that one record (ENS-2): it cannot touch the policy or the root.
// Needs .secrets/ens-uploader.key (git-ignored) with a little Sepolia ETH. If either is missing, it says so and carries on:
// the log on 0G Storage is still valid; only the ENS pointer is not updated.
import fs from "node:fs";
import { bytesToHex, createPublicClient, createWalletClient, http, parseAbi, toBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const ROOT = new URL("..", import.meta.url);
const KEY_FILE = new URL(".secrets/ens-uploader.key", ROOT);
const EVIDENCE = new URL("docs/evidence/ens-1.json", ROOT);
const REG = parseAbi(["function getResolver(string label) view returns (address)"]);
const RES = parseAbi(["function setText(bytes name, string key, string value)"]);

export async function publishLogRoot(device: string, root: string): Promise<void> {
  if (!fs.existsSync(KEY_FILE)) return void console.log(`ENS hook: no uploader key; not updating mohar.log (root ${root})`);
  const label = device.split(".")[0];
  const dns = bytesToHex(Uint8Array.from([...device.split(".").flatMap((l) => [l.length, ...toBytes(l)]), 0]));
  const fleetRegistry = JSON.parse(fs.readFileSync(EVIDENCE, "utf8")).fleetRegistry as Address;
  const client = createPublicClient({ chain: sepolia, transport: http(RPC) });
  const account = privateKeyToAccount(fs.readFileSync(KEY_FILE, "utf8").trim() as Hex);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
  let resolver: Address = "0x0000000000000000000000000000000000000000";
  for (let i = 0; i < 8 && /^0x0+$/.test(resolver); i++) {
    resolver = (await client.readContract({ address: fleetRegistry, abi: REG, functionName: "getResolver", args: [label] })) as Address;
    if (/^0x0+$/.test(resolver)) await new Promise((r) => setTimeout(r, 2000));
  }
  if (/^0x0+$/.test(resolver)) return void console.log(`ENS hook: ${device} has no resolver; mohar.log not updated`);
  const value = `0g://${root}`;
  const hash = await wallet.writeContract({ address: resolver, abi: RES, functionName: "setText", args: [dns, "mohar.log", value] });
  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log(`ENS hook: mohar.log on ${device} set to ${value} (${receipt.status}, ${hash})`);
}
