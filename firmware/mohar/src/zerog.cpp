#include "zerog.h"
#include <Arduino.h>
#include "net.h"
#include "rpc.h"
#include "secrets.h"

#ifndef MOHAR_ZEROG_KEY
#define MOHAR_ZEROG_KEY ""
#endif

// The owner's policy. ENS-4 (optional) would read it from the mohar.policy record instead.
static const char SYSTEM[] =
    "You supervise a prepaid electricity meter. Given its last-minute readings, answer with exactly one word, RUN or INSPECT. "
    "Do not explain. Owner's policy: answer INSPECT if any of these is true: "
    "(1) the average load is above the sanctioned load; "
    "(2) there were 3 or more pulse-line glitches, or any stuck-low event; "
    "(3) the previous window averaged load but this window has none, though the line is healthy; "
    "(4) the pulse spacing does not look like a real electrical load, for example the peak is many times the average. "
    "Otherwise answer RUN. Low credit is not a reason to inspect.";

#ifdef MOHAR_DEV
static bool blackhole = false;
void zerog_set_blackhole(bool on) { blackhole = on; }
#endif

bool zerog_available() { return strlen(MOHAR_ZEROG_KEY) > 10; }

ZgResult zerog_decide(const char *stateText, uint32_t timeoutMs) {
  ZgResult r;
  memset(&r, 0, sizeof(r));
  if (!zerog_available()) { strcpy(r.why, "no_key"); return r; }
  const char *host = "router-api.0g.ai";
#ifdef MOHAR_DEV
  if (blackhole) host = "10.255.255.1";  // not routable: the connection really times out
#endif
  char *body = (char *)malloc(1300);
  char *resp = (char *)malloc(1500);
  if (!body || !resp) { free(body); free(resp); strcpy(r.why, "out_of_memory"); return r; }
  int n = snprintf(body, 1300,
                   "{\"model\":\"qwen3.8-flash\",\"temperature\":0,\"max_tokens\":16,\"enable_thinking\":false,"
                   "\"messages\":[{\"role\":\"system\",\"content\":\"%s\"},{\"role\":\"user\",\"content\":\"%s\"}]}",
                   SYSTEM, stateText);
  if (n <= 0 || n >= 1300) { free(body); free(resp); strcpy(r.why, "request_too_long"); return r; }
  NetStats st;
  uint32_t t0 = millis();
  r.httpStatus = net_post_json(host, 443, "/v1/chat/completions", body, n, resp, 1500, &st, timeoutMs, MOHAR_ZEROG_KEY);
  free(body);
  r.ms = millis() - t0;
  if (r.httpStatus != 200) { snprintf(r.why, sizeof(r.why), "http_%d", r.httpStatus); free(resp); return r; }
  json_string(resp, "request_id", r.requestId, sizeof(r.requestId));
  char content[24];
  bool haveContent = json_string(resp, "content", content, sizeof(content));
  free(resp);
  if (!haveContent) { strcpy(r.why, "no_content"); return r; }
  // Strict allowlist: trim spaces and full stops only.
  char w[24];
  size_t k = 0;
  for (size_t i = 0; content[i] && k + 1 < sizeof(w); i++)
    if (content[i] != ' ' && content[i] != '.' && content[i] != '\n') w[k++] = content[i];
  w[k] = 0;
  if (strcmp(w, "RUN") == 0) r.answer = ZG_RUN;
  else if (strcmp(w, "INSPECT") == 0) r.answer = ZG_INSPECT;
  else snprintf(r.why, sizeof(r.why), "not_a_decision");
  if (r.answer != ZG_NONE && !r.requestId[0]) { r.answer = ZG_NONE; strcpy(r.why, "no_request_id"); }
  return r;
}
