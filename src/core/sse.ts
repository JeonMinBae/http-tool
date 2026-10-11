export interface SseEvent {
  event: string;
  data: string;
  id?: string;
  receivedAt: number;
}

/** Incremental text/event-stream parser (WHATWG server-sent events). */
export class SseParser {
  private buffer = "";
  private data: string[] = [];
  private event = "";
  private id: string | undefined;

  constructor(private now: () => number = Date.now) {}

  feed(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const out: SseEvent[] = [];
    let nl: number;
    while ((nl = this.buffer.search(/\r\n|\r|\n/)) >= 0) {
      const line = this.buffer.slice(0, nl);
      const sepLen = this.buffer.startsWith("\r\n", nl) ? 2 : 1;
      // A lone trailing \r may be the first half of \r\n split across chunks.
      if (sepLen === 1 && this.buffer[nl] === "\r" && nl === this.buffer.length - 1) break;
      this.buffer = this.buffer.slice(nl + sepLen);
      const ev = this.line(line);
      if (ev) out.push(ev);
    }
    return out;
  }

  flush(): SseEvent[] {
    const out: SseEvent[] = [];
    if (this.buffer) {
      const ev = this.line(this.buffer);
      this.buffer = "";
      if (ev) out.push(ev);
    }
    const ev = this.dispatch();
    if (ev) out.push(ev);
    return out;
  }

  private line(line: string): SseEvent | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;
    const i = line.indexOf(":");
    const field = i < 0 ? line : line.slice(0, i);
    let value = i < 0 ? "" : line.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.data.push(value);
    else if (field === "event") this.event = value;
    else if (field === "id") this.id = value;
    return null;
  }

  private dispatch(): SseEvent | null {
    if (!this.data.length) {
      this.event = "";
      return null;
    }
    const ev: SseEvent = { event: this.event || "message", data: this.data.join("\n"), receivedAt: this.now() };
    if (this.id !== undefined) ev.id = this.id;
    this.data = [];
    this.event = "";
    return ev;
  }
}
