// Builds, signs and submits Mohar's frame transactions. The firmware reproduces this layout byte for byte.
import fs from "node:fs";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, frame, newTx, sigHash, txHash } from "@forshtat/hegota-support/tx";
import { toWire } from "@forshtat/hegota-support/rpc";
import { concat, encodeAbiParameters, encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { CHAIN_ID, ETHREX_URL, NETWORK, STAKING_REGISTRY, deployerAddress, rpc, sendLegacy } from "./devnet.ts";
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

export const LEDGER_ABI = parseAbi([
  "constructor(address owner, address operator, uint256 tariffWeiPerPulse)",
  "function bindMachine(address account)",
  "function report(uint64 seq, uint64 total, uint8 mode, uint8 reason, uint8 confidence, uint8 model, uint32 salt, bytes32 sensors, string requestId)",
  "function topUp() payable",
  "function clearHold()",
  "function setOperator(address operator)",
  "function withdraw(address to, uint256 amount)",
  "function ledgerMode() view returns (uint8)",
  "function status() view returns (uint256 credit, bool hold, uint64 lastSeq, uint64 lastTotal, uint256 tariff, uint256 earned, uint256 arrears, uint8 lastMode, uint8 ledgerMode)",
  "function machine() view returns (address)",
  "function operator() view returns (address)",
  "function owner() view returns (address)",
  "event Report(uint64 indexed seq, uint64 total, uint64 usage, uint256 charged, uint256 owed, uint8 mode, uint8 reason, uint8 confidence, uint8 model, uint32 salt, bytes32 sensors, string requestId)",
  "event HoldSet(uint64 indexed seq)",
  "event HoldCleared(address indexed by)",
  "event TopUp(address indexed from, uint256 amount, uint256 paidArrears, uint256 credit)",
  "error NotOwner()",
  "error NotOperator()",
  "error NotMachine()",
  "error AlreadyBound()",
  "error ZeroAddress()",
  "error StaleSeq()",
  "error TotalWentDown()",
  "error BadMode()",
  "error BadConfidence()",
  "error RequestIdTooLong()",
  "error NoHold()",
  "error NothingSent()",
  "error OverEarned()",
  "error Overflow()",
  "error TransferFailed()",
]);

/** report(uint64,uint64,uint8,uint8,uint8,uint8,uint32,bytes32,string) */
export const REPORT_SELECTOR = 0x6e5141ban;

export const MODE = { RUN: 0, INSPECT: 1, CREDIT_STOP: 2, SAFE_STOP: 3 } as const;

export type Report = {
  seq: bigint;
  total: bigint;
  mode: number;
  reason: number;
  confidence: number;
  model: number;
  salt: number;
  sensors: Hex;
  requestId: string;
};

export const encodeReport = (r: Report): Hex =>
  encodeFunctionData({
    abi: LEDGER_ABI,
    functionName: "report",
    args: [r.seq, r.total, r.mode, r.reason, r.confidence, r.model, r.salt, r.sensors, r.requestId],
  });

/** Yul artifacts come from contracts/build-yul.ts, Solidity ones from Forge. */
export function artifact(name: string): Hex {
  for (const ext of ["yul", "sol"]) {
    const file = new URL(`../../contracts/out/${name}.${ext}/${name}.json`, import.meta.url);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")).bytecode.object as Hex;
  }
  throw new Error(`No build output for ${name}. Run npm run build.`);
}

async function deploy(data: Hex, value: bigint, label: string): Promise<Address> {
  // Stored code costs about 1,670 gas per byte on this chain (measured), not mainnet's 200, so estimate first.
  const estimate = BigInt(await rpc<Hex>("eth_estimateGas", [{ from: deployerAddress(), data, value: `0x${value.toString(16)}` }]));
  const { hash, receipt } = await sendLegacy({ to: null, data, value, gas: (estimate * 12n) / 10n });
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

export function deployLedger(a: { owner: Address; operator: Address; tariffWeiPerPulse: bigint }): Promise<Address> {
  const args = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [a.owner, a.operator, a.tariffWeiPerPulse]);
  return deploy(concat([artifact("MachineLedger"), args]), 0n, "MachineLedger");
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
 * Submits through an alt mempool sidecar (MOHAR_NET=public or local-alt), which applies the ERC-8421 rules.
 * With MOHAR_NET=local there's no sidecar, so we use the node's privileged route, which skips mempool rules:
 * local mining then proves execution, not admission.
 */
export const submit = (tx: ReturnType<typeof buildTx>): Promise<Hex> =>
  NETWORK === "local" ? rpc("ethrex_submitPrivilegedFrameTransaction", [rawTx(tx)], ETHREX_URL) : rpc("eth_sendFrameTransaction", [toWire(tx)]);
