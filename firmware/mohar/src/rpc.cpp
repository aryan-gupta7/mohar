#include "rpc.h"
#include "net.h"

static uint32_t nextId = 1;
static char *bridgeBuf = nullptr;
static size_t bridgeCap = 0;
static uint32_t bridgeWant = 0;
static bool bridgeGot = false;

bool rpc_bridge_line(const char *line) {
  if (strncmp(line, "BRIDGE-RES ", 11) != 0) return false;
  uint32_t id = strtoul(line + 11, nullptr, 10);
  const char *sp = strchr(line + 11, ' ');
  if (id == bridgeWant && bridgeBuf && sp) {
    strncpy(bridgeBuf, sp + 1, bridgeCap - 1);
    bridgeBuf[bridgeCap - 1] = 0;
    bridgeGot = true;
  }
  return true;
}

// Reads Serial until our response line arrives. Other lines are ignored here.
static bool bridgeWait(uint32_t timeoutMs) {
  char *line = (char *)malloc(1300);
  if (!line) return false;
  size_t n = 0;
  uint32_t t0 = millis();
  while (!bridgeGot && millis() - t0 < timeoutMs) {
    while (Serial.available()) {
      char ch = Serial.read();
      if (ch == '\r') continue;
      if (ch == '\n') { line[n] = 0; rpc_bridge_line(line); n = 0; if (bridgeGot) break; }
      else if (n < 1299) line[n++] = ch;
    }
    delay(2);
  }
  free(line);
  return bridgeGot;
}

static bool bridgeBegin(char *resp, size_t cap, uint32_t *id) {
  *id = nextId++;
  bridgeBuf = resp; bridgeCap = cap; bridgeWant = *id; bridgeGot = false;
  resp[0] = 0;
  Serial.printf("BRIDGE %u ", *id);
  return true;
}

bool rpc_call(const DeviceConfig &c, const char *body, char *resp, size_t cap, uint32_t timeoutMs) {
  if (c.transport == 0) {
    uint32_t id;
    bridgeBegin(resp, cap, &id);
    Serial.println(body);
    return bridgeWait(timeoutMs);
  }
  NetStats st;
  int status = net_post_json(c.host, c.port, "/rpc", body, strlen(body), resp, cap, &st, timeoutMs);
  return status == 200;
}

bool rpc_send_tx(const DeviceConfig &c, const ReportParams &p, const uint8_t *sig, char *resp, size_t cap, uint32_t timeoutMs) {
  if (c.transport == 0) {
    uint32_t id;
    bridgeBegin(resp, cap, &id);
    net_print_submit_body(Serial, p, sig, WOTS_SIG_BYTES);
    Serial.println();
    return bridgeWait(timeoutMs);
  }
  NetStats st;
  int status = net_submit_frame_tx(c.host, c.port, true, "/rpc", p, sig, WOTS_SIG_BYTES, resp, cap, &st, timeoutMs);
  return status == 200;
}

bool json_string(const char *json, const char *key, char *out, size_t cap) {
  char pat[40];
  snprintf(pat, sizeof(pat), "\"%s\":\"", key);
  const char *p = strstr(json, pat);
  if (!p) {
    snprintf(pat, sizeof(pat), "\"%s\": \"", key);
    p = strstr(json, pat);
    if (!p) return false;
  }
  p += strlen(pat);
  size_t n = 0;
  while (*p && *p != '"' && n + 1 < cap) out[n++] = *p++;
  out[n] = 0;
  return *p == '"';
}
