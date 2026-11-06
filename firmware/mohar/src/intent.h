#pragma once
#include "frametx.h"
// One-time-key safety. A leaf must never sign two different messages, even across reboots and power cuts.
// The rule: save the intent (nonce, final report, digest, next leaf) to flash BEFORE the signature exists.
enum IntentResult {
  INTENT_OK = 0,
  INTENT_LEAF_USED,           // same leaf, different content
  INTENT_CHAIN_BEHIND,        // the chain's nonce is lower than ours: reset chain or lying RPC. Never sign
  INTENT_KEYS_EXHAUSTED,      // leaf 255 is used
  INTENT_NO_KEY,
  INTENT_BAD_NONCE,
  INTENT_GUARD_FAILED,
  INTENT_FS_ERROR,
};
const char *intent_name(IntentResult r);

struct IntentInfo {
  bool resent;      // an identical transaction rebuilt from a saved intent
  bool jumped;      // the chain was ahead of our counter, so we moved forward
  bool clearedDone; // an earlier intent was found mined and cleared
  uint32_t steps;
  uint32_t leaf;
};

// Builds the signed transaction for `req` at the chain's current nonce (req.nonce). Fills raw (0x06 || rlp).
IntentResult intent_sign(const ReportParams &req, uint8_t *raw, size_t cap, size_t *rawLen, ReportParams *used, IntentInfo *info);

void intent_state(uint32_t *nextLeaf, bool *hasIntent, uint64_t *intentNonce);
void intent_set_next_leaf(uint32_t v);  // tests only
void intent_reset();                    // tests only; also happens automatically when the key changes
#ifdef MOHAR_DEV
void intent_crash_at(const char *point);  // "after_intent" or "after_sign"
#endif
