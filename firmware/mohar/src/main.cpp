// Mohar device firmware. DEV-4: key generation, storage and signing.
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include "console.h"
#include "keystore.h"
#include "meter.h"
#include "machine.h"

static void printHexLine(const uint8_t *b, size_t n) {
  for (size_t i = 0; i < n; i++) Serial.printf("%02x", b[i]);
}

void setup() {
  Serial.begin(115200);
  WiFi.persistent(false);
  WiFi.mode(WIFI_OFF);
  delay(1500);
  Serial.println();
#ifdef MOHAR_DEV
  Serial.println("MOHAR firmware dev=1 (test commands enabled: not for deployment)");
#else
  Serial.println("MOHAR firmware dev=0");
#endif
  // Why did we start? A watchdog or exception reset after a long run is exactly what a soak needs to explain.
  Serial.printf("RESET reason=\"%s\" info=\"%s\"\n", ESP.getResetReason().c_str(), ESP.getResetInfo().c_str());
  if (!keystore::mount()) { Serial.println("ERROR fs_mount_failed"); return; }
  bool generated = false;
  uint32_t ms = 0;
  if (!keystore::loadOrCreate(&generated, &ms)) { Serial.println("ERROR key_unavailable"); return; }
  Serial.print("KEY READY root=0x"); printHexLine(keystore::root(), 32);
  Serial.print(" pubSeed=0x"); printHexLine(keystore::pubSeed(), 16);
  Serial.printf(" ms=%u source=%s\n", ms, generated ? "generated" : "loaded");
  meter_begin();
  machine_begin();
}

void loop() {
  machine_tick();
  meter_poll();
  console_poll();
  delay(1);
}
