#include "keystore.h"
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <LittleFS.h>
#include <string.h>
#include "keccak.h"

static uint8_t g_seed[32];
static uint8_t g_pubSeed[16];
static uint8_t g_root[32];
static bool g_ready = false;

// Node index of (level, i): level 0 = 256 leaves, then 128, 64, ... 1.
static uint32_t nodeIndex(uint32_t level, uint32_t i) {
  uint32_t base = 0, size = WOTS_LEAVES;
  for (uint32_t l = 0; l < level; l++) { base += size; size >>= 1; }
  return base + i;
}

static bool writeFile(const char *path, const uint8_t *data, size_t len) {
  String tmp = String(path) + ".tmp";
  File f = LittleFS.open(tmp, "w");
  if (!f) return false;
  bool ok = f.write(data, len) == len;
  f.close();
  if (!ok) { LittleFS.remove(tmp); return false; }
  LittleFS.remove(path);
  return LittleFS.rename(tmp, path);
}

static bool readFile(const char *path, uint8_t *data, size_t len) {
  File f = LittleFS.open(path, "r");
  if (!f) return false;
  bool ok = f.size() == len && f.read(data, len) == len;
  f.close();
  return ok;
}

// Builds the whole tree in RAM (16,352 bytes), then saves it in one file.
static bool buildTree(uint32_t *ms) {
  uint32_t t0 = millis();
  uint8_t *tree = (uint8_t *)malloc(TREE_BYTES);
  uint8_t *scratch = (uint8_t *)malloc(WOTS_PK_BYTES);
  if (!tree || !scratch) { free(tree); free(scratch); Serial.println("ERROR keygen_out_of_memory"); return false; }
  for (uint32_t leaf = 0; leaf < WOTS_LEAVES; leaf++) {
    wots_leaf(g_seed, g_pubSeed, leaf, tree + nodeIndex(0, leaf) * 32, scratch);
    if ((leaf & 15) == 15) Serial.printf("PROGRESS leaf=%u/%u ms=%u\n", leaf + 1, WOTS_LEAVES, millis() - t0);
    ESP.wdtFeed();
  }
  free(scratch);
  uint8_t two[64];
  for (uint32_t level = 0, size = WOTS_LEAVES; level < WOTS_HEIGHT; level++, size >>= 1) {
    for (uint32_t i = 0; i < size; i += 2) {
      memcpy(two, tree + nodeIndex(level, i) * 32, 32);
      memcpy(two + 32, tree + nodeIndex(level, i + 1) * 32, 32);
      keccak256(two, 64, tree + nodeIndex(level + 1, i >> 1) * 32);
    }
  }
  memcpy(g_root, tree + nodeIndex(WOTS_HEIGHT, 0) * 32, 32);
  bool ok = writeFile("/tree.bin", tree, TREE_BYTES);
  free(tree);
  *ms = millis() - t0;
  if (!ok) Serial.println("ERROR tree_write_failed");
  return ok;
}

namespace keystore {

bool mount() { return LittleFS.begin(); }
bool ready() { return g_ready; }
const uint8_t *root() { return g_root; }
const uint8_t *pubSeed() { return g_pubSeed; }

bool createFromSeed(const uint8_t seed[32], uint32_t *ms) {
  g_ready = false;
  LittleFS.remove("/tree.bin");  // a seed without a matching tree must never look usable
  memcpy(g_seed, seed, 32);
  wots_pubseed(g_seed, g_pubSeed);
  if (!writeFile("/seed.bin", g_seed, 32)) { Serial.println("ERROR seed_write_failed"); return false; }
  if (!buildTree(ms)) return false;
  g_ready = true;
  return true;
}

// Seed from the hardware random generator. The radio must be on for it to be good, so the caller enables it.
static void randomSeed32(uint8_t seed[32]) {
  uint8_t pool[32 * 4 + 32 + 16];
  size_t n = 0;
  for (int i = 0; i < 32; i++) {
    uint32_t r = *(volatile uint32_t *)0x3FF20E44;  // RANDOM_REG32
    memcpy(pool + n, &r, 4);
    n += 4;
    delayMicroseconds(37 + (i * 13) % 29);
  }
  uint32_t t = micros(), id = ESP.getChipId();
  memcpy(pool + n, &t, 4); n += 4;
  memcpy(pool + n, &id, 4); n += 4;
  keccak256(pool, n, seed);
}

bool loadOrCreate(bool *generated, uint32_t *ms) {
  uint32_t t0 = millis();
  *generated = false;
  if (readFile("/seed.bin", g_seed, 32)) {
    wots_pubseed(g_seed, g_pubSeed);
    uint8_t *tree = (uint8_t *)malloc(32);
    File f = LittleFS.open("/tree.bin", "r");
    bool haveTree = f && f.size() == TREE_BYTES;
    if (haveTree) {
      f.seek(nodeIndex(WOTS_HEIGHT, 0) * 32);
      haveTree = f.read(g_root, 32) == 32;
    }
    if (f) f.close();
    free(tree);
    if (haveTree) { g_ready = true; *ms = millis() - t0; return true; }
    Serial.println("INFO seed found without a valid tree: rebuilding the tree from the same seed");
    *generated = true;
    uint32_t b;
    if (!buildTree(&b)) return false;
    g_ready = true;
    *ms = millis() - t0;
    return true;
  }
  *generated = true;
  WiFi.mode(WIFI_STA);  // radio on for better randomness; never connects
  delay(200);
  uint8_t seed[32];
  randomSeed32(seed);
  uint32_t b;
  bool ok = createFromSeed(seed, &b);
  memset(seed, 0, 32);
  WiFi.mode(WIFI_OFF);
  *ms = millis() - t0;
  return ok;
}

bool sign(uint32_t leaf, const uint8_t digest[32], uint8_t *sig) {
  if (!g_ready || leaf >= WOTS_LEAVES) return false;
  wots_sign_chains(g_seed, g_pubSeed, leaf, digest, sig);
  File f = LittleFS.open("/tree.bin", "r");
  if (!f) return false;
  uint32_t idx = leaf;
  for (uint32_t level = 0; level < WOTS_HEIGHT; level++) {
    f.seek(nodeIndex(level, idx ^ 1) * 32);
    if (f.read(sig + WOTS_PK_BYTES + level * 32, 32) != 32) { f.close(); return false; }
    idx >>= 1;
  }
  f.close();
  return true;
}

void wipe() {
  g_ready = false;
  LittleFS.remove("/tree.bin");
  LittleFS.remove("/seed.bin");
  memset(g_seed, 0, sizeof(g_seed));
}

}  // namespace keystore
