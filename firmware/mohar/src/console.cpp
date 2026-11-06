#include "console.h"
#include <Arduino.h>
#include <string.h>
#include "keccak.h"
#include "keystore.h"

static char line[320];
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
#endif

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

static void handle(char *cmd) {
  if (strcmp(cmd, "info") == 0) { cmdInfo(); return; }
#ifdef MOHAR_DEV
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
