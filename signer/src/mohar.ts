// Builds, signs and submits Mohar's frame transactions. The firmware reproduces this layout byte for byte.
import fs from "node:fs";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, frame, newTx, sigHash, txHash } from "@forshtat/hegota-support/tx";
import { toWire } from "@forshtat/hegota-support/rpc";
import { concat, encodeAbiParameters, encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { CHAIN_ID, ETHREX_URL, NETWORK, STAKING_REGISTRY, rpc, sendLegacy } from "./devnet.ts";
import { WotsKey, fromHex, toHex, verifySteps } from "./wots.ts";

/** Measured on the client: validation frame gas = 17,218 + 114 per hash step, before account frame checks. */
export const LIMITS = {
  /** Account validation. With the paymaster's limit and the signature's 100 gas, this totals exactly 100,000. */
  accountVerify: 90_000n,
  paymasterVerify: 9_900n,
  report: 50_000n,
  reportState: 100_000n,
  settle: 40_000n,
};

/** Before signing, a device changes the report's salt if the digest needs more hash steps than this. */
export const DEVICE_STEP_LIMIT = 630;

export const STAKE = 12_000_000_000_000_000n; // 0.012 ETH, above the sidecar's 0.01 ETH minimum
export const UNSTAKE_DELAY = 86_400n;
export const DEFAULT_FEES = { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n };

export const PAYMASTER_ABI = parseAbi([
  "function settle()",
  "function refill(address device)",
  "function policyOf(address device) view returns (uint256)",
  "function paused() view returns (uint256)",
  "function owner() view returns (uint256)",
  "function setPolicy(address device, uint64 dailyLimit, uint64 maxCostGwei)",
  "function revoke(address device)",
  "function setPaused(bool value)",
  "function withdraw(address to, uint256 amount)",
  "function deposit() payable",
]);

export function artifact(name: string): Hex {
  const file = new URL(`../../contracts/out/${name}.yul/${name}.json`, import.meta.url);
  return JSON.parse(fs.readFileSync(file, "utf8")).bytecode.object as Hex;
}

async function deploy(data: Hex, value: bigint, label: string): Promise<Address> {
  const { hash, receipt } = await sendLegacy({ to: null, data, value, gas: 5_000_000n });
  if (receipt.status !== "0x1" || !receipt.contractAddress) throw new Error(`${label} deployment ${hash} reverted`);
  return receipt.contractAddress as Address;
}

export const deployRaw = (name: string, value = 0n) => deploy(artifact(name), value, name);

/** `value` beyond `stake` stays in the account. Normally zero, so the account can't pay for itself. */
export function deployAccount(a: { key: WotsKey; target: Address; selector: bigint; stake?: bigint; value?: bigint }): Promise<Address> {
  const stake = a.stake ?? 0n;
  const args = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
    [toHex(a.key.root), toHex(a.key.pubSeedWord), a.target, a.selector, STAKING_REGISTRY, stake, UNSTAKE_DELAY],
  );
  return deploy(concat([artifact("MoharAccount"), args]), stake + (a.value ?? 0n), "MoharAccount");
}

export function deployPaymaster(a: { stake?: bigint; funding: bigint }): Promise<Address> {
  const stake = a.stake ?? 0n;
  const args = encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }], [STAKING_REGISTRY, stake, UNSTAKE_DELAY]);
  return deploy(concat([artifact("QuotaPaymaster"), args]), stake + a.funding, "QuotaPaymaster");
}

export type UnsignedOptions = {
  account: Address;
  nonce: bigint;
  target: Address;
  data: Hex;
  paymaster?: Address;
  fees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  value?: bigint;
  /** Replaces the standard frames. Used by tests that try to break the rules. */
  frames?: ReturnType<typeof frame>[];
};

const SIGNATURE_PLACEHOLDER = { scheme: 0, signer: "0x" as Hex, msg: "0x" as Hex, signature: "0x" as Hex };

/** The standard report transaction. With a paymaster it has four frames; without one, the account pays and it has two. */
export function buildTx(o: UnsignedOptions) {
  const body = frame(profile, "SENDER", { target: o.target, execution: LIMITS.report, state: LIMITS.reportState, data: o.data, value: o.value ?? 0n });
  const frames =
    o.frames ??
    (o.paymaster
      ? [
          frame(profile, "VERIFY", { scope: "EXECUTION", execution: LIMITS.accountVerify }),
          frame(profile, "VERIFY", { scope: "PAYMENT", target: o.paymaster, execution: LIMITS.paymasterVerify }),
          body,
          frame(profile, "DEFAULT", { target: o.paymaster, execution: LIMITS.settle, data: encodeFunctionData({ abi: PAYMASTER_ABI, functionName: "settle" }) }),
        ]
      : [frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", execution: LIMITS.accountVerify + LIMITS.paymasterVerify }), body]);
  return newTx({
    chainId: CHAIN_ID,
    sender: o.account,
    nonceSeq: o.nonce,
    nonceKeys: [0n],
    fees: o.fees ?? DEFAULT_FEES,
    signatures: [SIGNATURE_PLACEHOLDER],
    frames,
  });
}

export const digestOf = (tx: ReturnType<typeof buildTx>): Uint8Array => fromHex(sigHash(profile, tx));

/** Attaches a WOTS signature. A contract's nonce starts at 1, so leaf = nonce - 1. */
export function signTx(tx: ReturnType<typeof buildTx>, key: WotsKey) {
  const digest = digestOf(tx);
  const signature = key.sign(digest, Number(tx.nonceSeq) - 1);
  return { ...tx, signatures: [{ ...SIGNATURE_PLACEHOLDER, signature: toHex(signature) }] };
}

export const steps = (tx: ReturnType<typeof buildTx>): number => verifySteps(digestOf(tx));
export const rawTx = (tx: ReturnType<typeof buildTx>): Hex => encodeTx(profile, tx);
export const hashOf = (tx: ReturnType<typeof buildTx>): Hex => txHash(profile, tx);

export type Simulation = {
  canonicalMempoolValid: boolean;
  canonicalMempoolViolation: string | null;
  executionStatus: string | null;
  executionError: string | null;
  failedFrameIndex?: number;
  haltReason?: string;
  revertData?: string;
  frames: { gasUsed: string; succeeded: boolean }[] | null;
  gasUsed: string | null;
  maxCost: string;
  payer: string | null;
  prefixShape: string | null;
};

export const simulate = (tx: ReturnType<typeof buildTx>): Promise<Simulation> =>
  rpc("ethrex_simulateFrameTransaction", [rawTx(tx), "latest", { trace: false }], ETHREX_URL);

/**
 * Submits through the alt mempool on the public devnet. The local node has no sidecar, so there we use its
 * privileged route, which skips mempool rules. Local mining therefore proves execution, not admission.
 */
export const submit = (tx: ReturnType<typeof buildTx>): Promise<Hex> =>
  NETWORK === "public" ? rpc("eth_sendFrameTransaction", [toWire(tx)]) : rpc("ethrex_submitPrivilegedFrameTransaction", [rawTx(tx)], ETHREX_URL);
