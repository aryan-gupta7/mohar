#include "machine.h"
#include <Arduino.h>
#include <string.h>
#include "config.h"
#include "frametx.h"
#include "intent.h"
#include "keccak.h"
#include "keystore.h"
#include "meter.h"
#include "net.h"
#include "rpc.h"
#include "zerog.h"

static const uint8_t STATUS_LED = 2;   // D4, active low
static const uint8_t PULSE_LED = 16;   // D0, active low
static const uint32_t PEAK_LIMIT_W = 13800;  // 60 A at 230 V: beyond what the meter can measure
static const uint8_t MODEL_QWEN_FLASH = 1;

static DeviceConfig cfg;
static bool haveCfg = false, enabled = true;
static Mode mode = MODE_SAFE_STOP;      // SAFE_STOP until the first full check passes
static uint32_t nextCheckpoint = 0;
static bool baseSet = false;
static uint32_t prevAvgW = 0;
static bool havePrev = false;
static uint32_t lastPulseSeen = 0, pulseLedUntil = 0;
static int inject = 0;
static bool force = false;

Mode machine_mode() { return mode; }
void machine_enable(bool on) { enabled = on; }
void machine_set_inject(int v) { inject = v; }
void machine_checkpoint_now() { force = true; }

void machine_begin() {
  pinMode(STATUS_LED, OUTPUT);
  pinMode(PULSE_LED, OUTPUT);
  digitalWrite(STATUS_LED, HIGH);
  digitalWrite(PULSE_LED, HIGH);
  haveCfg = config_load(&cfg);
  nextCheckpoint = millis() + 10000;
  Serial.printf("MACHINE config=%s mode=SAFE_STOP (until the first full check)\n", haveCfg ? "present" : "missing: run provision");
}

static const char *modeName(Mode m) {
  switch (m) { case MODE_RUN: return "RUN"; case MODE_INSPECT: return "INSPECT"; case MODE_CREDIT_STOP: return "CREDIT_STOP"; default: return "SAFE_STOP"; }
}
static int severity(Mode m) { return m == MODE_RUN ? 0 : m == MODE_CREDIT_STOP ? 1 : m == MODE_INSPECT ? 2 : 3; }
static Mode moreCautious(Mode a, Mode b) { return severity(a) >= severity(b) ? a : b; }

// ---------------------------------------------------------------- events ---
// One JSON object per line, prefixed "EV ", for each real step of a checkpoint. The dashboard shows exactly these and
// never invents progress. Format: docs/event-protocol.md. `ms` is the board's uptime in milliseconds.
static uint32_t cpCounter = 0;
#define EV(fmt, ...) Serial.printf("EV {\"cp\":%u,\"ms\":%u," fmt "}\n", (unsigned)cpCounter, (unsigned)millis(), ##__VA_ARGS__)

// ---------------------------------------------------------------- LEDs ---
static void leds() {
  uint32_t now = millis();
  // pulse LED: flashes for each valid pulse counted
  uint32_t v, g, st;
  int level;
  meter_raw(&v, &g, &st, &level);
  if (v != lastPulseSeen) { lastPulseSeen = v; pulseLedUntil = now + 60; }
  digitalWrite(PULSE_LED, now < pulseLedUntil ? LOW : HIGH);
  // status LED: RUN one short blink per 2 s; INSPECT two quick blinks; CREDIT_STOP slow on/off; SAFE_STOP solid
  uint32_t t = now % 2000;
  bool on = false;
  switch (mode) {
    case MODE_RUN: on = t < 80; break;
    case MODE_INSPECT: on = t < 80 || (t >= 240 && t < 320); break;
    case MODE_CREDIT_STOP: on = (now % 2000) < 1000; break;
    default: on = true; break;
  }
  digitalWrite(STATUS_LED, on ? LOW : HIGH);
}

// ---------------------------------------------------------------- chain reads ---
struct LedgerView {
  bool ok;
  uint64_t credit, lastSeq, lastTotal, tariff, arrears;
  bool hold;
  uint8_t ledgerMode;
};
static uint64_t hexU64(const char *s, size_t n) { uint64_t v = 0; for (size_t i = 0; i < n; i++) { char c = s[i]; v = (v << 4) | (c <= '9' ? c - '0' : (c | 32) - 'a' + 10); } return v; }
static void hex20(char *out, const uint8_t *b) { static const char *H = "0123456789abcdef"; for (int i = 0; i < 20; i++) { out[2 * i] = H[b[i] >> 4]; out[2 * i + 1] = H[b[i] & 15]; } out[40] = 0; }

static LedgerView readLedger() {
  LedgerView v;
  memset(&v, 0, sizeof(v));
  char to[41];
  hex20(to, cfg.ledger);
  char body[200];
  snprintf(body, sizeof(body), "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"0x%s\",\"data\":\"0x200d2ed2\"},\"latest\"]}", to);
  char *resp = (char *)malloc(900);
  if (!resp) return v;
  if (!rpc_call(cfg, body, resp, 900, 25000)) { free(resp); return v; }
  const char *res = strstr(resp, "\"result\":\"0x");
  if (!res || strlen(res) < 10 + 9 * 64) { free(resp); return v; }
  const char *w = res + 12;  // past "result":"0x
  v.credit = hexU64(w + 0 * 64 + 48, 16);
  v.hold = hexU64(w + 1 * 64 + 63, 1) != 0;
  v.lastSeq = hexU64(w + 2 * 64 + 48, 16);
  v.lastTotal = hexU64(w + 3 * 64 + 48, 16);
  v.tariff = hexU64(w + 4 * 64 + 48, 16);
  v.arrears = hexU64(w + 6 * 64 + 48, 16);
  v.ledgerMode = (uint8_t)hexU64(w + 8 * 64 + 62, 2);
  v.ok = true;
  free(resp);
  return v;
}

static bool readNonce(uint64_t *nonce) {
  char from[41];
  hex20(from, cfg.sender);
  char body[160];
  snprintf(body, sizeof(body), "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionCount\",\"params\":[\"0x%s\",\"latest\"]}", from);
  char resp[160];
  char res[24];
  if (!rpc_call(cfg, body, resp, sizeof(resp), 25000) || !json_string(resp, "result", res, sizeof(res))) return false;
  *nonce = strtoull(res, nullptr, 16);
  return true;
}

// ---------------------------------------------------------------- the checkpoint ---
static void checkpoint() {
  MeterWindow w;
  meter_take_window(&w);
  uint32_t t0 = millis();
  cpCounter++;
  EV("\"e\":\"cp_start\"");
  EV("\"e\":\"window\",\"valid\":%u,\"glitches\":%u,\"stuck\":%u,\"avgW\":%u,\"peakW\":%u,\"windowMs\":%u,\"gapMs\":%u,\"total\":%u",
     (unsigned)w.validPulses, (unsigned)w.glitches, (unsigned)w.stuckLow, (unsigned)w.avgWatts, (unsigned)w.peakWatts, (unsigned)w.windowMs, (unsigned)w.longestGapMs, (unsigned)meter_total());

  Mode wanted = MODE_RUN;
  Reason reason = R_OK;
  char requestId[40] = "";
  const char *aiNote = "none";

  LedgerView lv = readLedger();
  uint64_t nonce = 0;
  bool chainOk = lv.ok && readNonce(&nonce);
  if (!chainOk) EV("\"e\":\"ledger_read\",\"ok\":false");
  else EV("\"e\":\"ledger_read\",\"ok\":true,\"credit\":%u,\"arrears\":%u,\"hold\":%d,\"lastSeq\":%u,\"lastTotal\":%u,\"tariff\":%u,\"ledgerMode\":%u,\"nonce\":%u", (unsigned)lv.credit, (unsigned)lv.arrears, lv.hold, (unsigned)lv.lastSeq, (unsigned)lv.lastTotal, (unsigned)lv.tariff, (unsigned)lv.ledgerMode, (unsigned)nonce);
  if (!chainOk) {
    // Can't read the chain, so can't report either. Stay (or go) SAFE_STOP; pulses keep being counted.
    mode = MODE_SAFE_STOP;
    Serial.printf("CP mode=SAFE_STOP reason=%d chain=down valid=%u glitches=%u total=", R_CHAIN_DOWN, w.validPulses, w.glitches);
    Serial.println((unsigned long)meter_total());
    return;
  }
  if (!baseSet) {  // continue from the ledger's total after a reboot, or the ledger would reject a lower one
    meter_set_base(lv.lastTotal);
    baseSet = true;
    w.totalPulses = meter_total();
  }

  // 1. Fixed checks. No network, no AI.
  bool local = false;
  if (w.peakWatts > PEAK_LIMIT_W) { wanted = MODE_INSPECT; reason = R_LOCAL_PEAK; local = true; }
  else if (w.glitches >= 3) { wanted = MODE_INSPECT; reason = R_LOCAL_GLITCH; local = true; }
  else if (w.stuckLow >= 1) { wanted = MODE_INSPECT; reason = R_LOCAL_STUCK; local = true; }

  EV("\"e\":\"local_check\",\"result\":\"%s\"", local ? (reason == R_LOCAL_PEAK ? "peak" : reason == R_LOCAL_GLITCH ? "glitch" : "stuck") : "pass");

  // 2. The decision model, for what the fixed checks don't settle. No decision means SAFE_STOP.
  if (!local) {
    EV("\"e\":\"ai_request\",\"model\":\"qwen3.8-flash\",\"provider\":\"0G Private Computer\"");
    ZgAnswer ans = ZG_NONE;
    char why[48] = "";
#ifdef MOHAR_DEV
    if (inject == 1) { ans = ZG_RUN; strcpy(requestId, "dev-injected"); aiNote = "injected"; }
    else if (inject == 2) { ans = ZG_INSPECT; strcpy(requestId, "dev-injected"); aiNote = "injected"; }
    else if (inject == 3) { ans = ZG_NONE; strcpy(why, "injected_failure"); aiNote = "injected-fail"; }
    else
#endif
    {
      char text[420];
      snprintf(text, sizeof(text),
               "Electricity meter, last %u s. Sanctioned load %u W, meter limit %u W. Valid pulses %u, average %u W, peak %u W, longest gap between pulses %u.%u s. Pulse-line glitches %u, stuck-low events %u.%s",
               (unsigned)((w.windowMs + 500) / 1000), (unsigned)cfg.sanctionedW, (unsigned)PEAK_LIMIT_W, (unsigned)w.validPulses, (unsigned)w.avgWatts, (unsigned)w.peakWatts,
               (unsigned)(w.longestGapMs / 1000), (unsigned)((w.longestGapMs % 1000) / 100), (unsigned)w.glitches, (unsigned)w.stuckLow, "");
      if (havePrev) {
        size_t n = strlen(text);
        snprintf(text + n, sizeof(text) - n, " Previous window averaged %u W.", (unsigned)prevAvgW);
      }
      ZgResult zr = zerog_decide(text, 20000);
      ans = zr.answer;
      EV("\"e\":\"ai_response\",\"answer\":\"%s\",\"rid\":\"%s\",\"latencyMs\":%u,\"http\":%d,\"why\":\"%s\"", ans == ZG_RUN ? "RUN" : ans == ZG_INSPECT ? "INSPECT" : "NONE", zr.requestId, (unsigned)zr.ms, zr.httpStatus, zr.why);
      strncpy(requestId, zr.requestId, sizeof(requestId) - 1);
      strncpy(why, zr.why, sizeof(why) - 1);
      aiNote = ans == ZG_NONE ? why : "0g";
    }
    if (ans == ZG_NONE) { wanted = MODE_SAFE_STOP; reason = R_NO_DECISION; requestId[0] = 0; }
    else if (ans == ZG_INSPECT) { wanted = MODE_INSPECT; reason = R_AI_INSPECT; }
  }
  prevAvgW = w.avgWatts;
  havePrev = true;

  // 3. The ledger's own view can only add caution: a hold, or credit that can't cover a pulse.
  Mode result = wanted;
  if (lv.hold) { result = moreCautious(result, MODE_INSPECT); if (reason == R_OK) reason = R_HOLD; }
  if (lv.ledgerMode == MODE_CREDIT_STOP) { result = moreCautious(result, MODE_CREDIT_STOP); if (reason == R_OK) reason = R_CREDIT; }
  mode = result;
  EV("\"e\":\"decision\",\"mode\":\"%s\",\"reason\":%d,\"aiWanted\":\"%s\",\"ledgerHold\":%d,\"ledgerMode\":%u,\"aiSource\":\"%s\"",
     modeName(mode), reason, modeName(wanted), lv.hold, (unsigned)lv.ledgerMode, aiNote);

  // 4. Report. Resend a pending identical transaction if the last one hasn't been mined.
  ReportParams p;
  memset(&p, 0, sizeof(p));
  memcpy(p.sender, cfg.sender, 20);
  memcpy(p.ledger, cfg.ledger, 20);
  memcpy(p.paymaster, cfg.paymaster, 20);
  p.nonce = nonce;
  p.maxPrio = cfg.maxPrio;
  p.maxFee = cfg.maxFee;
  p.seq = lv.lastSeq + 1;
  p.total = meter_total();
  p.mode = (uint8_t)mode;
  p.reason = (uint8_t)reason;
  p.confidence = 0;  // the chat model gives no probability
  p.model = requestId[0] && strcmp(requestId, "dev-injected") != 0 ? MODEL_QWEN_FLASH : 0;
  meter_pack(&w, p.sensors);
  if (requestId[0]) { p.reqLen = strlen(requestId) > REPORT_MAX_ID ? REPORT_MAX_ID : strlen(requestId); memcpy(p.reqId, requestId, p.reqLen); }

  uint32_t nl; bool hasIntent; uint64_t intentNonce;
  intent_state(&nl, &hasIntent, &intentNonce);
  bool resendOld = hasIntent && intentNonce == nonce;
  if (resendOld) intent_pending_params(&p);  // same transaction slot: only the identical content may be signed

  uint8_t *sig = (uint8_t *)malloc(WOTS_SIG_BYTES);
  uint8_t *raw = (uint8_t *)malloc(FRAMETX_MAX_RAW);
  if (!sig || !raw) { free(sig); free(raw); Serial.println("CP error=out_of_memory"); return; }
  size_t rawLen = 0;
  ReportParams used;
  IntentInfo info;
  EV("\"e\":\"sign_start\",\"nonce\":%u,\"leaf\":%u", (unsigned)nonce, (unsigned)(nonce ? nonce - 1 : 0));
  uint32_t tSign = millis();
  IntentResult r = intent_sign(p, raw, FRAMETX_MAX_RAW, &rawLen, &used, &info, sig);
  EV("\"e\":\"sign_done\",\"result\":\"%s\",\"ms\":%u,\"steps\":%u,\"leaf\":%u,\"leavesLeft\":%d,\"resent\":%d", intent_name(r), (unsigned)(millis() - tSign), (unsigned)info.steps, (unsigned)info.leaf, 255 - (int)info.leaf, info.resent);
  uint8_t h[32];
  if (r == INTENT_OK) keccak256(raw, rawLen, h);
  free(raw);
  if (r == INTENT_KEYS_EXHAUSTED) { mode = MODE_SAFE_STOP; reason = R_KEYS_EXHAUSTED; }
  const char *sent = "no";
  char txHash[80] = "";
  if (r == INTENT_OK) {
    char *resp = (char *)malloc(400);
    if (!resp) { free(sig); Serial.println("CP error=out_of_memory"); return; }
    EV("\"e\":\"submit\",\"transport\":\"%s\"", cfg.transport ? "wifi" : "usb-bridge");
    bool ok = rpc_send_tx(cfg, used, sig, resp, 400, 40000);
    char node[80] = "";
    if (ok && json_string(resp, "result", node, sizeof(node))) {
      char mine[67] = "0x";
      static const char *H = "0123456789abcdef";
      for (int i = 0; i < 32; i++) { mine[2 + 2 * i] = H[h[i] >> 4]; mine[3 + 2 * i] = H[h[i] & 15]; }
      mine[66] = 0;
      sent = strcasecmp(mine, node) == 0 ? "ok" : "hash_mismatch";
      strncpy(txHash, node, sizeof(txHash) - 1);
    } else {
      sent = "rejected";
      strncpy(txHash, resp, 60); txHash[60] = 0;
    }
    free(resp);
  }
  free(sig);
  if (r == INTENT_OK) EV("\"e\":\"submitted\",\"result\":\"%s\",\"hash\":\"%s\"", sent, txHash);
  EV("\"e\":\"cp_end\",\"mode\":\"%s\",\"totalMs\":%u", modeName(mode), (unsigned)(millis() - t0));
  Serial.printf("CP mode=%s reason=%d ai=%s rid=%s seq=%u nonce=%u total=%u valid=%u glitches=%u stuck=%u avgW=%u peakW=%u hold=%d credit=%u intent=%s resent=%d sent=%s ms=%u heap=%u tx=%s\n",
                modeName(mode), reason, aiNote, requestId[0] ? requestId : "-", (unsigned)p.seq, (unsigned)nonce, (unsigned)p.total, (unsigned)w.validPulses, (unsigned)w.glitches,
                (unsigned)w.stuckLow, (unsigned)w.avgWatts, (unsigned)w.peakWatts, lv.hold, (unsigned)lv.credit, intent_name(r), info.resent, sent, millis() - t0, ESP.getFreeHeap(), txHash);
}

void machine_tick() {
  leds();
  if (!haveCfg) return;
  meter_poll();
  if (force || (enabled && (int32_t)(millis() - nextCheckpoint) >= 0)) {
    force = false;
    checkpoint();
    nextCheckpoint = millis() + (uint32_t)cfg.checkpointS * 1000;
  }
}

void machine_reload_config() { haveCfg = config_load(&cfg); }
