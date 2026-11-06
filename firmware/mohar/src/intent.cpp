#include "intent.h"
#include <Arduino.h>
#include <LittleFS.h>
#include <string.h>
#include "keccak.h"
#include "keystore.h"

// Two slots, each with a sequence number and a checksum. A write goes to the older slot, so a power cut
// during a write leaves the other one intact.
struct State {
  uint32_t magic;
  uint32_t seq;
  uint32_t nextLeaf;     // leaves 0 .. nextLeaf-1 have been, or may have been, used
  uint8_t hasIntent;
  uint8_t pad[3];
  uint64_t intentNonce;
  uint8_t rootTag[8];    // ties the state to one key: a new key starts a new counter
  ReportParams params;   // the intended report, with its final salt
  uint8_t digest[32];
  uint8_t check[32];
};
static const uint32_t MAGIC = 0x4d535431;  // "MST1"
static State g;
static bool loaded = false;

#ifdef MOHAR_DEV
static const char *crashAt = nullptr;
void intent_crash_at(const char *point) { static char buf[24]; if (point && *point) { strncpy(buf, point, sizeof(buf) - 1); crashAt = buf; } else crashAt = nullptr; }
static void crashPoint(const char *name) {
  if (crashAt && strcmp(crashAt, name) == 0) {
    Serial.printf("CRASH %s\n", name);
    Serial.flush();
    ESP.restart();
    while (true) delay(1);
  }
}
#else
static void crashPoint(const char *) {}
#endif

const char *intent_name(IntentResult r) {
  switch (r) {
    case INTENT_OK: return "OK";
    case INTENT_LEAF_USED: return "LEAF_USED";
    case INTENT_CHAIN_BEHIND: return "CHAIN_BEHIND";
    case INTENT_KEYS_EXHAUSTED: return "KEYS_EXHAUSTED";
    case INTENT_NO_KEY: return "NO_KEY";
    case INTENT_BAD_NONCE: return "BAD_NONCE";
    case INTENT_GUARD_FAILED: return "GUARD_FAILED";
    default: return "FS_ERROR";
  }
}

static void seal(State *s) {
  memset(s->check, 0, 32);
  keccak256((const uint8_t *)s, offsetof(State, check), s->check);
}
static bool valid(const State &s) {
  uint8_t c[32];
  if (s.magic != MAGIC) return false;
  keccak256((const uint8_t *)&s, offsetof(State, check), c);
  return memcmp(c, s.check, 32) == 0 && memcmp(s.rootTag, keystore::root(), 8) == 0;
}
static bool readSlot(const char *path, State *s) {
  File f = LittleFS.open(path, "r");
  if (!f) return false;
  bool ok = f.size() == sizeof(State) && f.read((uint8_t *)s, sizeof(State)) == sizeof(State);
  f.close();
  return ok && valid(*s);
}
static void freshState() {
  memset(&g, 0, sizeof(g));
  g.magic = MAGIC;
  memcpy(g.rootTag, keystore::root(), 8);
}
static void load() {
  State a, b;
  bool ha = readSlot("/state.a", &a), hb = readSlot("/state.b", &b);
  if (ha && (!hb || a.seq >= b.seq)) g = a;
  else if (hb) g = b;
  else freshState();
  loaded = true;
}
static bool save() {
  g.seq++;
  seal(&g);
  File f = LittleFS.open((g.seq & 1) ? "/state.a" : "/state.b", "w");
  if (!f) return false;
  bool ok = f.write((const uint8_t *)&g, sizeof(State)) == sizeof(State);
  f.close();
  return ok;
}

static bool sameContent(const ReportParams &a, const ReportParams &b) {
  return memcmp(&a, &b, sizeof(ReportParams)) == 0;
}

void intent_state(uint32_t *nextLeaf, bool *hasIntent, uint64_t *intentNonce) {
  if (!loaded && keystore::ready()) load();
  *nextLeaf = g.nextLeaf;
  *hasIntent = g.hasIntent;
  *intentNonce = g.intentNonce;
}
void intent_set_next_leaf(uint32_t v) {
  if (!loaded && keystore::ready()) load();
  g.nextLeaf = v;
  g.hasIntent = 0;
  save();
}
void intent_reset() {
  if (!loaded) load();
  uint32_t keep = g.seq;  // the sequence must keep rising, or an older slot would win after a reboot
  freshState();
  g.seq = keep;
  loaded = true;
  save();
}

IntentResult intent_sign(const ReportParams &req, uint8_t *raw, size_t cap, size_t *rawLen, ReportParams *used, IntentInfo *info) {
  memset(info, 0, sizeof(*info));
  if (!keystore::ready()) return INTENT_NO_KEY;
  if (!loaded) load();
  if (req.nonce < 1) return INTENT_BAD_NONCE;

  // Finish the request: change the salt until the verifier fits the gas limit. No key is used yet.
  ReportParams p = req;
  uint8_t digest[32];
  if (!frametx_guard(&p, digest, &info->steps)) return INTENT_GUARD_FAILED;

  if (g.hasIntent) {
    if (req.nonce < g.intentNonce) return INTENT_CHAIN_BEHIND;  // the chain is behind what we already signed
    if (req.nonce == g.intentNonce) {
      // Same transaction slot. Only the identical content may be rebuilt, and it yields identical bytes.
      if (memcmp(digest, g.digest, 32) != 0) return INTENT_LEAF_USED;
      info->resent = true;
      p = g.params;
      memcpy(digest, g.digest, 32);
      info->leaf = (uint32_t)(g.intentNonce - 1);
      goto sign;
    }
    // The chain moved past the intent: it was mined. Mark it done.
    g.hasIntent = 0;
    if (g.nextLeaf < g.intentNonce) g.nextLeaf = (uint32_t)g.intentNonce;
    info->clearedDone = true;
    if (!save()) return INTENT_FS_ERROR;
  }

  {
    uint64_t expected = (uint64_t)g.nextLeaf + 1;
    if (req.nonce < expected) return INTENT_CHAIN_BEHIND;  // would reuse a leaf: a reset chain or a lying RPC
    if (req.nonce > expected) { info->jumped = true; }
    uint64_t leaf = req.nonce - 1;
    if (leaf >= WOTS_LEAVES) return INTENT_KEYS_EXHAUSTED;
    info->leaf = (uint32_t)leaf;
    // Save the intent first. Only then does a signature exist.
    g.nextLeaf = (uint32_t)leaf + 1;
    g.hasIntent = 1;
    g.intentNonce = req.nonce;
    g.params = p;
    memcpy(g.digest, digest, 32);
    if (!save()) return INTENT_FS_ERROR;
    crashPoint("after_intent");
  }

sign:
  static uint8_t sig[WOTS_SIG_BYTES];
  if (!keystore::sign(info->leaf, digest, sig)) return INTENT_FS_ERROR;
  crashPoint("after_sign");
  *rawLen = frametx_encode(p, sig, WOTS_SIG_BYTES, raw, cap);
  *used = p;
  return *rawLen ? INTENT_OK : INTENT_FS_ERROR;
}
