#pragma once
#include <stdint.h>
// Counts a meter's open-collector pulse output on D6 (GPIO12). 3,200 pulses per kWh: 1 pulse = 0.3125 Wh.
//   width < 15 ms      glitch (not energy)
//   15 ms .. 200 ms    valid pulse (energy)
//   > 200 ms low       stuck-low event (not energy)
#define METER_PIN 12
#define METER_PULSES_PER_KWH 3200
#define METER_MIN_PULSE_US 15000UL
#define METER_MAX_PULSE_US 200000UL

struct MeterWindow {
  uint32_t validPulses;
  uint16_t glitches;
  uint16_t stuckLow;
  uint32_t windowMs;
  uint32_t avgWatts;      // from pulses in the window
  uint32_t peakWatts;     // fastest interval between two valid pulses
  uint32_t longestGapMs;  // longest silence between valid pulses, including the window edges
  uint64_t totalPulses;   // cumulative since boot, plus the base set by meter_set_base
};

void meter_begin();
void meter_set_base(uint64_t basePulses);  // continue from the ledger's lastTotal after a reboot
uint64_t meter_total();                    // cumulative valid pulses
// Closes the current window, fills `w`, and starts the next one. Call from the main loop only.
void meter_take_window(MeterWindow *w);
// Call often from the main loop: detects a line held low (the interrupt can't see a pulse that never ends).
void meter_poll();
void meter_raw(uint32_t *valid, uint32_t *glitch, uint32_t *stuck, int *level);
// Packs a window into the 32-byte `sensors` word of a report. Layout in mechanism.md.
void meter_pack(const MeterWindow *w, uint8_t out[32]);
