#pragma once
#include <stdint.h>
// The meter's behaviour. Modes, most cautious first: SAFE_STOP, INSPECT, CREDIT_STOP, RUN.
// AI and local checks can only make the device more cautious. Nothing here switches any supply.
enum Mode { MODE_RUN = 0, MODE_INSPECT = 1, MODE_CREDIT_STOP = 2, MODE_SAFE_STOP = 3 };
enum Reason {
  R_OK = 0, R_LOCAL_PEAK = 1, R_LOCAL_GLITCH = 2, R_LOCAL_STUCK = 3, R_AI_INSPECT = 4,
  R_CREDIT = 10, R_HOLD = 11,
  R_NO_DECISION = 20, R_CHAIN_DOWN = 21, R_KEYS_EXHAUSTED = 22, R_STARTUP = 24,
};
void machine_begin();
void machine_tick();             // call from loop(): LEDs, pulse flashes, and the checkpoint timer
Mode machine_mode();
void machine_checkpoint_now();   // runs one checkpoint immediately
void machine_enable(bool on);
void machine_reload_config();
void machine_set_inject(int v);  // dev builds only: 0 none, 1 run, 2 inspect, 3 fail (as if 0G were unreachable)
