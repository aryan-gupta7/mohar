#include "net.h"
#include <ESP8266WiFi.h>
#include <WiFiClientSecureBearSSL.h>
#include "secrets.h"
#include "frametx.h"
#include <WiFiClient.h>

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

int net_post_json(const char *host, uint16_t port, const char *path, const char *body, size_t bodyLen, char *resp, size_t respCap, NetStats *st, uint32_t timeoutMs, const char *bearer) {
  memset(st, 0, sizeof(*st));
  st->heapBefore = st->heapLowest = ESP.getFreeHeap();
  // A device that has just powered up must join the network by itself (and rejoin after a drop).
  if (!net_wifi_up() && !net_wifi_connect(25000)) return -1;
  uint32_t t0 = millis();
  BearSSL::WiFiClientSecure client;
  client.setInsecure();                 // first version: no certificate check (see dev-plan DEV-6)
  client.setBufferSizes(16709, 512);    // a full TLS record in, small buffer out
  client.setTimeout(timeoutMs);
  // The TLS handshake (elliptic-curve maths) can compute for about 3 s without yielding, close to the 3.2 s software
  // watchdog. The 8 s hardware watchdog stays on.
  ESP.wdtDisable();
  bool connected = client.connect(host, port);
  ESP.wdtEnable(8000);
  if (!connected) return -1;
  st->connectMs = millis() - t0;
  if (ESP.getFreeHeap() < st->heapLowest) st->heapLowest = ESP.getFreeHeap();
  client.printf("POST %s HTTP/1.1\r\nHost: %s\r\nContent-Type: application/json\r\nContent-Length: %u\r\nConnection: close\r\n", path, host, (unsigned)bodyLen);
  if (bearer) client.printf("Authorization: Bearer %s\r\n", bearer);
  client.print("\r\n");
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

// A Print that only counts, to learn the body length before sending it.
class CountPrint : public Print {
 public:
  size_t n = 0;
  size_t write(uint8_t) override { n++; return 1; }
  size_t write(const uint8_t *, size_t s) override { n += s; return s; }
};
// A Print that writes into a connection in 512-byte chunks. Writing byte by byte would make each byte its own
// TLS record, which took 88 s for a 6.4 KB body.
class ClientPrint : public Print {
 public:
  explicit ClientPrint(WiFiClient &c) : c_(c) {}
  size_t write(uint8_t b) override {
    buf_[n_++] = b;
    if (n_ == sizeof(buf_)) flush();
    return 1;
  }
  size_t write(const uint8_t *d, size_t s) override {
    for (size_t i = 0; i < s; i++) write(d[i]);
    return s;
  }
  void flush() override {
    if (n_) { c_.write(buf_, n_); n_ = 0; }
  }
 private:
  WiFiClient &c_;
  uint8_t buf_[512];
  size_t n_ = 0;
};

static const char PREFIX[] = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_sendFrameTransaction\",\"params\":[";
static const char SUFFIX[] = "]}";

static int readResponse(WiFiClient &client, uint32_t t0, uint32_t timeoutMs, char *resp, size_t respCap, NetStats *st) {
  String line = client.readStringUntil('\n');
  int status = -3;
  if (line.startsWith("HTTP/1.")) status = line.substring(9, 12).toInt();
  int contentLen = -1;
  while (client.connected() || client.available()) {
    line = client.readStringUntil('\n');
    if (line == "\r" || line.length() == 0) break;
    line.toLowerCase();
    if (line.startsWith("content-length:")) contentLen = line.substring(15).toInt();
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
    if (contentLen >= 0 && (int)n >= contentLen) break;
  }
  resp[n] = 0;
  st->respLen = n;
  return status;
}

void net_print_submit_body(Print &out, const ReportParams &p, const uint8_t *sig, size_t sigLen) {
  out.print(PREFIX);
  frametx_json(p, sig, sigLen, out);
  out.print(SUFFIX);
}

int net_submit_frame_tx(const char *host, uint16_t port, bool tls, const char *path, const ReportParams &p, const uint8_t *sig, size_t sigLen, char *resp, size_t respCap, NetStats *st, uint32_t timeoutMs) {
  memset(st, 0, sizeof(*st));
  st->heapBefore = st->heapLowest = ESP.getFreeHeap();
  // A device that has just powered up must join the network by itself (and rejoin after a drop).
  if (!net_wifi_up() && !net_wifi_connect(25000)) return -1;
  CountPrint counter;
  net_print_submit_body(counter, p, sig, sigLen);
  uint32_t t0 = millis();
  WiFiClient plain;
  BearSSL::WiFiClientSecure secure;
  WiFiClient *client = &plain;
  if (tls) {
    secure.setInsecure();
    secure.setBufferSizes(16709, 512);
    client = &secure;
  }
  client->setTimeout(timeoutMs);
  ESP.wdtDisable();
  bool connected = client->connect(host, port);
  ESP.wdtEnable(8000);
  if (!connected) return -1;
  st->connectMs = millis() - t0;
  if (ESP.getFreeHeap() < st->heapLowest) st->heapLowest = ESP.getFreeHeap();
  client->printf("POST %s HTTP/1.1\r\nHost: %s\r\nContent-Type: application/json\r\nContent-Length: %u\r\nConnection: close\r\n\r\n", path, host, (unsigned)counter.n);
  ClientPrint out(*client);
  net_print_submit_body(out, p, sig, sigLen);
  out.flush();
  int status = readResponse(*client, t0, timeoutMs, resp, respCap, st);
  st->totalMs = millis() - t0;
  if (ESP.getFreeHeap() < st->heapLowest) st->heapLowest = ESP.getFreeHeap();
  return status;
}
