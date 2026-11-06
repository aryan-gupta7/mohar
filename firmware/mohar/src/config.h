#pragma once
#include <stdint.h>
// What the device is told at setup (provisioning). Stored in /config.bin. None of it is secret, and none of it
// can widen what the key may sign: the account contract only accepts reports to its one ledger.
struct DeviceConfig {
  uint32_t magic;
  uint8_t sender[20];     // the device's own account
  uint8_t ledger[20];
  uint8_t paymaster[20];
  uint8_t transport;      // 0 = USB bridge (laptop forwards bytes), 1 = HTTPS over Wi-Fi
  char host[48];          // HTTPS host, e.g. altmempoolgateway.forshtat.com
  uint16_t port;
  uint16_t checkpointS;   // seconds between checkpoints
  uint32_t sanctionedW;   // the connection's sanctioned load, for the decision model
  uint64_t maxPrio, maxFee;
};
bool config_load(DeviceConfig *c);
bool config_save(const DeviceConfig &c);
