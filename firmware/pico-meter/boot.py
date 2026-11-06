# Mohar: this board never needs to act as a keyboard or mouse.
# Turning USB HID off means no program on it can type into the computer.
# Takes effect after the next power cycle or reset.
import usb_hid

usb_hid.disable()
