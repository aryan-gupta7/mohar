#pragma once
#include <stdint.h>
// Asks 0G (qwen3.8-flash, reasoning off) whether this meter window needs inspection. Only the exact words RUN or
// INSPECT count; anything else, an error, or a late answer is "no decision". Model text never reaches GPIO.
enum ZgAnswer { ZG_NONE = 0, ZG_RUN = 1, ZG_INSPECT = 2 };
struct ZgResult {
  ZgAnswer answer;
  char requestId[40];  // x_0g_trace.request_id, empty if none
  int httpStatus;
  uint32_t ms;
  char why[48];        // short reason when answer is ZG_NONE
};
bool zerog_available();  // a key is compiled in
ZgResult zerog_decide(const char *stateText, uint32_t timeoutMs);
