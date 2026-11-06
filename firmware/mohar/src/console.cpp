#include "console.h"
#include <Arduino.h>
#include <string.h>
#include "keccak.h"
#include "keystore.h"
#include "meter.h"
#include "frametx.h"
#include "intent.h"
#include "net.h"
#include "zerog.h"
#include "config.h"
#include "machine.h"
#include <ESP8266WiFi.h>

static char line[560];
static size_t lineLen = 0;

static void printHex(const uint8_t *b, size_t n) {
  char chunk[65];
  static const char *H = "0123456789abcdef";
  size_t at = 0;
  while (at < n) {
    size_t m = n - at > 32 ? 32 : n - at;
    for (size_t i = 0; i < m; i++) { chunk[2 * i] = H[b[at + i] >> 4]; chunk[2 * i + 1] = H[b[at + i] & 15]; }
    chunk[2 * m] = 0;
    Serial.print(chunk);
    at += m;
    yield();
  }
}

#ifdef MOHAR_DEV
static int nib(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}
// Parses exactly `bytes` bytes of hex, with optional 0x. Returns false on any problem.
static bool parseHex(const char *s, uint8_t *out, size_t bytes) {
  if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) s += 2;
  if (strlen(s) != bytes * 2) return false;
  for (size_t i = 0; i < bytes; i++) {
    int a = nib(s[2 * i]), b = nib(s[2 * i + 1]);
    if (a < 0 || b < 0) return false;
    out[i] = (a << 4) | b;
  }
  return true;
}

static uint64_t parseU64(const char *s) { return strtoull(s, nullptr, 10); }
// build/report arguments, space separated:
//   sender ledger paymaster nonce maxPrio maxFee seq total mode reason confidence model salt sensors32 reqIdHex|-
static bool parseReport(char *args, ReportParams *p) {
  char *tok[15];
  int n = 0;
  for (char *t = strtok(args, " "); t && n < 15; t = strtok(nullptr, " ")) tok[n++] = t;
  if (n != 15) return false;
  memset(p, 0, sizeof(*p));
  if (!parseHex(tok[0], p->sender, 20) || !parseHex(tok[1], p->ledger, 20) || !parseHex(tok[2], p->paymaster, 20)) return false;
  p->nonce = parseU64(tok[3]); p->maxPrio = parseU64(tok[4]); p->maxFee = parseU64(tok[5]);
  p->seq = parseU64(tok[6]); p->total = parseU64(tok[7]);
  p->mode = parseU64(tok[8]); p->reason = parseU64(tok[9]); p->confidence = parseU64(tok[10]); p->model = parseU64(tok[11]);
  p->salt = (uint32_t)parseU64(tok[12]);
  if (!parseHex(tok[13], p->sensors, 32)) return false;
  if (strcmp(tok[14], "-") != 0) {
    size_t hl = strlen(tok[14]);
    if (hl % 2 || hl / 2 > REPORT_MAX_ID || !parseHex(tok[14], p->reqId, hl / 2)) return false;
    p->reqLen = hl / 2;
  }
  return true;
}

#endif

static bool parseHex20(const char *s, uint8_t *out) {
  if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) s += 2;
  if (strlen(s) != 40) return false;
  for (int i = 0; i < 20; i++) {
    auto nibv = [](char c) { return c >= '0' && c <= '9' ? c - '0' : (c | 32) >= 'a' && (c | 32) <= 'f' ? (c | 32) - 'a' + 10 : -1; };
    int a = nibv(s[2 * i]), b = nibv(s[2 * i + 1]);
    if (a < 0 || b < 0) return false;
    out[i] = (a << 4) | b;
  }
  return true;
}

static void cmdInfo() {
  Serial.print("INFO root=0x");
  if (keystore::ready()) printHex(keystore::root(), 32); else Serial.print("none");
  Serial.print(" pubSeed=0x");
  if (keystore::ready()) printHex(keystore::pubSeed(), 16); else Serial.print("none");
#ifdef MOHAR_DEV
  Serial.printf(" dev=1");
#else
  Serial.printf(" dev=0");
#endif
  Serial.printf(" heap=%u maxblock=%u\n", ESP.getFreeHeap(), ESP.getMaxFreeBlockSize());
}

static void printU64(uint64_t v) {
  char t[21];
  int n = 0;
  if (!v) t[n++] = '0';
  while (v) { t[n++] = '0' + v % 10; v /= 10; }
  while (n) Serial.print(t[--n]);
}

static void handle(char *cmd) {
  if (strcmp(cmd, "info") == 0) { cmdInfo(); return; }
  if (strncmp(cmd, "provision ", 10) == 0) {
    // provision <sender> <ledger> <paymaster> <transport 0|1> <host> <port> <checkpointS> <sanctionedW> <maxPrio> <maxFee>
    char *tok[10];
    int n = 0;
    for (char *t = strtok(cmd + 10, " "); t && n < 10; t = strtok(nullptr, " ")) tok[n++] = t;
    DeviceConfig c;
    memset(&c, 0, sizeof(c));
    if (n != 10 || !parseHex20(tok[0], c.sender) || !parseHex20(tok[1], c.ledger) || !parseHex20(tok[2], c.paymaster) || strlen(tok[4]) >= sizeof(c.host)) { Serial.println("ERROR usage: provision <sender> <ledger> <paymaster> <0|1> <host> <port> <checkpointS> <sanctionedW> <maxPrio> <maxFee>"); return; }
    c.transport = atoi(tok[3]);
    strcpy(c.host, tok[4]);
    c.port = atoi(tok[5]);
    c.checkpointS = atoi(tok[6]);
    c.sanctionedW = atoi(tok[7]);
    c.maxPrio = strtoull(tok[8], nullptr, 10);
    c.maxFee = strtoull(tok[9], nullptr, 10);
    if (!config_save(c)) { Serial.println("ERROR config_write_failed"); return; }
    machine_reload_config();
    Serial.println("PROVISIONED");
    return;
  }
  if (strcmp(cmd, "config") == 0) {
    DeviceConfig c;
    if (!config_load(&c)) { Serial.println("CONFIG none"); return; }
    Serial.print("CONFIG sender=0x"); printHex(c.sender, 20); Serial.print(" ledger=0x"); printHex(c.ledger, 20); Serial.print(" paymaster=0x"); printHex(c.paymaster, 20);
    Serial.printf(" transport=%u host=%s port=%u checkpointS=%u sanctionedW=%u\n", c.transport, c.host, c.port, c.checkpointS, c.sanctionedW);
    return;
  }
  if (strcmp(cmd, "meter") == 0) {
    uint32_t v, g, st;
    int level;
    meter_raw(&v, &g, &st, &level);
    Serial.printf("METER valid=%u glitches=%u stuck=%u coalesced=%u level=%d total=", v, g, st, meter_coalesced(), level);
    printU64(meter_total());
    Serial.println();
    return;
  }
  if (strcmp(cmd, "window") == 0) {  // closes the current window and starts the next
    MeterWindow w;
    meter_take_window(&w);
    Serial.printf("WINDOW valid=%u glitches=%u stuck=%u ms=%u avgW=%u peakW=%u gapMs=%u total=", w.validPulses, w.glitches, w.stuckLow, w.windowMs, w.avgWatts, w.peakWatts, w.longestGapMs);
    printU64(w.totalPulses);
    Serial.println();
    return;
  }
#ifdef MOHAR_DEV
  if (strcmp(cmd, "wifi-drop") == 0) { WiFi.disconnect(false); delay(500); Serial.printf("DROPPED connected=%d\n", net_wifi_up()); return; }
  if (strcmp(cmd, "wifi") == 0) {
    uint32_t t0 = millis();
    bool ok = net_wifi_connect(30000);
    Serial.printf("WIFI ok=%d ms=%u ip=%s rssi=%d heap=%u uptime=%u\n", ok, millis() - t0, WiFi.localIP().toString().c_str(), WiFi.RSSI(), ESP.getFreeHeap(), millis());
    return;
  }
  if (strncmp(cmd, "body ", 5) == 0) {  // body <report args>: sign, then print the exact request body the network code would send
    ReportParams p;
    if (!parseReport(cmd + 5, &p)) { Serial.println("ERROR bad_report_args"); return; }
    uint8_t *sig = (uint8_t *)malloc(WOTS_SIG_BYTES), *raw = (uint8_t *)malloc(FRAMETX_MAX_RAW);
    if (!sig || !raw) { free(sig); free(raw); Serial.println("ERROR out_of_memory"); return; }
    size_t n = 0;
    ReportParams used;
    IntentInfo info;
    IntentResult r = intent_sign(p, raw, FRAMETX_MAX_RAW, &n, &used, &info, sig);
    free(raw);
    if (r != INTENT_OK) { Serial.printf("RESULT %s\n", intent_name(r)); free(sig); return; }
    Serial.print("BODY ");
    net_print_submit_body(Serial, used, sig, WOTS_SIG_BYTES);
    Serial.println();
    free(sig);
    return;
  }
  if (strncmp(cmd, "submit ", 7) == 0) {  // submit <host> <port> <tls 0|1> <report args>: sign, then send over Wi-Fi
    char *host = strtok(cmd + 7, " "), *port = strtok(nullptr, " "), *tls = strtok(nullptr, " ");
    char *rest = tls ? tls + strlen(tls) + 1 : nullptr;
    ReportParams p;
    if (!host || !port || !tls || !rest || !parseReport(rest, &p)) { Serial.println("ERROR usage: submit <host> <port> <0|1> <report args>"); return; }
    uint8_t *sig = (uint8_t *)malloc(WOTS_SIG_BYTES);
    uint8_t *raw = (uint8_t *)malloc(FRAMETX_MAX_RAW);
    if (!sig || !raw) { free(sig); free(raw); Serial.println("ERROR out_of_memory"); return; }
    size_t n = 0;
    ReportParams used;
    IntentInfo info;
    IntentResult r = intent_sign(p, raw, FRAMETX_MAX_RAW, &n, &used, &info, sig);
    if (r != INTENT_OK) { Serial.printf("RESULT %s\n", intent_name(r)); free(sig); free(raw); return; }
    uint8_t h[32];
    keccak256(raw, n, h);  // the transaction hash the node must return
    free(raw);             // only the signature is kept while the connection is open
    static char resp[512];
    NetStats st;
    int status = net_submit_frame_tx(host, atoi(port), atoi(tls), "/rpc", used, sig, WOTS_SIG_BYTES, resp, sizeof(resp), &st, 30000);
    free(sig);
    Serial.printf("SUBMIT status=%d resent=%d leaf=%u connectMs=%u totalMs=%u heapBefore=%u heapLowest=%u\n", status, info.resent, info.leaf, st.connectMs, st.totalMs, st.heapBefore, st.heapLowest);
    Serial.print("LOCALHASH 0x"); printHex(h, 32); Serial.println();
    Serial.printf("BODY %s\n", resp);
    return;
  }
  if (strncmp(cmd, "tcp ", 4) == 0) {  // tcp <host> <port>: can the board open a plain TCP connection? (diagnostic)
    char *sp = strchr(cmd + 4, ' ');
    if (!sp) { Serial.println("ERROR usage: tcp <host> <port>"); return; }
    *sp = 0;
    WiFiClient c;
    c.setTimeout(8000);
    uint32_t t0 = millis();
    IPAddress ip;
    bool resolved = WiFi.hostByName(cmd + 4, ip);
    bool ok = resolved && c.connect(ip, atoi(sp + 1));
    Serial.printf("TCP resolved=%d ip=%s connected=%d ms=%u wifi=%d rssi=%d\n", resolved, ip.toString().c_str(), ok, millis() - t0, WiFi.status(), WiFi.RSSI());
    c.stop();
    return;
  }
  if (strncmp(cmd, "zg ", 3) == 0) {  // zg <window text>: one real 0G decision from the board (needs Wi-Fi and a key)
    ZgResult z = zerog_decide(cmd + 3, 20000);
    Serial.printf("ZG answer=%s rid=%s http=%d ms=%u why=%s heap=%u\n", z.answer == ZG_RUN ? "RUN" : z.answer == ZG_INSPECT ? "INSPECT" : "NONE", z.requestId, z.httpStatus, (unsigned)z.ms, z.why, ESP.getFreeHeap());
    return;
  }
  if (strncmp(cmd, "rpc-loop ", 9) == 0) {  // rpc-loop <host> <count>: repeated eth_chainId, to look for leaks and resets
    char *sp = strchr(cmd + 9, ' ');
    if (!sp) { Serial.println("ERROR usage: rpc-loop <host> <count>"); return; }
    *sp = 0;
    int n = atoi(sp + 1), ok = 0;
    uint32_t lowest = 0xffffffff, sumMs = 0, maxMs = 0;
    static char resp[256];
    const char *body = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\",\"params\":[]}";
    for (int i = 0; i < n; i++) {
      NetStats st;
      int status = net_post_json(cmd + 9, 443, "/rpc", body, strlen(body), resp, sizeof(resp), &st, 20000);
      bool good = status == 200 && strstr(resp, "0x539");
      ok += good;
      if (st.heapLowest < lowest) lowest = st.heapLowest;
      sumMs += st.totalMs; if (st.totalMs > maxMs) maxMs = st.totalMs;
      if (!good) Serial.printf("  call %d failed: status=%d\n", i + 1, status);
      yield();
    }
    Serial.printf("RPCLOOP ok=%d/%d avgMs=%u maxMs=%u heapLowest=%u heapNow=%u uptimeMs=%u\n", ok, n, n ? sumMs / n : 0, maxMs, lowest, ESP.getFreeHeap(), millis());
    return;
  }
  if (strncmp(cmd, "rpc ", 4) == 0) {  // rpc <host> <method>  : JSON-RPC with no params to https://host/rpc
    char *sp = strchr(cmd + 4, ' ');
    if (!sp) { Serial.println("ERROR usage: rpc <host> <method>"); return; }
    *sp = 0;
    char body[160];
    snprintf(body, sizeof(body), "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"%s\",\"params\":[]}", sp + 1);
    static char resp[1024];
    NetStats st;
    int status = net_post_json(cmd + 4, 443, "/rpc", body, strlen(body), resp, sizeof(resp), &st, 20000);
    Serial.printf("RPC status=%d connectMs=%u totalMs=%u heapBefore=%u heapLowest=%u len=%u\n", status, st.connectMs, st.totalMs, st.heapBefore, st.heapLowest, (unsigned)st.respLen);
    Serial.printf("BODY %s\n", resp);
    return;
  }
  if (strncmp(cmd, "build ", 6) == 0 || strncmp(cmd, "report ", 7) == 0) {
    bool isReport = cmd[0] == 'r';
    ReportParams p;
    if (!parseReport(cmd + (isReport ? 7 : 6), &p)) { Serial.println("ERROR bad_report_args"); return; }
    if (isReport) {
      uint8_t *raw = (uint8_t *)malloc(FRAMETX_MAX_RAW);
      if (!raw) { Serial.println("ERROR out_of_memory"); return; }
      size_t n = 0;
      ReportParams used;
      IntentInfo info;
      IntentResult r = intent_sign(p, raw, FRAMETX_MAX_RAW, &n, &used, &info);
      Serial.printf("RESULT %s resent=%d jumped=%d cleared=%d steps=%u leaf=%u salt=%u\n", intent_name(r), info.resent, info.jumped, info.clearedDone, info.steps, info.leaf, r == INTENT_OK ? used.salt : p.salt);
      if (r == INTENT_OK) { Serial.print("RAW "); printHex(raw, n); Serial.println(); }
      free(raw);
      return;
    }
    // build: no key, no state. A stand-in signature (byte i = (i*13+5) & 255) lets the encoding be compared.
    uint8_t digest[32];
    uint32_t steps;
    if (!frametx_guard(&p, digest, &steps)) { Serial.println("ERROR guard_failed"); return; }
    uint8_t *sig = (uint8_t *)malloc(WOTS_SIG_BYTES), *raw = (uint8_t *)malloc(FRAMETX_MAX_RAW);
    if (!sig || !raw) { free(sig); free(raw); Serial.println("ERROR out_of_memory"); return; }
    for (size_t i = 0; i < WOTS_SIG_BYTES; i++) sig[i] = (i * 13 + 5) & 255;
    uint8_t cd[4 + 10 * 32 + 64];
    size_t cl = frametx_calldata(p, cd, sizeof(cd));
    size_t n = frametx_encode(p, sig, WOTS_SIG_BYTES, raw, FRAMETX_MAX_RAW);
    Serial.printf("BUILD steps=%u salt=%u\n", steps, p.salt);
    Serial.print("CALLDATA "); printHex(cd, cl); Serial.println();
    Serial.print("DIGEST "); printHex(digest, 32); Serial.println();
    Serial.print("RAW "); printHex(raw, n); Serial.println();
    Serial.print("JSON "); frametx_json(p, sig, WOTS_SIG_BYTES, Serial); Serial.println();
    free(sig); free(raw);
    return;
  }
  if (strcmp(cmd, "state") == 0) {
    uint32_t nl; bool hi; uint64_t in;
    intent_state(&nl, &hi, &in);
    Serial.printf("STATE nextLeaf=%u hasIntent=%d intentNonce=", nl, hi);
    printU64(in);
    Serial.println();
    return;
  }
  if (strncmp(cmd, "set-leaf ", 9) == 0) { intent_set_next_leaf(atoi(cmd + 9)); Serial.println("OK"); return; }
  if (strcmp(cmd, "state-reset") == 0) { intent_reset(); Serial.println("OK"); return; }
  if (strncmp(cmd, "crash-at", 8) == 0) { intent_crash_at(cmd[8] == ' ' ? cmd + 9 : ""); Serial.println("OK"); return; }
  if (strncmp(cmd, "zgblock ", 8) == 0) { zerog_set_blackhole(strcmp(cmd + 8, "on") == 0); Serial.println("OK"); return; }
  if (strncmp(cmd, "loop ", 5) == 0) { machine_enable(strcmp(cmd + 5, "on") == 0); Serial.println("OK"); return; }
  if (strcmp(cmd, "checkpoint-now") == 0) { machine_checkpoint_now(); Serial.println("OK"); return; }
  if (strncmp(cmd, "inject ", 7) == 0) {  // inject none|run|inspect|fail: stands in for 0G in tests. Dev builds only.
    const char *a = cmd + 7;
    machine_set_inject(strcmp(a, "run") == 0 ? 1 : strcmp(a, "inspect") == 0 ? 2 : strcmp(a, "fail") == 0 ? 3 : 0);
    Serial.println("OK");
    return;
  }
  if (strncmp(cmd, "keccak ", 7) == 0) {
    uint8_t in[128], out[32];
    size_t hexLen = strlen(cmd + 7);
    if (hexLen % 2 || hexLen / 2 > sizeof(in) || !parseHex(cmd + 7, in, hexLen / 2)) { Serial.println("ERROR bad_hex"); return; }
    keccak256(in, hexLen / 2, out);
    Serial.print("KECCAK "); printHex(out, 32); Serial.println();
    return;
  }
  if (strncmp(cmd, "keccak-pat ", 11) == 0) {  // input byte i = (i*7+3) & 255, for lengths too long to send as hex
    size_t len = atoi(cmd + 11);
    if (len > 2200) { Serial.println("ERROR bad_length"); return; }
    uint8_t *in = (uint8_t *)malloc(len ? len : 1), out[32];
    if (!in) { Serial.println("ERROR out_of_memory"); return; }
    for (size_t i = 0; i < len; i++) in[i] = (i * 7 + 3) & 255;
    keccak256(in, len, out);
    free(in);
    Serial.print("KECCAK "); printHex(out, 32); Serial.println();
    return;
  }
  if (strncmp(cmd, "keygen-fixed ", 13) == 0) {
    uint8_t seed[32];
    if (!parseHex(cmd + 13, seed, 32)) { Serial.println("ERROR bad_seed"); return; }
    uint32_t ms;
    if (!keystore::createFromSeed(seed, &ms)) { Serial.println("ERROR keygen_failed"); return; }
    memset(seed, 0, 32);
    Serial.print("KEY READY root=0x"); printHex(keystore::root(), 32);
    Serial.print(" pubSeed=0x"); printHex(keystore::pubSeed(), 16);
    Serial.printf(" ms=%u source=fixed\n", ms);
    return;
  }
  if (strncmp(cmd, "sign ", 5) == 0) {
    char *sp = strchr(cmd + 5, ' ');
    uint8_t digest[32];
    if (!sp) { Serial.println("ERROR usage"); return; }
    *sp = 0;
    uint32_t leaf = atoi(cmd + 5);
    if (!parseHex(sp + 1, digest, 32) || leaf >= WOTS_LEAVES) { Serial.println("ERROR bad_args"); return; }
    uint8_t *sig = (uint8_t *)malloc(WOTS_SIG_BYTES);
    if (!sig) { Serial.println("ERROR out_of_memory"); return; }
    uint32_t t0 = millis();
    bool ok = keystore::sign(leaf, digest, sig);
    uint32_t ms = millis() - t0;
    if (!ok) { free(sig); Serial.println("ERROR sign_failed"); return; }
    Serial.printf("SIGMS %u heap=%u\n", ms, ESP.getFreeHeap());
    Serial.print("SIG "); printHex(sig, WOTS_SIG_BYTES); Serial.println();
    free(sig);
    return;
  }
  if (strcmp(cmd, "wipe") == 0) {
    keystore::wipe();
    Serial.println("WIPED restarting");
    Serial.flush();
    ESP.restart();
    return;
  }
#endif
  Serial.println("UNKNOWN");
}

void console_poll() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      line[lineLen] = 0;
      if (lineLen) handle(line);
      lineLen = 0;
    } else if (lineLen < sizeof(line) - 1) {
      line[lineLen++] = c;
    } else {
      lineLen = 0;
      Serial.println("ERROR line_too_long");
    }
  }
}
