#pragma once
#include <Arduino.h>
// Wi-Fi, TLS 1.2 and JSON-RPC over HTTPS. One TLS connection at a time, fixed buffers, every call has a timeout.
bool net_wifi_connect(uint32_t timeoutMs);
bool net_wifi_up();
// POSTs `body` (length bodyLen) as JSON to https://host/path. The response body is copied into resp (at most
// respCap-1 bytes, NUL-terminated). Returns the HTTP status, or a negative error: -1 connect, -2 timeout, -3 bad response.
struct NetStats {
  uint32_t connectMs;   // TCP + TLS handshake
  uint32_t totalMs;
  uint32_t heapBefore;
  uint32_t heapLowest;  // lowest free heap seen during the call
  size_t respLen;
};
int net_post_json(const char *host, uint16_t port, const char *path, const char *body, size_t bodyLen, char *resp, size_t respCap, NetStats *st, uint32_t timeoutMs);
