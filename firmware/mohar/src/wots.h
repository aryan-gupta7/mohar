#pragma once
#include <stdint.h>
// WOTS-like one-time signatures. Must match signer/src/wots.ts and contracts/yul/MoharAccount.yul byte for byte.
#define WOTS_N 32
#define WOTS_CHAINS 67
#define WOTS_HEIGHT 8
#define WOTS_LEAVES 256
#define WOTS_SIG_BYTES 2400
#define WOTS_PK_BYTES (WOTS_CHAINS * WOTS_N)

void wots_pubseed(const uint8_t seed[32], uint8_t out[16]);
void wots_leaf(const uint8_t seed[32], const uint8_t pubSeed[16], uint32_t leaf, uint8_t out[32], uint8_t *scratch /* WOTS_PK_BYTES */);
// Writes the first 67 signature values (2,144 bytes). The caller appends the 8 Merkle siblings.
void wots_sign_chains(const uint8_t seed[32], const uint8_t pubSeed[16], uint32_t leaf, const uint8_t digest[32], uint8_t *sig);
// Hash steps a verifier needs for this digest (each costs validation gas on-chain).
uint32_t wots_verify_steps(const uint8_t digest[32]);
