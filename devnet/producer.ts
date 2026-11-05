// Minimal block producer for the local ethrex node: plays the part of a consensus client over the Engine API.
// Local development only. The public devnet has its own consensus clients and doesn't use this.
// Usage: node devnet/producer.ts [intervalSeconds]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ENGINE = process.env.MOHAR_ENGINE_URL ?? "http://127.0.0.1:18551";
const RPC = process.env.MOHAR_LOCAL_RPC ?? "http://127.0.0.1:18545";
const INTERVAL_MS = Number(process.argv[2] ?? 2) * 1000;
const JWT_SECRET = Buffer.from(fs.readFileSync(path.resolve(import.meta.dirname, "../.secrets/jwt.hex"), "utf8").trim(), "hex");

function jwt(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const claims = b64({ iat: Math.floor(Date.now() / 1000) });
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${head}.${claims}`).digest("base64url");
  return `${head}.${claims}.${sig}`;
}

async function call(url: string, method: string, params: unknown[], auth = false): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${jwt()}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as any;
  if (body.error) throw new Error(`${method}: ${body.error.message}${body.error.data ? ` (${body.error.data})` : ""}`);
  return body.result;
}

const hex = (n: number | bigint) => "0x" + n.toString(16);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let slot = 1n;

async function produceOne(): Promise<string> {
  const parent = await call(RPC, "eth_getBlockByNumber", ["latest", false]);
  const state = { headBlockHash: parent.hash, safeBlockHash: parent.hash, finalizedBlockHash: parent.hash };
  const timestamp = Math.max(Math.floor(Date.now() / 1000), Number(parent.timestamp) + 1);
  const beaconRoot = "0x" + crypto.randomBytes(32).toString("hex");
  const attributes = {
    timestamp: hex(timestamp),
    prevRandao: "0x" + crypto.randomBytes(32).toString("hex"),
    suggestedFeeRecipient: "0x" + "00".repeat(19) + "01",
    withdrawals: [],
    parentBeaconBlockRoot: beaconRoot,
    slotNumber: hex(slot),
    inclusionListTransactions: [],
    targetGasLimit: "0x3938700",
  };
  const started = await call(ENGINE, "engine_forkchoiceUpdatedV5", [state, attributes], true);
  if (!started.payloadId) throw new Error(`no payload id: ${JSON.stringify(started)}`);
  await sleep(150); // let the builder pull pending transactions
  const built = await call(ENGINE, "engine_getPayloadV6", [started.payloadId], true);
  const payload = built.executionPayload;
  const verdict = await call(ENGINE, "engine_newPayloadV6", [payload, [], beaconRoot, built.executionRequests ?? [], []], true);
  if (verdict.status !== "VALID") throw new Error(`payload rejected: ${JSON.stringify(verdict)}`);
  const finished = await call(
    ENGINE,
    "engine_forkchoiceUpdatedV5",
    [{ headBlockHash: payload.blockHash, safeBlockHash: payload.blockHash, finalizedBlockHash: payload.blockHash }, null],
    true,
  );
  if (finished.payloadStatus?.status !== "VALID") throw new Error(`head update rejected: ${JSON.stringify(finished)}`);
  slot += 1n;
  return `block ${Number(payload.blockNumber)} txs=${payload.transactions.length} gas=${Number(payload.gasUsed)}`;
}

console.log(`producing a block every ${INTERVAL_MS / 1000}s via ${ENGINE}`);
let failures = 0;
for (;;) {
  try {
    const summary = await produceOne();
    failures = 0;
    if (!summary.includes("txs=0") || slot % 30n === 0n) console.log(summary);
  } catch (e: any) {
    console.error(`produce failed: ${e.message}`);
    if (++failures > 5) process.exit(1);
  }
  await sleep(INTERVAL_MS);
}
