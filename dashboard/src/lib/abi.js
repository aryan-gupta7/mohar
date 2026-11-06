// Minimal Ethereum ABI, ENS and JSON-RPC helpers. No dependencies except the vendored Keccak.
import { keccak_256 } from "../vendor/noble-hashes/sha3.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

export const toHex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export function fromHex(h) {
  h = String(h).replace(/^0x/i, "");
  if (h.length % 2) h = "0" + h;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
export const keccak = (x) => toHex(keccak_256(typeof x === "string" ? enc.encode(x) : x));
export const selector = (sig) => keccak(sig).slice(0, 10);

export function namehash(name) {
  let node = new Uint8Array(32);
  if (name) for (const label of name.split(".").reverse()) node = keccak_256(concat(node, keccak_256(enc.encode(label))));
  return toHex(node);
}
export function dnsEncode(name) {
  const parts = [];
  for (const label of name.split(".")) {
    const b = enc.encode(label);
    if (b.length === 0 || b.length > 63) throw new Error("bad label in name");
    parts.push(new Uint8Array([b.length]), b);
  }
  parts.push(new Uint8Array([0]));
  return toHex(concat(...parts));
}

const word = (n) => {
  const out = new Uint8Array(32);
  let v = BigInt(n);
  if (v < 0n) throw new Error("negative number");
  for (let i = 31; i >= 0 && v > 0n; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
};
const padRight = (b) => concat(b, new Uint8Array((32 - (b.length % 32)) % 32));
const isDynamic = (t) => t === "bytes" || t === "string";

/** Encodes arguments of these types: uint*, bool, address, bytes32, bytes, string. */
export function encodeArgs(types, values) {
  const head = [], tail = [];
  let tailOffset = 32 * types.length;
  types.forEach((t, i) => {
    const v = values[i];
    if (isDynamic(t)) {
      const body = t === "string" ? enc.encode(v) : fromHex(v);
      const encoded = concat(word(body.length), padRight(body));
      head.push(word(tailOffset));
      tail.push(encoded);
      tailOffset += encoded.length;
    } else if (t === "address") {
      head.push(concat(new Uint8Array(12), fromHex(v)));
    } else if (t === "bytes32") {
      const b = fromHex(v);
      if (b.length !== 32) throw new Error("bytes32 needs 32 bytes");
      head.push(b);
    } else if (t === "bool") {
      head.push(word(v ? 1 : 0));
    } else if (/^uint\d*$/.test(t)) {
      head.push(word(v));
    } else throw new Error("unsupported type " + t);
  });
  return toHex(concat(...head, ...tail));
}
export function encodeCall(sig, values = []) {
  const types = sig.slice(sig.indexOf("(") + 1, sig.lastIndexOf(")")).split(",").filter(Boolean);
  return selector(sig) + encodeArgs(types, values).slice(2);
}

/** Decodes the same set of types. Numbers come back as BigInt. */
export function decodeArgs(types, data) {
  const b = fromHex(data);
  const readWord = (at) => {
    if (at + 32 > b.length) throw new Error("response is too short");
    return b.slice(at, at + 32);
  };
  const big = (w) => w.reduce((a, x) => (a << 8n) | BigInt(x), 0n);
  return types.map((t, i) => {
    const w = readWord(32 * i);
    if (t === "address") return toHex(w.slice(12));
    if (t === "bytes32") return toHex(w);
    if (t === "bool") return big(w) !== 0n;
    if (/^uint\d*$/.test(t)) return big(w);
    if (isDynamic(t)) {
      const off = Number(big(w));
      const len = Number(big(readWord(off)));
      if (off + 32 + len > b.length) throw new Error("response is too short");
      const body = b.slice(off + 32, off + 32 + len);
      return t === "string" ? dec.decode(body) : toHex(body);
    }
    throw new Error("unsupported type " + t);
  });
}

/** Revert data -> a readable message, using the errors the contracts in this project can raise. */
const ERRORS = [
  "NotOwner()", "NotOperator()", "NotMachine()", "AlreadyBound()", "ZeroAddress()", "StaleSeq()", "TotalWentDown()",
  "BadMode()", "BadConfidence()", "RequestIdTooLong()", "NoHold()", "NothingSent()", "OverEarned()", "Overflow()", "TransferFailed()",
  "EACUnauthorizedAccountRoles(uint256,uint256,address)", "EACUnauthorizedAccountAdminRoles(uint256,uint256,address)",
  "EACCannotGrantRoles(uint256,uint256,address)", "EACCannotRevokeRoles(uint256,uint256,address)", "EACInvalidAccount()",
  "TransferDisallowed(uint256,address)", "NameExpired(uint256,uint64)", "NameAlreadyRegistered(string)",
].map((sig) => ({ sig, sel: selector(sig), types: sig.slice(sig.indexOf("(") + 1, -1).split(",").filter(Boolean) }));
export function explainRevert(data) {
  if (!data || data === "0x") return "The contract reverted without a reason.";
  const sel = data.slice(0, 10).toLowerCase();
  const e = ERRORS.find((x) => x.sel === sel);
  if (!e) return `The contract reverted with an unknown error ${sel} (data ${data.slice(0, 140)}).`;
  let args = "";
  try {
    const vals = decodeArgs(e.types, "0x" + data.slice(10));
    args = vals.map((v) => (typeof v === "bigint" ? "0x" + v.toString(16) : v)).join(", ");
  } catch { /* argument decoding is best effort */ }
  return `Rejected by the contract: ${e.sig.slice(0, e.sig.indexOf("("))}(${args})`;
}

export class RpcDead extends Error {}
export class RpcError extends Error {
  constructor(message, code, data) { super(message); this.code = code; this.data = data; }
}
/** JSON-RPC over fetch with a timeout. A network failure is RpcDead; a JSON-RPC error is RpcError. */
export async function rpc(url, method, params = [], timeoutMs = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: ctl.signal });
  } catch (e) {
    throw new RpcDead(`Cannot reach ${url}`);
  } finally { clearTimeout(timer); }
  let body;
  try { body = await res.json(); } catch { throw new RpcDead(`${url} did not answer with JSON (HTTP ${res.status})`); }
  if (body.error) throw new RpcError(body.error.message ?? "RPC error", body.error.code, body.error.data);
  return body.result;
}
export const ethCall = (url, to, data, from, value) =>
  rpc(url, "eth_call", [{ to, data, ...(from ? { from } : {}), ...(value ? { value: "0x" + value.toString(16) } : {}) }, "latest"]);
