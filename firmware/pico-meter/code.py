# Mohar meter simulator: Raspberry Pi Pico H running CircuitPython 10.
#
# Behaves like the pulse output of an electricity meter rated 3200 impulses
# per kWh, a common rating on Indian electronic meters. One pulse = 0.3125 Wh.
#
# Wiring (this program only uses GP0):
#   Pico GP0 (physical pin 1) -> NodeMCU D6 (GPIO12)
#   Pico GND (physical pin 3) -> NodeMCU GND
#
# GP0 works like a meter's open-collector (S0) output: pulled low for 30 ms
# per pulse and released (floating) between pulses. The ESP8266's pull-up
# holds the line high, so the Pico never drives the line high.
# The onboard LED lights for each pulse, like a meter's kWh LED.
#
# Send one character over the USB serial console:
#   i idle 60 W        n normal 900 W      h heavy 3000 W
#   s surge 12000 W    g normal load plus 2 ms spikes (interference or tampering)
#   x off, no pulses   a automatic demo cycle
#   r reset counters   ? print status now
#
# Output: one JSON object per line, prefixed with "METER ".

import sys
import time
import random
import board
import digitalio
import supervisor

IMP_PER_KWH = 3200
PULSE_S = 0.030
GLITCH_S = 0.002
STATUS_EVERY_NS = 2_000_000_000
JITTER = 0.03  # +-3 % on the interval, so the load looks real

LOADS = {
    "i": ("idle", 60),
    "n": ("normal", 900),
    "h": ("heavy", 3000),
    "s": ("surge", 12000),
    "g": ("glitch", 900),
    "x": ("off", 0),
}
# Automatic cycle: (load key, seconds)
AUTO = (("n", 30), ("h", 20), ("n", 15), ("g", 15), ("n", 15), ("s", 10), ("x", 10))

line = digitalio.DigitalInOut(board.GP0)
line.switch_to_input(pull=None)  # released: the ESP8266 pull-up holds it high
led = digitalio.DigitalInOut(board.LED)
led.switch_to_output(value=False)

key = "n"
pulses = 0
glitches = 0
auto_on = False
auto_step = 0
auto_until = 0


def interval_ns(watts):
    # seconds per pulse = 3600 s/h * 1000 W/kW / (watts * IMP_PER_KWH)
    base = 3_600_000.0 / (watts * IMP_PER_KWH)
    return int(base * (1.0 + random.uniform(-JITTER, JITTER)) * 1e9)


def pulse(seconds):
    line.switch_to_output(value=False)
    led.value = True
    time.sleep(seconds)
    line.switch_to_input(pull=None)
    led.value = False


def status(event):
    name, watts = LOADS[key]
    print(
        'METER {"event":"%s","mode":"%s","watts":%d,"pulses":%d,"glitches":%d,"wh":%.4f,"auto":%s}'
        % (event, name, watts, pulses, glitches, pulses * 1000.0 / IMP_PER_KWH, "true" if auto_on else "false")
    )


def set_load(new_key, now):
    global key, next_pulse, next_glitch
    key = new_key
    watts = LOADS[key][1]
    next_pulse = now + interval_ns(watts) if watts else 0
    next_glitch = now + random.randint(1000, 2500) * 1_000_000
    status("load")


now = time.monotonic_ns()
next_pulse = 0
next_glitch = 0
set_load(key, now)
next_status = now + STATUS_EVERY_NS

while True:
    now = time.monotonic_ns()

    if supervisor.runtime.serial_bytes_available:
        c = sys.stdin.read(1)
        if c in LOADS:
            auto_on = False
            set_load(c, now)
        elif c == "a":
            auto_on = True
            auto_step = 0
            auto_until = now + AUTO[0][1] * 1_000_000_000
            set_load(AUTO[0][0], now)
        elif c == "r":
            pulses = 0
            glitches = 0
            status("reset")
        elif c == "?":
            status("status")

    if auto_on and now >= auto_until:
        auto_step = (auto_step + 1) % len(AUTO)
        auto_until = now + AUTO[auto_step][1] * 1_000_000_000
        set_load(AUTO[auto_step][0], now)

    watts = LOADS[key][1]
    if watts and now >= next_pulse:
        pulse(PULSE_S)
        pulses += 1
        # Schedule from the planned time, so timing errors don't add up.
        next_pulse += interval_ns(watts)
        if next_pulse < now:
            next_pulse = now + interval_ns(watts)

    if key == "g" and now >= next_glitch:
        pulse(GLITCH_S)
        glitches += 1
        next_glitch = now + random.randint(1000, 2500) * 1_000_000

    if now >= next_status:
        status("tick")
        next_status = now + STATUS_EVERY_NS

    time.sleep(0.001)
