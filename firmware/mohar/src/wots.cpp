#include "wots.h"
#include <Arduino.h>
#include <string.h>
#include "keccak.h"

static inline void put32(uint8_t *p, uint32_t v) {
  p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = v;
}

void wots_pubseed(const uint8_t seed[32], uint8_t out[16]) {
  uint8_t in[64], h[32];
  memcpy(in, seed, 32);
  memset(in + 32, 0xFF, 32);
  keccak256(in, 64, h);
  memcpy(out, h, 16);
}

// secret(leaf, chain) = keccak256(seed | leaf:u32 | chain:u32 | 24 zero bytes)
static void secret(const uint8_t seed[32], uint32_t leaf, uint32_t chain, uint8_t out[32]) {
  uint8_t in[64];
  memcpy(in, seed, 32);
  put32(in + 32, leaf);
  put32(in + 36, chain);
  memset(in + 40, 0, 24);
  keccak256(in, 64, out);
}

// One step: keccak256(value | pubSeed(16) | leaf(4) | chain(4) | 00000000 | step(4))
static void step(uint8_t v[32], const uint8_t pubSeed[16], uint32_t leaf, uint32_t chain, uint32_t s) {
  uint8_t buf[64];
  memcpy(buf, v, 32);
  memcpy(buf + 32, pubSeed, 16);
  put32(buf + 48, leaf);
  put32(buf + 52, chain);
  put32(buf + 56, 0);
  put32(buf + 60, s);
  keccak256(buf, 64, v);
}

void wots_leaf(const uint8_t seed[32], const uint8_t pubSeed[16], uint32_t leaf, uint8_t out[32], uint8_t *scratch) {
  for (uint32_t c = 0; c < WOTS_CHAINS; c++) {
    uint8_t *v = scratch + c * 32;
    secret(seed, leaf, c, v);
    for (uint32_t s = 0; s < 15; s++) step(v, pubSeed, leaf, c, s);
    yield();
  }
  keccak256(scratch, WOTS_PK_BYTES, out);
}

static void digits(const uint8_t digest[32], uint8_t d[WOTS_CHAINS]) {
  uint32_t csum = 0;
  for (int i = 0; i < 32; i++) {
    d[2 * i] = digest[i] >> 4;
    d[2 * i + 1] = digest[i] & 15;
    csum += 15 - d[2 * i] + 15 - d[2 * i + 1];
  }
  d[64] = (csum >> 8) & 15;
  d[65] = (csum >> 4) & 15;
  d[66] = csum & 15;
}

uint32_t wots_verify_steps(const uint8_t digest[32]) {
  uint8_t d[WOTS_CHAINS];
  digits(digest, d);
  uint32_t n = 0;
  for (int i = 0; i < WOTS_CHAINS; i++) n += 15 - d[i];
  return n;
}

void wots_sign_chains(const uint8_t seed[32], const uint8_t pubSeed[16], uint32_t leaf, const uint8_t digest[32], uint8_t *sig) {
  uint8_t d[WOTS_CHAINS];
  digits(digest, d);
  for (uint32_t c = 0; c < WOTS_CHAINS; c++) {
    uint8_t *v = sig + c * 32;
    secret(seed, leaf, c, v);
    for (uint32_t s = 0; s < d[c]; s++) step(v, pubSeed, leaf, c, s);
    yield();
  }
}
