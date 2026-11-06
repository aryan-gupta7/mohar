// Web Serial for the Pico (write one character) and the ESP (read EV / METER lines). Desktop Chrome/Edge only.
export const serialSupported = () => typeof navigator !== "undefined" && "serial" in navigator;

export class LineReader {
  port: any; reader: any; stop = false; opened = false;
  constructor(private onLine: (l: string) => void, private onClose: (why: string) => void) {}
  async open(baud = 115200, asserted = true) {
    this.port = await (navigator as any).serial.requestPort();
    await this.port.open({ baudRate: baud });
    try { await this.port.setSignals({ dataTerminalReady: asserted, requestToSend: false }); } catch { /* optional */ }
    this.opened = true;
    this.loop();
  }
  private async loop() {
    const dec = new TextDecoder();
    let buf = "";
    try {
      while (this.port.readable && !this.stop) {
        this.reader = this.port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1); if (l) this.onLine(l); }
          }
        } finally { this.reader.releaseLock(); }
      }
      this.onClose("Port closed");
    } catch (e: any) { this.onClose(e?.message ?? "Port error"); }
  }
  async write(s: string) {
    const w = this.port.writable.getWriter();
    try { await w.write(new TextEncoder().encode(s)); } finally { w.releaseLock(); }
  }
  async close() { this.stop = true; try { await this.reader?.cancel(); } catch { /* */ } try { await this.port?.close(); } catch { /* */ } this.opened = false; }
}
