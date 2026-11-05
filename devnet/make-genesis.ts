// Builds a local genesis that mirrors the public devnet (chain 1337) so contracts behave the same.
// It uses devnet/snapshot.json, a committed copy of the public devnet's chain config and system contracts,
// so the local chain still works if the public devnet is down or has been reset.
//
// Usage:
//   node devnet/make-genesis.ts            build devnet/genesis.local.json from the snapshot
//   node devnet/make-genesis.ts --refresh  fetch a new snapshot from the public devnet first
import fs from "node:fs";
import path from "node:path";
import { deployerAddress } from "../signer/src/devnet.ts";

const PUBLIC_RPC = "https://altmempool.forshtat.com";
const SNAPSHOT = path.resolve(import.meta.dirname, "snapshot.json");
const OUT = path.resolve(import.meta.dirname, "genesis.local.json");

// Contracts the chain itself relies on, and the staking registry the mempool reads.
const CONTRACTS: Record<string, string> = {
  "0x0000000000000000000000000000000000008250": "EIP-8250 nonce manager",
  "0x0000000000000000000000000000000000008272": "EIP-8272 recent roots",
  "0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02": "EIP-4788 beacon roots",
  "0x0000F90827F1C53a10cb7A02335B175320002935": "EIP-2935 block hashes",
  "0x00000961Ef480Eb55e80D19ad83579A64c007002": "EIP-7002 withdrawals",
  "0x0000BBdDc7CE488642fb579F8B00f3a590007251": "EIP-7251 consolidations",
  "0x0000BFF46984E3725691FA540A8C7589300D8282": "EIP-8282 system contract A",
  "0x000064d678505ad48f8ccb093bc65613800e8282": "EIP-8282 system contract B",
  "0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f": "NaiveStakingRegistry",
};

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(PUBLIC_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as any;
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

type Snapshot = { client: string; takenAt: string; config: Record<string, unknown>; code: Record<string, string> };

async function refresh(): Promise<void> {
  const code: Record<string, string> = {};
  for (const [address, label] of Object.entries(CONTRACTS)) {
    code[address] = await rpc("eth_getCode", [address, "latest"]);
    if (code[address] === "0x") throw new Error(`${label} (${address}) has no code on the public devnet`);
    console.log(`copied ${label}: ${(code[address].length - 2) / 2} bytes`);
  }
  const snapshot: Snapshot = {
    client: await rpc("web3_clientVersion", []),
    takenAt: new Date().toISOString(),
    config: await rpc("debug_chainConfig", []),
    code,
  };
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`wrote ${SNAPSHOT} from ${snapshot.client}`);
}

if (process.argv.includes("--refresh")) await refresh();
const snapshot: Snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));

// Every fork is active from genesis on the local chain, so there's nothing to wait for.
const config: Record<string, unknown> = { ...snapshot.config, amsterdamTime: 0, hegotaTime: 0 };
for (const key of Object.keys(config)) if (config[key] === null) delete config[key];

const alloc: Record<string, unknown> = {};
for (const [address, label] of Object.entries(CONTRACTS)) {
  const entry: Record<string, unknown> = { balance: "0x0", nonce: "0x1", code: snapshot.code[address] };
  // The EIP-8282 contracts start with this one storage value, as in the devnet's genesis settings.
  if (label.startsWith("EIP-8282")) entry.storage = { ["0x" + "00".repeat(32)]: "0x" + "ff".repeat(32) };
  alloc[address] = entry;
}

const deployer = deployerAddress();
alloc[deployer] = { balance: "0x" + (1_000_000n * 10n ** 18n).toString(16) };

const genesis = {
  config,
  nonce: "0x0",
  timestamp: "0x" + Math.floor(Date.now() / 1000).toString(16),
  extraData: "0x",
  gasLimit: "0x3938700",
  difficulty: "0x0",
  mixHash: "0x" + "00".repeat(32),
  coinbase: "0x" + "00".repeat(20),
  baseFeePerGas: "0x7",
  alloc,
};
fs.writeFileSync(OUT, JSON.stringify(genesis, null, 2) + "\n");
console.log(`genesis ready: local deployer ${deployer} funded with 1,000,000 ETH (local chain only)`);
