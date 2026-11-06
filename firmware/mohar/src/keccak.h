#pragma once
#include <stddef.h>
#include <stdint.h>
// Keccak-256 with Ethereum's original padding (0x01), not SHA-3's 0x06.
void keccak256(const uint8_t *in, size_t len, uint8_t out[32]);
