#include "net.h"
#include <ESP8266WiFi.h>
#include <WiFiClientSecureBearSSL.h>
#include "secrets.h"

bool net_wifi_up() { return WiFi.status() == WL_CONNECTED; }

bool net_wifi_connect(uint32_t timeoutMs) {
  if (net_wifi_up()) return true;
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(MOHAR_WIFI_SSID, MOHAR_WIFI_PASS);
  uint32_t t0 = millis();
  while (!net_wifi_up() && millis() - t0 < timeoutMs) { delay(100); yield(); }
  return net_wifi_up();
}

int net_post_json(const char *host, uint16_t port, const char *path, const char *body, size_t bodyLen, char *resp, size_t respCap, NetStats *st, uint32_t timeoutMs) {
  memset(st, 0, sizeof(*st));
  st->heapBefore = st->heapLowest = ESP.getFreeHeap();
  if (!net_wifi_up()) return -1;
  uint32_t t0 = millis();
  BearSSL::WiFiClientSecure client;
  client.setInsecure();                 // first version: no certificate check (see dev-plan DEV-6)
  client.setBufferSizes(16709, 512);    // a full TLS record in, small buffer out
  client.setTimeout(timeoutMs);
  if (!client.connect(host, port)) return -1;
  st->connectMs = millis() - t0;
  if (ESP.getFreeHeap() < st->heapLowest) st->heapLowest = ESP.getFreeHeap();
  client.printf("POST %s HTTP/1.1\r\nHost: %s\r\nContent-Type: application/json\r\nContent-Length: %u\r\nConnection: close\r\n\r\n", path, host, (unsigned)bodyLen);
  client.write((const uint8_t *)body, bodyLen);
  // Status line
  String line = client.readStringUntil('\n');
  int status = -3;
  if (line.startsWith("HTTP/1.")) status = line.substring(9, 12).toInt();
  // Headers
  int contentLen = -1;
  bool chunked = false;
  while (client.connected() || client.available()) {
    line = client.readStringUntil('\n');
    if (line == "\r" || line.length() == 0) break;
    line.toLowerCase();
    if (line.startsWith("content-length:")) contentLen = line.substring(15).toInt();
    if (line.startsWith("transfer-encoding:") && line.indexOf("chunked") >= 0) chunked = true;
  }
  size_t n = 0;
  uint32_t last = millis();
  while ((client.connected() || client.available()) && millis() - t0 < timeoutMs) {
    if (client.available()) {
      int c = client.read();
      if (c >= 0 && n + 1 < respCap) resp[n++] = (char)c;
      last = millis();
    } else {
      delay(1);
      if (millis() - last > 2000) break;
    }
    if (ESP.getFreeHeap() < st->heapLowest) st->heapLowest = ESP.getFreeHeap();
    if (contentLen >= 0 && !chunked && (int)n >= contentLen) break;
  }
  resp[n] = 0;
  st->respLen = n;
  st->totalMs = millis() - t0;
  if (ESP.getFreeHeap() < st->heapLowest) st->heapLowest = ESP.getFreeHeap();
  if (millis() - t0 >= timeoutMs && n == 0) return -2;
  return status;
}
