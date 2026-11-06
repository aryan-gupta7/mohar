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
int net_post_json(const char *host, uint16_t port, const char *path, const char *body, size_t bodyLen, char *resp, size_t respCap, NetStats *st, uint32_t timeoutMs, const char *bearer = nullptr);

// Sends {"jsonrpc":"2.0","id":1,"method":"eth_sendFrameTransaction","params":[<tx json>]} by streaming it, so the
// body is never held in memory. tls=false uses plain HTTP (for the local test chain on the LAN only).
// resp receives the response body. Returns the HTTP status or a negative error as net_post_json.
struct ReportParams;
int net_submit_frame_tx(const char *host, uint16_t port, bool tls, const char *path, const ReportParams &p, const uint8_t *sig, size_t sigLen, char *resp, size_t respCap, NetStats *st, uint32_t timeoutMs);

// The exact request body that net_submit_frame_tx streams, written to any Print (used by tests to check the bytes).
void net_print_submit_body(Print &out, const ReportParams &p, const uint8_t *sig, size_t sigLen);
