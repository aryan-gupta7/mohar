// Mohar bench: measures what the board can really do before we design around guesses.
// Prints one RESULT line per measurement so the output is easy to copy into the plan.
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <string.h>

// ---------------------------------------------------------------- Keccak-256 ---
static const uint64_t RC[24] = {
    0x0000000000000001ULL, 0x0000000000008082ULL, 0x800000000000808aULL, 0x8000000080008000ULL,
    0x000000000000808bULL, 0x0000000080000001ULL, 0x8000000080008081ULL, 0x8000000000008009ULL,
    0x000000000000008aULL, 0x0000000000000088ULL, 0x0000000080008009ULL, 0x000000008000000aULL,
    0x000000008000808bULL, 0x800000000000008bULL, 0x8000000000008089ULL, 0x8000000000008003ULL,
    0x8000000000008002ULL, 0x8000000000000080ULL, 0x000000000000800aULL, 0x800000008000000aULL,
    0x8000000080008081ULL, 0x8000000000008080ULL, 0x0000000080000001ULL, 0x8000000080008008ULL};
static const uint8_t ROTC[24] = {1,  3,  6,  10, 15, 21, 28, 36, 45, 55, 2,  14,
                                 27, 41, 56, 8,  25, 43, 62, 18, 39, 61, 20, 44};
static const uint8_t PILN[24] = {10, 7,  11, 17, 18, 3, 5,  16, 8,  21, 24, 4,
                                 15, 23, 19, 13, 12, 2, 20, 14, 22, 9,  6,  1};

static inline uint64_t rotl64(uint64_t x, uint8_t n) { return (x << n) | (x >> (64 - n)); }

static void keccakf(uint64_t st[25]) {
  uint64_t t, bc[5];
  for (int r = 0; r < 24; r++) {
    for (int i = 0; i < 5; i++) bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20];
    for (int i = 0; i < 5; i++) {
      t = bc[(i + 4) % 5] ^ rotl64(bc[(i + 1) % 5], 1);
      for (int j = 0; j < 25; j += 5) st[j + i] ^= t;
    }
    t = st[1];
    for (int i = 0; i < 24; i++) {
      int j = PILN[i];
      bc[0] = st[j];
      st[j] = rotl64(t, ROTC[i]);
      t = bc[0];
    }
    for (int j = 0; j < 25; j += 5) {
      for (int i = 0; i < 5; i++) bc[i] = st[j + i];
      for (int i = 0; i < 5; i++) st[j + i] ^= (~bc[(i + 1) % 5]) & bc[(i + 2) % 5];
    }
    st[0] ^= RC[r];
  }
}

// Keccak-256 (original padding 0x01, as Ethereum uses, not SHA3's 0x06). Little-endian CPU assumed.
static void keccak256(const uint8_t *in, size_t len, uint8_t out[32]) {
  const size_t rate = 136;
  uint64_t st[25];
  memset(st, 0, sizeof(st));
  uint8_t *s = (uint8_t *)st;
  while (len >= rate) {
    for (size_t i = 0; i < rate; i++) s[i] ^= in[i];
    keccakf(st);
    in += rate;
    len -= rate;
  }
  for (size_t i = 0; i < len; i++) s[i] ^= in[i];
  s[len] ^= 0x01;
  s[rate - 1] ^= 0x80;
  keccakf(st);
  memcpy(out, st, 32);
}

// ---------------------------------------------------------------- one chain step ---
// Same shape as the contract and signer: keccak(value || pubSeed(16) | leaf(4) | chain(4) | step(8)).
static void chainStep(uint8_t v[32], uint32_t leaf, uint32_t chain, uint32_t step) {
  uint8_t buf[64];
  memcpy(buf, v, 32);
  memset(buf + 32, 0xA5, 16);  // public seed placeholder
  buf[48] = leaf >> 24;
  buf[49] = leaf >> 16;
  buf[50] = leaf >> 8;
  buf[51] = leaf;
  buf[52] = chain >> 24;
  buf[53] = chain >> 16;
  buf[54] = chain >> 8;
  buf[55] = chain;
  memset(buf + 56, 0, 4);  // high half of the 8-byte step field
  buf[60] = step >> 24;
  buf[61] = step >> 16;
  buf[62] = step >> 8;
  buf[63] = step;
  keccak256(buf, 64, v);
}

static void printHex(const uint8_t *b, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (b[i] < 16) Serial.print('0');
    Serial.print(b[i], HEX);
  }
  Serial.println();
}

static const uint8_t EXPECT_EMPTY[32] = {0xc5, 0xd2, 0x46, 0x01, 0x86, 0xf7, 0x23, 0x3c, 0x92, 0x7e, 0x7d,
                                         0xb2, 0xdc, 0xc7, 0x03, 0xc0, 0xe5, 0x00, 0xb6, 0x53, 0xca, 0x82,
                                         0x27, 0x3b, 0x7b, 0xfa, 0xd8, 0x04, 0x5d, 0x85, 0xa4, 0x70};

// Runs `chains` chains of `perChain` steps, feeding the watchdog. Returns elapsed milliseconds.
static uint32_t runChains(int chains, int perChain) {
  uint8_t v[32];
  memset(v, 0x42, sizeof(v));
  uint32_t t0 = millis();
  for (int c = 0; c < chains; c++) {
    for (int s = 0; s < perChain; s++) chainStep(v, 7, c, s);
    yield();
  }
  return millis() - t0;
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_OFF);
  delay(1500);
  Serial.println();
  Serial.println("=== MOHAR BENCH ===");
  Serial.printf("RESULT chip_id=%08x cpu_mhz=%u sdk=%s\n", ESP.getChipId(), ESP.getCpuFreqMHz(), ESP.getSdkVersion());
  Serial.printf("RESULT flash_real=%u flash_ide=%u flash_id=%08x\n", ESP.getFlashChipRealSize(), ESP.getFlashChipSize(),
                ESP.getFlashChipId());
  Serial.printf("RESULT heap_free=%u heap_max_block=%u\n", ESP.getFreeHeap(), ESP.getMaxFreeBlockSize());

  // Self-test first: a wrong hash would make every later number meaningless.
  uint8_t out[32];
  keccak256(nullptr, 0, out);
  bool ok = memcmp(out, EXPECT_EMPTY, 32) == 0;
  Serial.print("keccak256('') = ");
  printHex(out, 32);
  Serial.printf("RESULT keccak_selftest=%s\n", ok ? "PASS" : "FAIL");
  if (!ok) return;

  // Raw speed, 1,000 hashes.
  uint32_t ms = runChains(10, 100);
  Serial.printf("RESULT hashes=1000 ms=%u per_second=%u\n", ms, ms ? 1000000u / ms : 0u);

  // w=16: 67 chains. Average signing is about 7.5 steps a chain, worst case 15.
  uint32_t avg = runChains(67, 8);
  Serial.printf("RESULT sign_avg_estimate hashes=536 ms=%u\n", avg);
  uint32_t worst = runChains(67, 15);
  Serial.printf("RESULT sign_worst hashes=1005 ms=%u\n", worst);

  // Key generation scales with worst-case signing: 1,005 hashes per leaf, plus the tree.
  Serial.printf("RESULT keygen_estimate leaves=256 seconds=%u\n", (worst * 256u) / 1000u);
  Serial.printf("RESULT keygen_estimate leaves=1024 seconds=%u\n", (worst * 1024u) / 1000u);

  // Can we hold a whole signature in RAM with room left for TLS?
  uint8_t *sig = (uint8_t *)malloc(2400);
  Serial.printf("RESULT sig_alloc_2400=%s heap_after=%u\n", sig ? "PASS" : "FAIL", ESP.getFreeHeap());
  free(sig);

  Serial.println("=== DONE ===");
}

void loop() { delay(1000); }
