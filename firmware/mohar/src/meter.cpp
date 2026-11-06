#include "meter.h"
#include <Arduino.h>
#include <string.h>

// State shared with the interrupt. Everything the ISR touches is volatile and small.
static volatile uint32_t vValid = 0, vGlitch = 0, vStuck = 0;
static volatile uint32_t fallAt = 0;          // micros() at the last falling edge
static volatile bool low = false;
static volatile bool stuckFlagged = false;    // this low period was already counted as stuck
static volatile uint32_t lastValidFall = 0;   // micros() of the last valid pulse's falling edge
static volatile uint32_t minIntervalUs = 0xFFFFFFFFUL;
static volatile uint32_t maxGapUs = 0;
static volatile bool haveLastValid = false;
static uint64_t base = 0;
static uint32_t windowStartMs = 0, windowStartUs = 0;
static uint32_t snapValid = 0, snapGlitch = 0, snapStuck = 0;

static void IRAM_ATTR onEdge() {
  uint32_t now = micros();
  bool level = digitalRead(METER_PIN);
  if (!level) {  // falling edge: a pulse starts
    fallAt = now;
    low = true;
    stuckFlagged = false;
    return;
  }
  if (!low) return;  // rising edge with no matching fall
  low = false;
  if (stuckFlagged) return;  // already counted as stuck; its release isn't a pulse
  uint32_t width = now - fallAt;
  if (width < METER_MIN_PULSE_US) { vGlitch++; return; }
  if (width > METER_MAX_PULSE_US) { vStuck++; return; }
  vValid++;
  if (haveLastValid) {
    uint32_t gap = fallAt - lastValidFall;
    if (gap < minIntervalUs) minIntervalUs = gap;
    if (gap > maxGapUs) maxGapUs = gap;
  }
  lastValidFall = fallAt;
  haveLastValid = true;
}

void meter_begin() {
  pinMode(METER_PIN, INPUT_PULLUP);
  low = digitalRead(METER_PIN) == LOW;
  fallAt = micros();
  stuckFlagged = false;
  windowStartMs = millis();
  windowStartUs = micros();
  attachInterrupt(digitalPinToInterrupt(METER_PIN), onEdge, CHANGE);
}

void meter_set_base(uint64_t b) { base = b; }

uint64_t meter_total() { return base + vValid; }

void meter_poll() {
  // A line held low longer than any pulse: count it once and keep it out of the energy count.
  noInterrupts();
  if (low && !stuckFlagged && (micros() - fallAt) > METER_MAX_PULSE_US) {
    stuckFlagged = true;
    vStuck++;
  }
  interrupts();
}

void meter_raw(uint32_t *valid, uint32_t *glitch, uint32_t *stuck, int *level) {
  noInterrupts();
  *valid = vValid; *glitch = vGlitch; *stuck = vStuck;
  interrupts();
  *level = digitalRead(METER_PIN);
}

void meter_take_window(MeterWindow *w) {
  noInterrupts();
  uint32_t nowUs = micros();
  uint32_t valid = vValid - snapValid;
  uint32_t glitch = vGlitch - snapGlitch;
  uint32_t stuck = vStuck - snapStuck;
  uint32_t minIv = minIntervalUs, maxGap = maxGapUs;
  uint32_t sinceLast = haveLastValid ? nowUs - lastValidFall : nowUs - windowStartUs;
  snapValid = vValid; snapGlitch = vGlitch; snapStuck = vStuck;
  minIntervalUs = 0xFFFFFFFFUL;
  maxGapUs = 0;
  interrupts();
  uint32_t nowMs = millis();
  w->windowMs = nowMs - windowStartMs;
  windowStartMs = nowMs;
  windowStartUs = nowUs;
  w->validPulses = valid;
  w->glitches = glitch > 65535 ? 65535 : glitch;
  w->stuckLow = stuck > 65535 ? 65535 : stuck;
  // watts = 3600 s/h * 1000 W/kW / (3200 pulses/kWh) per (pulse per second) = 1,125 W per pulse/s
  w->avgWatts = w->windowMs ? (uint32_t)((uint64_t)valid * 1125000ULL / w->windowMs) : 0;
  w->peakWatts = (minIv != 0xFFFFFFFFUL && minIv) ? (uint32_t)(1125000000ULL / minIv) : 0;
  uint32_t gapMs = (maxGap > sinceLast ? maxGap : sinceLast) / 1000;
  w->longestGapMs = gapMs;
  w->totalPulses = base + vValid;
}

static void be32(uint8_t *p, uint32_t v) { p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = v; }
static void be16(uint8_t *p, uint32_t v) { if (v > 65535) v = 65535; p[0] = v >> 8; p[1] = v; }

// Layout (big-endian):
//   0..3 validPulses   4..5 glitches   6..7 stuckLow   8..9 avgWatts   10..11 peakWatts
//   12..15 windowMs    16..19 longestGapMs   20..27 totalPulses   28..31 reserved (zero)
void meter_pack(const MeterWindow *w, uint8_t out[32]) {
  memset(out, 0, 32);
  be32(out + 0, w->validPulses);
  be16(out + 4, w->glitches);
  be16(out + 6, w->stuckLow);
  be16(out + 8, w->avgWatts);
  be16(out + 10, w->peakWatts);
  be32(out + 12, w->windowMs);
  be32(out + 16, w->longestGapMs);
  be32(out + 20, (uint32_t)(w->totalPulses >> 32));
  be32(out + 24, (uint32_t)w->totalPulses);
}
