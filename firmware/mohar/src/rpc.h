#pragma once
#include <Arduino.h>
#include "config.h"
#include "frametx.h"
#include "wots.h"
// JSON-RPC to the chain through the configured transport: HTTPS over Wi-Fi, or the USB bridge (the board prints
// "BRIDGE <id> <json body>" and the laptop answers "BRIDGE-RES <id> <json response>"; the laptop forwards bytes only).
// Returns true and fills resp with the response body on success.
bool rpc_call(const DeviceConfig &c, const char *body, char *resp, size_t cap, uint32_t timeoutMs);
bool rpc_send_tx(const DeviceConfig &c, const ReportParams &p, const uint8_t *sig, char *resp, size_t cap, uint32_t timeoutMs);
// Copies the string value of "key" (e.g. "result") from a JSON text. Returns false if absent.
bool json_string(const char *json, const char *key, char *out, size_t cap);
// Feeds bridge responses arriving on Serial while the console is idle (lines starting BRIDGE-RES).
bool rpc_bridge_line(const char *line);
