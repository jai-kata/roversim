import { describe, expect, it } from 'vitest';
import { compile } from '../src/lang';
import { BUILTINS, SERIAL_METHODS } from '../src/lang/builtins';
import { REFERENCE } from '../src/reference';

const entries = REFERENCE.flatMap((s) => s.entries);
const listed = entries.map((e) => e.code).join('\n');

describe('Commands list', () => {
  it.each(Object.keys(BUILTINS))('lists %s', (name) => {
    expect(listed).toContain(`${name}(`);
  });

  it.each(Object.keys(SERIAL_METHODS))('lists Serial.%s', (name) => {
    expect(listed).toContain(`Serial.${name}(`);
  });

  it('lists every kind of statement', () => {
    for (const word of ['int ', 'bool ', 'const ', 'if (', 'else', 'while (', 'for (', 'return', 'void ', '//']) {
      expect(listed).toContain(word);
    }
  });

  it('every example compiles without warnings', () => {
    const top = entries.filter((e) => e.top).map((e) => e.code);
    const inSetup = entries.filter((e) => !e.top).map((e) => e.code);
    const src = `${top.join('\n')}\nvoid setup() {\n${inSetup.join('\n')}\n}\n`;
    const c = compile(src);
    expect(c.ok ? 'ok' : c.error.message).toBe('ok');
    expect(c.warnings).toEqual([]);
  });
});
