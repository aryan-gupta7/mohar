#pragma once
#include <Arduino.h>
#include <stdint.h>
// Builds Mohar's standard 4-frame report transaction. Layout, limits and encoding must match
// signer/src/mohar.ts and @forshtat/hegota-support byte for byte (checked by firmware/vectors/tx.json).
#define REPORT_MAX_ID 64
#define DEVICE_STEP_LIMIT 630
#define FRAMETX_MAX_RAW 4096

struct ReportParams {
  uint8_t sender[20];     // the device's own account
  uint8_t ledger[20];     // MachineLedger, the target of the SENDER frame
  uint8_t paymaster[20];  // QuotaPaymaster
  uint64_t nonce;         // the account's current nonce; the one-time key used is nonce - 1
  uint64_t maxPrio;       // max priority fee per gas, wei
  uint64_t maxFee;        // max fee per gas, wei
  uint64_t seq;           // report fields
  uint64_t total;
  uint8_t mode, reason, confidence, model;
  uint32_t salt;
  uint8_t sensors[32];
  uint8_t reqLen;
  uint8_t reqId[REPORT_MAX_ID];
};

// ABI-encoded report(...) calldata. Returns its length.
size_t frametx_calldata(const ReportParams &p, uint8_t *out, size_t cap);
// Encodes `0x06 || rlp(payload)`. With sig == nullptr the signature bytes are empty (the form that is hashed).
size_t frametx_encode(const ReportParams &p, const uint8_t *sig, size_t sigLen, uint8_t *out, size_t cap);
// keccak256 of the unsigned form: the digest the device signs.
bool frametx_digest(const ReportParams &p, uint8_t digest[32]);
// Raises p->salt until the digest needs at most DEVICE_STEP_LIMIT verifier steps. No key is used here.
bool frametx_guard(ReportParams *p, uint8_t digest[32], uint32_t *steps);
// The sidecar's JSON form (eth_sendFrameTransaction), streamed so it is never held whole in memory.
void frametx_json(const ReportParams &p, const uint8_t *sig, size_t sigLen, Print &out);
