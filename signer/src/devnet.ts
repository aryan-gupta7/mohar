// Connection to the public EIP-8141 devnet, plus the deployer key used for setup transactions.
// The deployer is a throwaway local key. It never signs for a device: devices sign with their own WOTS keys.
import fs from "node:fs";
import path from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

export const CHAIN_ID = 1337;
/** "local" is our private ethrex node (see devnet/up.sh). "public" is the shared hackathon devnet. */
export const NETWORK = (process.env.MOHAR_NET ?? "local") as "local" | "public";
const LOCAL_RPC = "http://127.0.0.1:18545";
/** Sidecar gateway on the public devnet: alt mempool submission, plus reads and raw transactions forwarded to ethrex. */
export const GATEWAY_URL = NETWORK === "public" ? "https://altmempoolgateway.forshtat.com/rpc" : LOCAL_RPC;
/** ethrex directly, for read-only methods the gateway doesn't proxy, such as simulation. */
export const ETHREX_URL = NETWORK === "public" ? "https://altmempool.forshtat.com" : LOCAL_RPC;
export const EXPLORER_URL = "https://explorer.altmempool.wtf/";
export const STAKING_REGISTRY: Address = "0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f";
export const ENTRY_POINT: Address = "0x00000000000000000000000000000000000000aa";
export const NONCE_MANAGER: Address = "0x0000000000000000000000000000000000008250";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SECRETS_DIR = path.join(ROOT, ".secrets");
const DEPLOYER_FILE = path.join(SECRETS_DIR, "deployer.key");

export class RpcError extends Error {
  code: number | undefined;
  data: unknown;
  constructor(method: string, code: number | undefined, message: string, data?: unknown) {
    super(`${method}: ${message}`);
    this.code = code;
    this.data = data;
  }
}

export async function rpc<T = any>(method: string, params: unknown[] = [], url: string = GATEWAY_URL): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json()) as { result?: T; error?: { code?: number; message: string; data?: unknown } };
  if (body.error) {
    const detail = body.error.data ? ` (${typeof body.error.data === "string" ? body.error.data : JSON.stringify(body.error.data)})` : "";
    throw new RpcError(method, body.error.code, body.error.message + detail, body.error.data);
  }
  return body.result as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitMined(hash: Hex, timeoutSec = 120): Promise<any> {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    await sleep(2000);
  }
  throw new Error(`${hash} was not mined within ${timeoutSec}s`);
}

/** The local throwaway key for setup transactions. Created once and stored outside version control. */
export function deployerKey(): Hex {
  if (fs.existsSync(DEPLOYER_FILE)) return fs.readFileSync(DEPLOYER_FILE, "utf8").trim() as Hex;
  fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
  const key = generatePrivateKey();
  fs.writeFileSync(DEPLOYER_FILE, key + "\n", { mode: 0o600 });
  return key;
}

export const deployerAddress = (): Address => privateKeyToAccount(deployerKey()).address;

export const getBalance = async (a: Address): Promise<bigint> => BigInt(await rpc("eth_getBalance", [a, "latest"]));
export const getNonce = async (a: Address, tag = "latest"): Promise<bigint> => BigInt(await rpc("eth_getTransactionCount", [a, tag]));
export const getCode = async (a: Address): Promise<Hex> => rpc("eth_getCode", [a, "latest"]);

/** Tops up from the devnet's public faucet (1 ETH, once per hour per address) if the balance is below `min`. */
export async function ensureFunded(address: Address, min: bigint): Promise<bigint> {
  const balance = await getBalance(address);
  if (balance >= min) return balance;
  const { txHash } = await rpc<{ txHash: Hex }>("skandha_explorer_faucet", [address]);
  const receipt = await waitMined(txHash);
  if (receipt.status !== "0x1") throw new Error(`faucet transfer ${txHash} reverted`);
  return getBalance(address);
}

/** A legacy transaction for contract creation and plain calls. Signed by the deployer unless `key` is given. */
export async function sendLegacy(tx: { to: Address | null; value?: bigint; data?: Hex; gas?: bigint; key?: Hex }): Promise<any> {
  const account = privateKeyToAccount(tx.key ?? deployerKey());
  const nonce = Number(await getNonce(account.address, "pending"));
  // New accounts and storage slots cost far more than on mainnet here, so estimate when no limit is given.
  const gas =
    tx.gas ??
    (BigInt(await rpc<Hex>("eth_estimateGas", [{ from: account.address, to: tx.to ?? undefined, value: `0x${(tx.value ?? 0n).toString(16)}`, data: tx.data ?? "0x" }])) * 12n) / 10n;
  const raw = await account.signTransaction({
    chainId: CHAIN_ID,
    nonce,
    to: tx.to,
    value: tx.value ?? 0n,
    data: tx.data ?? "0x",
    gas,
    gasPrice: 2_000_000n, // 0.002 gwei; the devnet base fee is 7 wei
    type: "legacy",
  });
  const hash = await rpc<Hex>("eth_sendRawTransaction", [raw]);
  const receipt = await waitMined(hash);
  return { hash, receipt };
}
