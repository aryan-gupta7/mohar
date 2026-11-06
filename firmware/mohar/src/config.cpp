#include "config.h"
#include <LittleFS.h>
static const uint32_t MAGIC = 0x4d434647;  // "MCFG"
bool config_load(DeviceConfig *c) {
  File f = LittleFS.open("/config.bin", "r");
  if (!f) return false;
  bool ok = f.size() == sizeof(DeviceConfig) && f.read((uint8_t *)c, sizeof(*c)) == sizeof(*c) && c->magic == MAGIC;
  f.close();
  return ok;
}
bool config_save(const DeviceConfig &in) {
  DeviceConfig c = in;
  c.magic = MAGIC;
  File f = LittleFS.open("/config.tmp", "w");
  if (!f) return false;
  bool ok = f.write((const uint8_t *)&c, sizeof(c)) == sizeof(c);
  f.close();
  if (!ok) return false;
  LittleFS.remove("/config.bin");
  return LittleFS.rename("/config.tmp", "/config.bin");
}
