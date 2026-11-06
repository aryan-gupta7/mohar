#include "frametx.h"
#include <string.h>
#include "keccak.h"
#include "wots.h"

static const uint32_t CHAIN_ID = 1337;
static const uint64_t VERIFY_ACCOUNT_GAS = 90000, VERIFY_PAYMASTER_GAS = 9900, REPORT_GAS = 50000, REPORT_STATE_GAS = 100000, SETTLE_GAS = 40000;
static const uint8_t SETTLE_SELECTOR[4] = {0x11, 0xda, 0x60, 0xb4};
static const uint8_t REPORT_SELECTOR[4] = {0x6e, 0x51, 0x41, 0xba};

// ---------------------------------------------------------------- RLP ---
struct Buf {
  uint8_t *p;
  size_t n, cap;
  bool ok;
};
static void put(Buf &b, const uint8_t *d, size_t len) {
  if (b.n + len > b.cap) { b.ok = false; return; }
  if (len) memcpy(b.p + b.n, d, len);
  b.n += len;
}
static void put1(Buf &b, uint8_t v) { put(b, &v, 1); }
static size_t header(uint8_t base, size_t len, uint8_t hdr[5]) {
  if (len < 56) { hdr[0] = base + len; return 1; }
  uint8_t tmp[4];
  int lb = 0;
  for (size_t v = len; v; v >>= 8) tmp[lb++] = v & 0xff;
  hdr[0] = base + 55 + lb;
  for (int i = 0; i < lb; i++) hdr[1 + i] = tmp[lb - 1 - i];
  return 1 + lb;
}
static void str(Buf &b, const uint8_t *d, size_t len) {
  if (len == 1 && d[0] < 0x80) { put1(b, d[0]); return; }
  uint8_t h[5];
  put(b, h, 0);
  size_t hl = header(0x80, len, h);
  put(b, h, hl);
  put(b, d, len);
}
static void uintv(Buf &b, uint64_t v) {
  uint8_t t[8];
  int n = 0;
  for (uint64_t x = v; x; x >>= 8) t[n++] = x & 0xff;
  uint8_t be[8];
  for (int i = 0; i < n; i++) be[i] = t[n - 1 - i];
  str(b, be, n);  // zero is the empty string
}
static size_t listStart(Buf &b) { return b.n; }
static void listEnd(Buf &b, size_t start) {
  size_t len = b.n - start;
  uint8_t h[5];
  size_t hl = header(0xc0, len, h);
  if (b.n + hl > b.cap) { b.ok = false; return; }
  memmove(b.p + start + hl, b.p + start, len);
  memcpy(b.p + start, h, hl);
  b.n += hl;
}

static void frame(Buf &b, uint8_t mode, uint8_t flags, const uint8_t *target, uint64_t exec, uint64_t state, const uint8_t *data, size_t dataLen) {
  size_t f = listStart(b);
  uintv(b, mode);
  uintv(b, flags);
  str(b, target, target ? 20 : 0);
  size_t l = listStart(b);
  uintv(b, exec);
  uintv(b, state);
  listEnd(b, l);
  uintv(b, 0);  // value
  str(b, data, dataLen);
  listEnd(b, f);
}

size_t frametx_calldata(const ReportParams &p, uint8_t *out, size_t cap) {
  size_t padded = ((size_t)p.reqLen + 31) / 32 * 32;
  size_t total = 4 + 9 * 32 + 32 + padded;
  if (total > cap) return 0;
  memset(out, 0, total);
  memcpy(out, REPORT_SELECTOR, 4);
  uint8_t *w = out + 4;
  auto word64 = [&](int i, uint64_t v) { for (int k = 0; k < 8; k++) w[i * 32 + 31 - k] = (v >> (8 * k)) & 0xff; };
  word64(0, p.seq);
  word64(1, p.total);
  word64(2, p.mode);
  word64(3, p.reason);
  word64(4, p.confidence);
  word64(5, p.model);
  word64(6, p.salt);
  memcpy(w + 7 * 32, p.sensors, 32);
  word64(8, 9 * 32);               // offset of the string
  word64(9, p.reqLen);             // its length
  memcpy(w + 10 * 32, p.reqId, p.reqLen);
  return total;
}

size_t frametx_encode(const ReportParams &p, const uint8_t *sig, size_t sigLen, uint8_t *out, size_t cap) {
  static uint8_t calldata[4 + 10 * 32 + 64];
  size_t cl = frametx_calldata(p, calldata, sizeof(calldata));
  if (!cl || cap < 1) return 0;
  Buf b = {out, 0, cap, true};
  put1(b, 0x06);
  size_t top = listStart(b);
  uintv(b, CHAIN_ID);
  size_t keys = listStart(b);
  uintv(b, 0);  // nonce_keys = [0]: the account's linear nonce
  listEnd(b, keys);
  uintv(b, p.nonce);
  str(b, p.sender, 20);
  size_t frames = listStart(b);
  frame(b, 1, 2, nullptr, VERIFY_ACCOUNT_GAS, 0, nullptr, 0);            // VERIFY, approve execution
  frame(b, 1, 1, p.paymaster, VERIFY_PAYMASTER_GAS, 0, nullptr, 0);      // VERIFY, approve payment
  frame(b, 2, 0, p.ledger, REPORT_GAS, REPORT_STATE_GAS, calldata, cl);  // SENDER: the report
  frame(b, 0, 0, p.paymaster, SETTLE_GAS, 0, SETTLE_SELECTOR, 4);        // DEFAULT: settle()
  listEnd(b, frames);
  size_t sigs = listStart(b);
  size_t s = listStart(b);
  uintv(b, 0);  // scheme ARBITRARY
  str(b, nullptr, 0);  // signer
  str(b, nullptr, 0);  // msg
  str(b, sig, sig ? sigLen : 0);
  listEnd(b, s);
  listEnd(b, sigs);
  size_t fees = listStart(b);
  uintv(b, p.maxPrio);
  uintv(b, p.maxFee);
  uintv(b, 0);  // blob fee
  listEnd(b, fees);
  size_t blobs = listStart(b);
  listEnd(b, blobs);
  size_t roots = listStart(b);
  listEnd(b, roots);
  listEnd(b, top);
  return b.ok ? b.n : 0;
}

bool frametx_digest(const ReportParams &p, uint8_t digest[32]) {
  static uint8_t buf[1024];
  size_t n = frametx_encode(p, nullptr, 0, buf, sizeof(buf));
  if (!n) return false;
  keccak256(buf, n, digest);
  return true;
}

bool frametx_guard(ReportParams *p, uint8_t digest[32], uint32_t *steps) {
  for (uint32_t i = 0; i < 100000; i++) {
    if (!frametx_digest(*p, digest)) return false;
    *steps = wots_verify_steps(digest);
    if (*steps <= DEVICE_STEP_LIMIT) return true;
    p->salt++;
    if ((i & 63) == 63) yield();
  }
  return false;
}

// ---------------------------------------------------------------- JSON ---
static void hexOut(Print &o, const uint8_t *d, size_t n) {
  static const char *H = "0123456789abcdef";
  char c[65];
  size_t at = 0;
  while (at < n) {
    size_t m = n - at > 32 ? 32 : n - at;
    for (size_t i = 0; i < m; i++) { c[2 * i] = H[d[at + i] >> 4]; c[2 * i + 1] = H[d[at + i] & 15]; }
    c[2 * m] = 0;
    o.print(c);
    at += m;
    yield();
  }
}
static void qty(Print &o, uint64_t v) {
  char t[17];
  int n = 0;
  if (!v) t[n++] = '0';
  while (v) { t[n++] = "0123456789abcdef"[v & 15]; v >>= 4; }
  o.print("\"0x");
  while (n) o.print(t[--n]);
  o.print('"');
}
static void jframe(Print &o, uint8_t mode, uint8_t flags, const uint8_t *target, uint64_t exec, uint64_t state, const uint8_t *data, size_t dl, bool comma) {
  o.printf("{\"mode\":%u,\"flags\":%u,\"target\":", mode, flags);
  if (target) { o.print("\"0x"); hexOut(o, target, 20); o.print('"'); } else o.print("null");
  o.print(",\"limits\":{\"execution\":"); qty(o, exec);
  o.print(",\"state\":"); qty(o, state);
  o.print("},\"value\":\"0x0\",\"data\":\"0x"); hexOut(o, data, dl);
  o.print("\"}");
  if (comma) o.print(',');
}

void frametx_json(const ReportParams &p, const uint8_t *sig, size_t sigLen, Print &o) {
  static uint8_t calldata[4 + 10 * 32 + 64];  // static: keep it off the small stack
  size_t cl = frametx_calldata(p, calldata, sizeof(calldata));
  o.print("{\"chainId\":"); qty(o, CHAIN_ID);
  o.print(",\"nonceKeys\":[\"0x0\"],\"nonceSeq\":"); qty(o, p.nonce);
  o.print(",\"sender\":\"0x"); hexOut(o, p.sender, 20);
  o.print("\",\"frames\":[");
  jframe(o, 1, 2, nullptr, VERIFY_ACCOUNT_GAS, 0, nullptr, 0, true);
  jframe(o, 1, 1, p.paymaster, VERIFY_PAYMASTER_GAS, 0, nullptr, 0, true);
  jframe(o, 2, 0, p.ledger, REPORT_GAS, REPORT_STATE_GAS, calldata, cl, true);
  jframe(o, 0, 0, p.paymaster, SETTLE_GAS, 0, SETTLE_SELECTOR, 4, false);
  o.print("],\"signatures\":[{\"scheme\":0,\"signer\":\"0x\",\"msg\":\"0x\",\"signature\":\"0x");
  hexOut(o, sig, sig ? sigLen : 0);
  o.print("\"}],\"fees\":{\"maxPriorityFeePerGas\":"); qty(o, p.maxPrio);
  o.print(",\"maxFeePerGas\":"); qty(o, p.maxFee);
  o.print(",\"maxFeePerBlobGas\":\"0x0\"},\"blobVersionedHashes\":[],\"recentRootReferences\":[]}");
}
