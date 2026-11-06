#pragma once
#include <stdint.h>
#include "wots.h"
// The device's key. The 32-byte seed lives in flash and RAM and is never printed or sent anywhere.
// Files: /seed.bin (32 bytes) and /tree.bin (511 nodes x 32 bytes = 16,352 bytes, leaves first, root last).
#define TREE_NODES 511
#define TREE_BYTES (TREE_NODES * 32)

namespace keystore {
bool mount();
// Loads the key, or generates one from the hardware random generator. Prints progress lines.
bool loadOrCreate(bool *generated, uint32_t *ms);
// Builds a key from a given seed and saves it. Replaces any existing key.
bool createFromSeed(const uint8_t seed[32], uint32_t *ms);
bool ready();
const uint8_t *root();
const uint8_t *pubSeed();
// Signs one digest with one leaf. Fills sig (2,400 bytes). Does NOT enforce one-time use: DEV-5 adds that.
bool sign(uint32_t leaf, const uint8_t digest[32], uint8_t *sig);
void wipe();
}
