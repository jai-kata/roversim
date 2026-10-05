import { capitalMessage, errorAt, type Span } from './diagnostics';

export type TokenType = 'num' | 'str' | 'ident' | 'kw' | 'punct' | 'eof';

export interface Token extends Span {
  type: TokenType;
  value: string; // source text for idents/keywords/punct, decoded text for strings
  num?: number;
}

export const KEYWORDS = new Set([
  'int', 'bool', 'boolean', 'void', 'const',
  'true', 'false',
  'if', 'else', 'while', 'for', 'return',
]);

// Real C++ words we deliberately don't support. Hitting one stops with a
// friendly message instead of a confusing parse error later.
const UNSUPPORTED_WORDS: Record<string, string> = {
  float: "Decimal numbers (float) aren't supported in RoverSim yet. Use int.",
  double: "Decimal numbers (double) aren't supported in RoverSim yet. Use int.",
  char: "char isn't supported in RoverSim yet. For text, put it in quotes inside Serial.print(\"...\").",
  String: "String isn't supported in RoverSim yet. For text, put it in quotes inside Serial.print(\"...\").",
  long: "long isn't supported in RoverSim yet. Use int.",
  short: "short isn't supported in RoverSim yet. Use int.",
  unsigned: "unsigned isn't supported in RoverSim yet. Use int.",
  signed: "signed isn't supported in RoverSim yet. Use int.",
  byte: "byte isn't supported in RoverSim yet. Use int.",
  word: "word isn't supported in RoverSim yet. Use int.",
  size_t: "size_t isn't supported in RoverSim yet. Use int.",
  auto: "auto isn't supported in RoverSim yet. Use int or bool.",
  class: "Classes aren't supported in RoverSim yet.",
  struct: "Structs aren't supported in RoverSim yet.",
  union: "Unions aren't supported in RoverSim yet.",
  enum: "enum isn't supported in RoverSim yet. Use int.",
  typedef: "typedef isn't supported in RoverSim yet.",
  template: "Templates aren't supported in RoverSim yet.",
  namespace: "Namespaces aren't supported in RoverSim yet.",
  using: "'using' isn't supported in RoverSim yet.",
  new: "'new' isn't supported in RoverSim yet.",
  delete: "'delete' isn't supported in RoverSim yet.",
  this: "'this' isn't supported in RoverSim yet.",
  nullptr: "Pointers aren't supported in RoverSim yet.",
  NULL: "Pointers aren't supported in RoverSim yet.",
  switch: "switch isn't supported in RoverSim yet. Use if / else if instead.",
  case: "switch and case aren't supported in RoverSim yet. Use if / else if instead.",
  default: "switch and default aren't supported in RoverSim yet. Use if / else if instead.",
  do: "do-while loops aren't supported in RoverSim yet. Use a while loop instead.",
  break: "break isn't supported in RoverSim yet. Put the stop condition in your while ( ) instead.",
  continue: "continue isn't supported in RoverSim yet. Use an if instead.",
  goto: "goto isn't supported in RoverSim.",
  static: "static isn't supported in RoverSim yet. Use a global variable (outside any function).",
  volatile: "volatile isn't supported in RoverSim yet.",
};

const PUNCTS = [
  '<<=', '>>=',
  '->', '::', '<<', '>>', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '==', '!=', '<=', '>=', '&&', '||', '&=', '|=', '^=',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '(', ')', '{', '}', ',', ';', '.',
  '&', '|', '^', '~', '?', ':', '[', ']',
];

function unsupportedPunct(p: string, line: number): string | null {
  switch (p) {
    case '[': case ']':
      return `Line ${line}: Arrays (like int a[5]) aren't supported in RoverSim yet.`;
    case '&': case '&=':
      return `Line ${line}: A single & isn't supported in RoverSim. Did you mean && (and)?`;
    case '|': case '|=':
      return `Line ${line}: A single | isn't supported in RoverSim. Did you mean || (or)?`;
    case '^': case '^=':
      return `Line ${line}: ^ isn't supported in RoverSim. (In C++ it doesn't mean "to the power of".)`;
    case '<<': case '<<=':
      return `Line ${line}: << isn't supported in RoverSim. To print, use Serial.println(x);`;
    case '>>': case '>>=':
      return `Line ${line}: >> isn't supported in RoverSim yet.`;
    case '->':
      return `Line ${line}: Pointers aren't supported in RoverSim yet.`;
    case '?':
      return `Line ${line}: The ? : shortcut isn't supported in RoverSim yet. Use if / else instead.`;
    case '~': case ':': case '::':
      return `Line ${line}: '${p}' isn't supported in RoverSim yet.`;
    default:
      return null;
  }
}

const MAX_LITERAL = 2147483647;

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const n = src.length;
  let i = 0;
  let line = 1;

  const span = (from: number, to: number, ln = line): Span => ({ line: ln, from, to });

  while (i < n) {
    const c = src[i];

    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ') {
      i++;
      continue;
    }

    // Comments
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const start = i;
      const startLine = line;
      const end = src.indexOf('*/', i + 2);
      if (end === -1) {
        throw errorAt(`The /* comment on line ${startLine} is never closed with */.`, span(start, start + 2, startLine));
      }
      for (let k = i; k < end; k++) if (src[k] === '\n') line++;
      i = end + 2;
      continue;
    }

    // Preprocessor lines: only the two includes are allowed.
    if (c === '#') {
      const start = i;
      let end = src.indexOf('\n', i);
      if (end === -1) end = n;
      let text = src.slice(i, end);
      const commentAt = text.indexOf('//');
      if (commentAt !== -1) text = text.slice(0, commentAt);
      text = text.trim();
      checkDirective(text, span(start, start + text.length));
      i = end;
      continue;
    }

    // Numbers
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      const start = i;
      const m = /^(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[A-Za-z0-9_]*/.exec(src.slice(i));
      const text = m ? m[0] : c;
      i += text.length;
      tokens.push(numberToken(text, span(start, i)));
      continue;
    }

    // Identifiers and keywords
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentPart(src[i])) i++;
      const word = src.slice(start, i);
      const sp = span(start, i);
      if (Object.prototype.hasOwnProperty.call(UNSUPPORTED_WORDS, word)) {
        throw errorAt(`Line ${line}: ${UNSUPPORTED_WORDS[word]}`, sp);
      }
      if (KEYWORDS.has(word)) {
        tokens.push({ type: 'kw', value: word, ...sp });
        continue;
      }
      const lower = word.toLowerCase();
      if (KEYWORDS.has(lower)) {
        throw errorAt(capitalMessage(line, word, lower), sp);
      }
      tokens.push({ type: 'ident', value: word, ...sp });
      continue;
    }

    // Strings
    if (c === '"') {
      const start = i;
      i++;
      let value = '';
      for (;;) {
        if (i >= n || src[i] === '\n') {
          throw errorAt(`Line ${line}: The text starting with " is never closed with another ".`, span(start, start + 1));
        }
        const ch = src[i];
        if (ch === '"') {
          i++;
          break;
        }
        if (ch === '\\') {
          const esc = src[i + 1] ?? '';
          value += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === '0' ? '' : esc;
          i += 2;
          continue;
        }
        value += ch;
        i++;
      }
      tokens.push({ type: 'str', value, ...span(start, i) });
      continue;
    }

    if (c === "'") {
      throw errorAt(
        `Line ${line}: Single quotes ' ' are for single letters (char), which RoverSim doesn't support yet. For text, use double quotes inside Serial.print("...").`,
        span(i, i + 1),
      );
    }
    if (c === '“' || c === '”' || c === '‘' || c === '’') {
      throw errorAt(`Line ${line} uses curly quotes. Retype them as straight quotes ".`, span(i, i + 1));
    }

    // Punctuation, longest match first
    const p = PUNCTS.find((cand) => src.startsWith(cand, i));
    if (p) {
      const sp = span(i, i + p.length);
      const bad = unsupportedPunct(p, line);
      if (bad) throw errorAt(bad, sp);
      tokens.push({ type: 'punct', value: p, ...sp });
      i += p.length;
      continue;
    }

    throw errorAt(`Line ${line} has a character RoverSim doesn't understand: '${c}'.`, span(i, i + 1));
  }

  tokens.push({ type: 'eof', value: 'end of code', line, from: n, to: n });
  return tokens;
}

function checkDirective(text: string, sp: Span): void {
  const l = sp.line;
  const inc = /^#\s*include\s*(.*)$/.exec(text);
  if (inc) {
    const target = inc[1].trim();
    if (target === '"Rover.h"' || target === '<Arduino.h>') return;
    if (target.toLowerCase() === '"rover.h"') throw errorAt(capitalMessage(l, target.slice(1, -1), 'Rover.h'), sp);
    if (target.toLowerCase() === '<arduino.h>') throw errorAt(capitalMessage(l, target.slice(1, -1), 'Arduino.h'), sp);
    if (target === '<Rover.h>') {
      throw errorAt(`Line ${l}: Write #include "Rover.h" with quotes, because Rover.h sits next to your sketch.`, sp);
    }
    throw errorAt(`Line ${l}: RoverSim only knows #include "Rover.h" and #include <Arduino.h>.`, sp);
  }
  if (/^#\s*define\b/.test(text)) {
    throw errorAt(`Line ${l}: #define isn't supported in RoverSim yet. Use a variable instead, like int speed = 3;`, sp);
  }
  throw errorAt(`Line ${l}: RoverSim only understands # lines that say #include.`, sp);
}

function numberToken(text: string, sp: Span): Token {
  const l = sp.line;
  if (/^\d+$/.test(text)) {
    if (text.length > 1 && text[0] === '0') {
      throw errorAt(`Line ${l}: Whole numbers can't start with 0 in C++ (${text} means something else). Write ${Number(text)}.`, sp);
    }
    const num = Number(text);
    if (num > MAX_LITERAL) throw errorAt(`Line ${l}: ${text} is too big for RoverSim.`, sp);
    return { type: 'num', value: text, num, ...sp };
  }
  if (/^0[xXbB]/.test(text) || /^\d+[uUlL]+$/.test(text)) {
    throw errorAt(`Line ${l}: RoverSim only understands plain whole numbers, like 42.`, sp);
  }
  if (/^[\d.]+(?:[eE][+-]?\d+)?[fF]?$/.test(text)) {
    throw errorAt(`Line ${l}: Decimal numbers like ${text} aren't supported in RoverSim yet. Use whole numbers.`, sp);
  }
  throw errorAt(`Line ${l}: '${text}' isn't a number or a name. Names can't start with a digit.`, sp);
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}
function isIdentStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}
function isIdentPart(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}
