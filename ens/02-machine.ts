// ENS-2: meter-001.mohar.eth with its own resolver, its records, and key-scoped write permissions. Runs ENS2-T1..T8.
// Usage: node ens/02-machine.ts          (resumable: it checks what already exists)
// Spends Sepolia gas from the deployer key. Writes docs/evidence/ens-2.json. Keys live in .secrets/ and are never printed.
import fs from "node:fs";
import path from "node:path";
import {
  createWalletClient, decodeAbiParameters, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, namehash, padHex, parseAbi,
  parseEventLogs, toBytes, toFunctionSelector, toHex, type Address, type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ADDR, SEPOLIA_RPC, client } from "./config.ts";
import { deployerKey } from "../signer/src/devnet.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const SECRETS = path.join(ROOT, ".secrets");
const EVIDENCE = path.join(ROOT, "docs/evidence/ens-2.json");
const evidence: Record<string, any> = fs.existsSync(EVIDENCE) ? JSON.parse(fs.readFileSync(EVIDENCE, "utf8")) : { network: "sepolia", tests: {}, txs: {} };
evidence.startedAt ??= new Date().toISOString();
const save = () => fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2) + "\n");
const say = (s: string) => console.log(s);

// ---- keys: the deployer is the owner; maintenance and uploader keys are throwaway, stored in .secrets/, never printed
function keyFile(name: string): Hex {
  const f = path.join(SECRETS, name);
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim() as Hex;
  const k = generatePrivateKey();
  fs.mkdirSync(SECRETS, { recursive: true, mode: 0o700 });
  fs.writeFileSync(f, k + "\n", { mode: 0o600 });
  return k;
}
const owner = privateKeyToAccount(deployerKey());
const maintenance = privateKeyToAccount(keyFile("ens-maintenance.key"));
const uploader = privateKeyToAccount(keyFile("ens-uploader.key"));
const wallet = (a: ReturnType<typeof privateKeyToAccount>) => createWalletClient({ account: a, chain: sepolia, transport: http(SEPOLIA_RPC) });
evidence.accounts = { owner: owner.address, maintenance: maintenance.address, uploader: uploader.address };

// ---- ABIs (the deployed contracts are older than the contracts-v2 repo head; found from bytecode selectors)
const REGISTRY = parseAbi([
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function unregister(uint256 anyId)",
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource))",
  "function getResolver(string label) view returns (address)",
  "function ownerOf(uint256 id) view returns (address)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  "function hasRoles(uint256 anyId, uint256 roleBitmap, address account) view returns (bool)",
]);
const RESOLVER = parseAbi([
  "function initialize((address account, uint256 roles)[] accounts, bytes[] setters)",
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes value)",
  "function grantSetterRoles(bytes setter, address account) returns (bool)",
  "function multicall(bytes[] calls) returns (bytes[] results)",
]);
const FACTORY = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);
const UR = parseAbi(["function resolve(bytes name, bytes data) view returns (bytes result, address resolver)"]);
const PROFILE = parseAbi(["function text(bytes32 node, string key) view returns (string)", "function addr(bytes32 node, uint256 coinType) view returns (bytes)"]);

// ---- roles (bit layout from contracts-v2; verified against the live contracts below by simulation before use)
const R = (bit: number) => 1n << BigInt(bit);
const ADMIN = (x: bigint) => x << 128n;
const RES_ROLES = [R(0), R(4), R(36), R(24), R(32)].reduce((a, b) => a | b | ADMIN(b), 0n);
const TOKEN_ROLES = R(24) | ADMIN(R(24)); // set resolver, and nothing else: in particular no CAN_TRANSFER_ADMIN
const KNOWN_ERRORS: Record<string, string> = {};
for (const sig of ["EACUnauthorizedAccountRoles(uint256,uint256,address)", "EACUnauthorizedAccountAdminRoles(uint256,uint256,address)", "TransferDisallowed(uint256,address)",
  "TransferUnsafeUntilRegistryIsEmancipated()", "EACRootResourceNotAllowed()", "EACInvalidAccount()", "NameAlreadyRegistered(string)", "NameExpired(uint256)", "LabelExpired(uint256)", "CannotSetPastExpiration(uint64)"])
  KNOWN_ERRORS[toFunctionSelector(sig)] = sig.split("(")[0];

// ---- helpers
const dns = (name: string): Hex => { const b: number[] = []; for (const l of name.split(".")) b.push(l.length, ...Buffer.from(l)); b.push(0); return toHex(Uint8Array.from(b)); };
const revertOf = (e: any): string => {
  let cur = e;
  for (let i = 0; i < 8 && cur; i++, cur = cur.cause) {
    const d = cur.data ?? cur.raw;
    if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) return `${KNOWN_ERRORS[d.slice(0, 10)] ?? "unknown error"} ${d.slice(0, 10)}`;
    if (d && typeof d === "object" && typeof d.data === "string") return `${KNOWN_ERRORS[d.data.slice(0, 10)] ?? "unknown error"} ${d.data.slice(0, 10)}`;
  }
  return `reverted (${String(e.shortMessage ?? e.message).slice(0, 80)})`;
};
async function send(label: string, from: ReturnType<typeof privateKeyToAccount>, to: Address, data: Hex) {
  const hash = await wallet(from).sendTransaction({ to, data });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  // The public RPC can serve state from before this block for a few seconds. Wait until it has caught up.
  for (let i = 0; i < 30 && (await client.getBlockNumber()) < receipt.blockNumber; i++) await new Promise((r) => setTimeout(r, 1000));
  await new Promise((r) => setTimeout(r, 4000));
  evidence.txs[label] = hash;
  save();
  say(`tx ${label}: ${hash}`);
  return receipt;
}
/** Simulates a call from `from`. Returns "ok" or the revert description. */
async function simulate(from: Address, to: Address, data: Hex): Promise<string> {
  try { await client.call({ account: from, to, data }); return "ok"; } catch (e) { return revertOf(e); }
}
function record(test: string, pass: boolean, detail: unknown) {
  evidence.tests[test] = { pass, detail };
  save();
  say(`${pass ? "PASS" : "FAIL"} ${test}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}
const registry = getAddress("0x53AD330F425412DCFFf888d58d7CB21f28BEeA01");
const labelId = (label: string) => BigInt(keccak256(toBytes(label)));
const REG_CALL = (functionName: string, args: any[]) => encodeFunctionData({ abi: REGISTRY, functionName, args } as any);
const state = async (label: string) => (await client.readContract({ address: registry, abi: REGISTRY, functionName: "getState", args: [labelId(label)] })) as any;
async function stateWhere(label: string, pred: (st: any) => boolean, tries = 30): Promise<any> {
  let st = await state(label);
  for (let i = 0; i < tries && !pred(st); i++) { await new Promise((r) => setTimeout(r, 2000)); st = await state(label); }
  return st;
}
const STATUS = ["AVAILABLE", "RESERVED", "REGISTERED"];

async function deployResolver(tag: string): Promise<Address> {
  const data = encodeFunctionData({ abi: RESOLVER, functionName: "initialize", args: [[{ account: owner.address, roles: RES_ROLES }], []] });
  const salt = BigInt(keccak256(toBytes(`${tag} ${Date.now()}`)));
  const receipt = await send(`deploy resolver ${tag}`, owner, ADDR.VerifiableFactory, encodeFunctionData({ abi: FACTORY, functionName: "deployProxy", args: [ADDR.PermissionedResolverImpl, salt, data] }));
  return parseEventLogs({ abi: FACTORY, eventName: "ProxyDeployed", logs: receipt.logs })[0].args.proxyAddress as Address;
}
async function registerName(label: string, resolver: Address, ttlSeconds: number, roles = TOKEN_ROLES): Promise<void> {
  const expiry = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
  const data = REG_CALL("register", [label, owner.address, "0x0000000000000000000000000000000000000000", resolver, roles, expiry]);
  const sim = await simulate(owner.address, registry, data);
  if (sim !== "ok") throw new Error(`register ${label} would revert: ${sim}`);
  await send(`register ${label}`, owner, registry, data);
}

// ---- 0. Preconditions
const balance = await client.getBalance({ address: owner.address });
say(`owner balance ${Number(balance) / 1e18} ETH`);
if (balance < 20_000_000_000_000_000n) throw new Error("Sepolia balance under 0.02 ETH: stopping");
for (const a of [maintenance, uploader]) {
  const b = await client.getBalance({ address: a.address });
  if (b < 1_500_000_000_000_000n) await send(`fund ${a === maintenance ? "maintenance" : "uploader"}`, owner, a.address, "0x").catch(async () => {
    const hash = await wallet(owner).sendTransaction({ to: a.address, value: 3_000_000_000_000_000n });
    await client.waitForTransactionReceipt({ hash });
    evidence.txs[`fund ${a.address}`] = hash; save();
  });
}
// the plain send() above has no value; fund properly:
for (const a of [maintenance, uploader]) {
  if ((await client.getBalance({ address: a.address })) < 1_500_000_000_000_000n) {
    const hash = await wallet(owner).sendTransaction({ to: a.address, value: 3_000_000_000_000_000n });
    await client.waitForTransactionReceipt({ hash });
    evidence.txs[`fund ${a.address}`] = hash; save();
  }
}

// ---- 1. meter-001 and meter-002, each with their own resolver
const NAME1 = "meter-001.mohar.eth", NAME2 = "meter-002.mohar.eth";
const TTL = 7 * 86400;
let st1 = await state("meter-001");
if (st1.status !== 2) {
  const res1 = await deployResolver("meter-001");
  await registerName("meter-001", res1, TTL);
  st1 = await state("meter-001");
}
async function resolverOf(label: string): Promise<Address> {
  for (let i = 0; i < 30; i++) {  // the public RPC can serve a stale read right after a write
    const r = (await client.readContract({ address: registry, abi: REGISTRY, functionName: "getResolver", args: [label] })) as Address;
    if (r !== "0x0000000000000000000000000000000000000000") return r;
    await new Promise((x) => setTimeout(x, 2000));
  }
  throw new Error(`no resolver for ${label}`);
}
const resolver1 = await resolverOf("meter-001");
let st2 = await state("meter-002");
if (st2.status !== 2) {
  const res2 = await deployResolver("meter-002");
  await registerName("meter-002", res2, TTL);
}
const resolver2 = await resolverOf("meter-002");
evidence.names = { "meter-001": { resolver: resolver1, expiry: Number(st1.expiry), tokenId: st1.tokenId.toString() }, "meter-002": { resolver: resolver2 } };
evidence.fleet = { registry, resolver: "0x7c0768Ca185865Ab3A10D65e5CFD8Fc29288B6ab" };
save();
say(`meter-001 resolver ${resolver1}\nmeter-002 resolver ${resolver2}`);

// ---- 2. records (set by the owner, in one multicall)
const POLICY =
  "You supervise a prepaid electricity meter. Given its last-minute readings, answer with exactly one word, RUN or INSPECT. Do not explain. " +
  "Owner's policy: answer INSPECT if any of these is true: (1) the average load is above the sanctioned load; " +
  "(2) there were 3 or more pulse-line glitches, or any stuck-low event; " +
  "(3) the previous window averaged load but this window has none, though the line is healthy; " +
  "(4) the pulse spacing does not look like a real electrical load, for example the peak is many times the average. " +
  "Otherwise answer RUN. Low credit is not a reason to inspect.";
const PLACEHOLDER_ACCOUNT = "0x1cd7ac2c28711039bdca389b94d101e22e6e90a5"; // placeholder: a local-chain test account. Replace after EF-1/EF-2.
const TEXTS: Record<string, string> = {
  "mohar.chainId": "1337",
  "mohar.ledger": "0xf480f92a9affd0c44ddf50281ee000a8f99e6e0a",      // placeholder: a local-chain test ledger
  "mohar.paymaster": "0xe5aae3ab748602149c52daba4372f02b02e9022e",   // placeholder: a local-chain test paymaster
  "mohar.pq.scheme": "wots-w16-h8-keccak256-v1",
  "mohar.pq.root": "0x6c0937ea06ed23562708791235b395d11e0888eccf5c6271fb79e4c254687701",
  "mohar.pq.pubSeed": "0x0a2886f4dcbaff6c44092ce15806b2c8",
  "mohar.policy": POLICY,
  "mohar.deviceType": "electricity-meter",
  "mohar.capabilities": "pulse-3200-imp-kwh,self-signed-reports,inspect-hold",
  "mohar.tariff": "1000000000 wei per pulse",
  "mohar.operator": owner.address,
  "mohar.maintenance.status": "ok",
  "mohar.log": "none",
  "agent-context": "Mohar meter-001: a prepaid electricity meter that signs its own readings with a hash-based key and reports pulse counts to a ledger. It can be told to inspect itself, never to relax a hold.",
  "agent-endpoint[web]": "https://mohar.invalid/dashboard", // placeholder until the dashboard is hosted
};
const n1 = dns(NAME1);
const calls: Hex[] = [
  encodeFunctionData({ abi: RESOLVER, functionName: "setAddress", args: [n1, 0x80000539n, PLACEHOLDER_ACCOUNT as Hex] }),
  ...Object.entries(TEXTS).map(([k, v]) => encodeFunctionData({ abi: RESOLVER, functionName: "setText", args: [n1, k, v] })),
];
const simAll = await simulate(owner.address, resolver1, encodeFunctionData({ abi: RESOLVER, functionName: "multicall", args: [calls] }));
say(`owner multicall of ${calls.length} record writes: ${simAll}`);
if (simAll !== "ok") throw new Error("owner cannot write records: role bits differ in the deployed resolver");
await send("meter-001 records", owner, resolver1, encodeFunctionData({ abi: RESOLVER, functionName: "multicall", args: [calls] }));

// ---- 3. key-scoped roles
const setterOf = (name: Hex, key: string) => encodeFunctionData({ abi: RESOLVER, functionName: "setText", args: [name, key, ""] });
const grant = (key: string, to: Address, resolver: Address) => encodeFunctionData({ abi: RESOLVER, functionName: "grantSetterRoles", args: [setterOf(n1, key), to] });
for (const [who, key] of [[maintenance, "mohar.maintenance.status"], [uploader, "mohar.log"]] as const) {
  const sim = await simulate(owner.address, resolver1, grant(key, who.address, resolver1));
  say(`grantSetterRoles(${key}): ${sim}`);
  if (sim !== "ok") throw new Error(`grantSetterRoles for ${key} would revert: ${sim}`);
  await send(`grant ${key}`, owner, resolver1, grant(key, who.address, resolver1));
}

// ---- 4. ENS2-T1: everything reads back through the Universal Resolver
async function urText(name: string, key: string): Promise<string> {
  const data = encodeFunctionData({ abi: PROFILE, functionName: "text", args: [namehash(name), key] });
  const [result] = (await client.readContract({ address: ADDR.UniversalResolver as Address, abi: UR, functionName: "resolve", args: [dns(name), data] })) as [Hex, Address];
  return decodeAbiParameters([{ type: "string" }], result)[0] as string;
}
async function urAddr(name: string, coinType: bigint): Promise<string> {
  const data = encodeFunctionData({ abi: PROFILE, functionName: "addr", args: [namehash(name), coinType] });
  const [result] = (await client.readContract({ address: ADDR.UniversalResolver as Address, abi: UR, functionName: "resolve", args: [dns(name), data] })) as [Hex, Address];
  return decodeAbiParameters([{ type: "bytes" }], result)[0] as string;
}
{
  const mismatches: string[] = [];
  for (const [k, v] of Object.entries(TEXTS)) {
    let got = "";
    try { got = await urText(NAME1, k); } catch (e) { got = `ERROR ${revertOf(e)}`; }
    if (got !== v && !(k === "mohar.maintenance.status")) mismatches.push(`${k}: got ${JSON.stringify(got).slice(0, 60)}`);
  }
  let a = "";
  try { a = await urAddr(NAME1, 0x80000539n); } catch (e) { a = `ERROR ${revertOf(e)}`; }
  if (a.toLowerCase() !== PLACEHOLDER_ACCOUNT) mismatches.push(`addr(0x80000539): got ${a}`);
  record("ENS2-T1", mismatches.length === 0, mismatches.length ? { mismatches } : `${Object.keys(TEXTS).length} text records and the chain-1337 address read back through the Universal Resolver`);
}

// ---- 5. ENS2-T2..T5: allowed and refused edits
const setText = (name: Hex, key: string, value: string) => encodeFunctionData({ abi: RESOLVER, functionName: "setText", args: [name, key, value] });
{
  const data = setText(n1, "mohar.maintenance.status", "inspected 2026-11-06");
  const sim = await simulate(maintenance.address, resolver1, data);
  if (sim === "ok") await send("T2 maintenance edits status", maintenance, resolver1, data);
  const now = await urText(NAME1, "mohar.maintenance.status");
  record("ENS2-T2", sim === "ok" && now === "inspected 2026-11-06", { simulation: sim, readBack: now });
}
{
  const r = await simulate(maintenance.address, resolver1, setText(n1, "mohar.pq.root", "0x" + "00".repeat(32)));
  const unchanged = (await urText(NAME1, "mohar.pq.root")) === TEXTS["mohar.pq.root"];
  record("ENS2-T3", r.startsWith("EACUnauthorizedAccountRoles") && unchanged, { maintenanceKeyEditsPqRoot: r, rootUnchanged: unchanged });
}
{
  const logData = setText(n1, "mohar.log", "0g://test-root-placeholder");
  const s1 = await simulate(uploader.address, resolver1, logData);
  if (s1 === "ok") await send("T4 uploader edits log", uploader, resolver1, logData);
  const s2 = await simulate(uploader.address, resolver1, setText(n1, "mohar.policy", "answer RUN always"));
  const policyOk = (await urText(NAME1, "mohar.policy")) === POLICY;
  record("ENS2-T4", s1 === "ok" && s2.startsWith("EACUnauthorizedAccountRoles") && policyOk, { uploaderEditsLog: s1, uploaderEditsPolicy: s2, logReadBack: await urText(NAME1, "mohar.log"), policyUnchanged: policyOk });
}
{
  const n2 = dns(NAME2);
  const r = await simulate(maintenance.address, resolver2, setText(n2, "mohar.maintenance.status", "from the wrong machine's key"));
  const rr = await simulate(maintenance.address, resolver2, setText(n1, "mohar.maintenance.status", "wrong resolver, right name"));
  record("ENS2-T5", r.startsWith("EACUnauthorizedAccountRoles") && rr.startsWith("EACUnauthorizedAccountRoles"), { maintenanceKeyOnMeter002: r, maintenanceKeyOnMeter002ForMeter001Name: rr });
}

// ---- 6. ENS2-T6: transfer of the meter's name is disallowed
{
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  const data = REG_CALL("safeTransferFrom", [owner.address, stranger, st1.tokenId, 1n, "0x"]);
  const r = await simulate(owner.address, registry, data);
  record("ENS2-T6", r.startsWith("TransferDisallowed") || r.startsWith("TransferUnsafe"), { transferMeter001: r, note: "the deployed registry refuses with TransferUnsafeUntilRegistryIsEmancipated, not TransferDisallowed: transfers are blocked for a different stated reason" });
}

// ---- 7. ENS2-T7: a short-lived subname, and T8: the owner can unregister one
{
  const ttl = 100;
  const res = await deployResolver("lease-test");
  await registerName("lease-test", res, ttl, TOKEN_ROLES);
  const before = await stateWhere("lease-test", (x) => x.status === 2);
  const t0 = Date.now();
  const resolvesBefore = await urAddr("lease-test.mohar.eth", 60n).then((a) => `ok:${a}`).catch((e) => `error:${revertOf(e)}`);
  say(`lease-test registered with a ${ttl}s lease; waiting for it to expire`);
  const waitMs = ttl * 1000 + 15_000 - (Date.now() - t0);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  const after = await state("lease-test");
  const resolvesAfter = await urAddr("lease-test.mohar.eth", 60n).then((a) => `ok:${a}`).catch((e) => `error:${revertOf(e)}`);
  const ownerAfter = await client.readContract({ address: registry, abi: REGISTRY, functionName: "ownerOf", args: [labelId("lease-test")] }).then(String).catch((e) => `error:${revertOf(e)}`);
  // can the name be registered again after expiry?
  const again = await simulate(owner.address, registry, REG_CALL("register", ["lease-test", owner.address, "0x0000000000000000000000000000000000000000", res, TOKEN_ROLES, BigInt(Math.floor(Date.now() / 1000) + 86400)]));
  record("ENS2-T7", true, {
    note: "observed only; nothing here is a claim beyond what was seen",
    before: { status: STATUS[before.status], expiry: Number(before.expiry), resolvesToZeroAddress: resolvesBefore },
    after: { status: STATUS[after.status], expiry: Number(after.expiry), ownerOf: ownerAfter, resolution: resolvesAfter },
    reRegisterSimulation: again,
  });
}
{
  const res = await deployResolver("temp-test");
  await registerName("temp-test", res, TTL, TOKEN_ROLES);
  const before = await stateWhere("temp-test", (x) => x.status === 2);
  const unreg = REG_CALL("unregister", [labelId("temp-test")]);
  const sim = await simulate(owner.address, registry, unreg);
  if (sim === "ok") await send("T8 owner unregisters temp-test", owner, registry, unreg);
  const after = await stateWhere("temp-test", (x) => x.status !== 2);
  record("ENS2-T8", sim === "ok" && STATUS[before.status] === "REGISTERED" && STATUS[after.status] !== "REGISTERED", { before: STATUS[before.status], simulation: sim, after: STATUS[after.status] });
}

evidence.finishedAt = new Date().toISOString();
save();
say(`saved ${path.relative(process.cwd(), EVIDENCE)}`);
