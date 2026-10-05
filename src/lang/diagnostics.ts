// Every message a student can see is built in the language modules and
// carried as a Diagnostic. `message` is the full sentence shown in the
// Serial Monitor; it already includes the line number where one applies.

export type Severity = 'error' | 'warning';

export interface Span {
  line: number;
  from: number; // character offset in the source, inclusive
  to: number; // character offset, exclusive
}

export interface Diagnostic {
  severity: Severity;
  message: string;
  line: number | null; // null when the problem isn't on one line (e.g. missing loop())
  from?: number;
  to?: number;
}

export class LangError extends Error {
  readonly diagnostic: Diagnostic;
  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

export function errorAt(message: string, span: Span | null): LangError {
  return new LangError(makeDiagnostic('error', message, span));
}

export function makeDiagnostic(severity: Severity, message: string, span: Span | null): Diagnostic {
  if (!span) return { severity, message, line: null };
  return { severity, message, line: span.line, from: span.from, to: span.to };
}

// Shown when something unexpected happens inside RoverSim itself, so the
// student never sees a JavaScript stack trace.
export const INTERNAL_ERROR_MESSAGE =
  'Something in this code confused RoverSim. Show an officer your code.';

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}

// Closest candidate within a small edit distance, or null.
export function suggest(name: string, candidates: Iterable<string>): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  const lower = name.toLowerCase();
  for (const c of candidates) {
    const d = levenshtein(lower, c.toLowerCase());
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  if (best === null) return null;
  const limit = name.length <= 4 ? 1 : 2;
  return bestDist <= limit ? best : null;
}

// Exact case-insensitive match that differs only in capitalization.
export function caseMismatch(name: string, candidates: Iterable<string>): string | null {
  const lower = name.toLowerCase();
  for (const c of candidates) {
    if (c !== name && c.toLowerCase() === lower) return c;
  }
  return null;
}

export function capitalMessage(line: number, wrong: string, right: string): string {
  return `Line ${line}: C++ cares about capital letters: '${wrong}' should be '${right}'.`;
}
