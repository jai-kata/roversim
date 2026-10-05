import { errorAt } from './diagnostics';
import type { Token } from './tokenizer';

// Brace balance runs before the parser so that a missing } is reported as
// a missing } instead of whatever confusing thing the parser trips on next.
//
// Plain counting finds *that* something is unbalanced but often blames the
// wrong brace. When the code is unbalanced we use indentation as a hint: a
// { and the } that matched it should start lines with the same indentation.
// The first pair that doesn't is usually where the mistake is.
export function checkBraces(tokens: Token[], src: string): void {
  const lines = src.split('\n');
  const indent = (line: number) => (/^[ \t]*/.exec(lines[line - 1] ?? '')?.[0] ?? '').replace(/\t/g, '    ').length;

  const stack: Token[] = [];
  const pairs: [Token, Token][] = [];
  let firstStray: Token | null = null;

  for (const t of tokens) {
    if (t.type !== 'punct') continue;
    if (t.value === '{') stack.push(t);
    else if (t.value === '}') {
      const open = stack.pop();
      if (open) pairs.push([open, t]);
      else firstStray ??= t;
    }
  }

  if (!firstStray && stack.length === 0) return;

  const mismatch = pairs.find(([o, c]) => o.line !== c.line && indent(o.line) !== indent(c.line));

  if (firstStray) {
    const bad = mismatch ? mismatch[1] : firstStray;
    throw errorAt(`Line ${bad.line} has an extra } that doesn't match any {.`, bad);
  }

  const open = mismatch ? mismatch[0] : stack[stack.length - 1];
  throw errorAt(`The { on line ${open.line} is never closed with a }.`, open);
}
