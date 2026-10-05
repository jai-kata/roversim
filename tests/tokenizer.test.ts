import { describe, expect, it } from 'vitest';
import { LangError } from '../src/lang/diagnostics';
import { tokenize } from '../src/lang/tokenizer';

const kinds = (src: string) => tokenize(src).map((t) => `${t.type}:${t.value}`);

function tokError(src: string): string {
  try {
    tokenize(src);
  } catch (e) {
    if (e instanceof LangError) return e.message;
    throw e;
  }
  throw new Error('expected a tokenizer error');
}

describe('tokenizer', () => {
  it('splits a simple statement', () => {
    expect(kinds('forward(3);')).toEqual(['ident:forward', 'punct:(', 'num:3', 'punct:)', 'punct:;', 'eof:end of code']);
  });

  it('recognizes keywords and identifiers', () => {
    expect(kinds('int steps = true;')).toEqual([
      'kw:int', 'ident:steps', 'punct:=', 'kw:true', 'punct:;', 'eof:end of code',
    ]);
  });

  it('prefers the longest operator', () => {
    expect(kinds('a<=b==c++ += --d && e || !f != g')).toEqual([
      'ident:a', 'punct:<=', 'ident:b', 'punct:==', 'ident:c', 'punct:++', 'punct:+=', 'punct:--', 'ident:d',
      'punct:&&', 'ident:e', 'punct:||', 'punct:!', 'ident:f', 'punct:!=', 'ident:g', 'eof:end of code',
    ]);
  });

  it('skips both kinds of comments and counts lines through them', () => {
    const toks = tokenize('// hi\n/* a\nb */ x');
    expect(toks[0]).toMatchObject({ type: 'ident', value: 'x', line: 3 });
  });

  it('tracks line numbers and offsets', () => {
    const toks = tokenize('int a;\n  forward(1);');
    const fwd = toks.find((t) => t.value === 'forward')!;
    expect(fwd.line).toBe(2);
    expect(fwd.from).toBe(9);
    expect(fwd.to).toBe(16);
  });

  it('accepts and drops the two allowed includes', () => {
    expect(kinds('#include "Rover.h"\n#include <Arduino.h> // ok\nint x;')).toEqual([
      'kw:int', 'ident:x', 'punct:;', 'eof:end of code',
    ]);
  });

  it('decodes string escapes', () => {
    const t = tokenize('"a\\"b\\n"')[0];
    expect(t).toMatchObject({ type: 'str', value: 'a"b\n' });
  });

  it('parses integer literals', () => {
    expect(tokenize('40000')[0].num).toBe(40000);
  });

  describe('friendly errors', () => {
    it.each([
      ['float x = 1;', "Line 1: Decimal numbers (float) aren't supported in RoverSim yet. Use int."],
      ['double x;', "Line 1: Decimal numbers (double) aren't supported in RoverSim yet. Use int."],
      ['char c;', `Line 1: char isn't supported in RoverSim yet. For text, put it in quotes inside Serial.print("...").`],
      ['class Robot {};', "Line 1: Classes aren't supported in RoverSim yet."],
      ['struct P {};', "Line 1: Structs aren't supported in RoverSim yet."],
      ['switch (x) {}', "Line 1: switch isn't supported in RoverSim yet. Use if / else if instead."],
      ['do { } while (x);', "Line 1: do-while loops aren't supported in RoverSim yet. Use a while loop instead."],
      ['break;', "Line 1: break isn't supported in RoverSim yet. Put the stop condition in your while ( ) instead."],
      ['continue;', "Line 1: continue isn't supported in RoverSim yet. Use an if instead."],
      ['int a[3];', "Line 1: Arrays (like int a[5]) aren't supported in RoverSim yet."],
      ['x = 3.5;', "Line 1: Decimal numbers like 3.5 aren't supported in RoverSim yet. Use whole numbers."],
      ['#define SPEED 3', "Line 1: #define isn't supported in RoverSim yet. Use a variable instead, like int speed = 3;"],
      ['#include <Servo.h>', 'Line 1: RoverSim only knows #include "Rover.h" and #include <Arduino.h>.'],
      ['#include "rover.h"', "Line 1: C++ cares about capital letters: 'rover.h' should be 'Rover.h'."],
      ["x = 'a';", `Line 1: Single quotes ' ' are for single letters (char), which RoverSim doesn't support yet. For text, use double quotes inside Serial.print("...").`],
      ['Serial.print(“hi”);', 'Line 1 uses curly quotes. Retype them as straight quotes ".'],
      ['x = 1 @ 2;', "Line 1 has a character RoverSim doesn't understand: '@'."],
      ['if (a & b)', 'Line 1: A single & isn\'t supported in RoverSim. Did you mean && (and)?'],
      ['if (a | b)', "Line 1: A single | isn't supported in RoverSim. Did you mean || (or)?"],
      ['x = a ? 1 : 2;', "Line 1: The ? : shortcut isn't supported in RoverSim yet. Use if / else instead."],
      ['x = 2 ^ 3;', `Line 1: ^ isn't supported in RoverSim. (In C++ it doesn't mean "to the power of".)`],
      ['p->x', "Line 1: Pointers aren't supported in RoverSim yet."],
      ['x = 010;', "Line 1: Whole numbers can't start with 0 in C++ (010 means something else). Write 10."],
      ['x = 0x1F;', 'Line 1: RoverSim only understands plain whole numbers, like 42.'],
      ['int 3steps;', "Line 1: '3steps' isn't a number or a name. Names can't start with a digit."],
      ['/* never closed', 'The /* comment on line 1 is never closed with */.'],
      ['Serial.print("hi);', 'Line 1: The text starting with " is never closed with another ".'],
      ['Void setup() {}', "Line 1: C++ cares about capital letters: 'Void' should be 'void'."],
      ['\n\nInt x;', "Line 3: C++ cares about capital letters: 'Int' should be 'int'."],
      ['If (x) {}', "Line 1: C++ cares about capital letters: 'If' should be 'if'."],
      ['long d;', "Line 1: long isn't supported in RoverSim yet. Use int."],
    ])('%s', (src, message) => {
      expect(tokError(src)).toBe(message);
    });
  });
});
