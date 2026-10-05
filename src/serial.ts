// The Serial Monitor panel: program output plus RoverSim's own messages.

const MAX_CHARS = 20000; // keep long-running prints from growing the page forever

export type NoteKind = 'error' | 'warning' | 'result';

export class SerialMonitor {
  private out: HTMLElement | null = null; // current block of program output
  private empty = true;

  constructor(private el: HTMLElement) {
    this.clear();
  }

  clear(): void {
    this.el.replaceChildren();
    const p = document.createElement('div');
    p.className = 'serial-placeholder';
    p.textContent = 'Nothing printed yet.';
    this.el.append(p);
    this.out = null;
    this.empty = true;
  }

  // Text from Serial.print / Serial.println.
  write(text: string): void {
    this.prepare();
    if (!this.out) {
      this.out = document.createElement('div');
      this.out.className = 'serial-output';
      this.el.append(this.out);
    }
    let all = (this.out.textContent ?? '') + text;
    if (all.length > MAX_CHARS) all = all.slice(all.length - MAX_CHARS);
    this.out.textContent = all;
    this.scroll();
  }

  // A message from RoverSim: an error, warning, or result line.
  note(message: string, kind: NoteKind): void {
    this.prepare();
    // Start the message on its own line even after Serial.print without ln.
    this.out = null;
    const p = document.createElement('div');
    p.className = `serial-${kind}`;
    p.textContent = message;
    this.el.append(p);
    this.scroll();
  }

  private prepare(): void {
    if (this.empty) {
      this.el.replaceChildren();
      this.empty = false;
    }
  }

  private scroll(): void {
    this.el.scrollTop = this.el.scrollHeight;
  }
}
