import type { Program } from './ast';
import { checkBraces } from './braces';
import { check } from './checker';
import { INTERNAL_ERROR_MESSAGE, LangError, makeDiagnostic, type Diagnostic } from './diagnostics';
import { parse } from './parser';
import { tokenize } from './tokenizer';

export type { Program } from './ast';
export type { Diagnostic } from './diagnostics';
export { runProgram } from './interpreter';
export type { RunEvent, RunResult, RunOptions, RunStatus } from './interpreter';

export type CompileResult =
  | { ok: true; program: Program; warnings: Diagnostic[] }
  | { ok: false; error: Diagnostic; warnings: Diagnostic[] };

// Source text -> checked program, or the first friendly error.
export function compile(source: string): CompileResult {
  const warnings: Diagnostic[] = [];
  try {
    const tokens = tokenize(source);
    checkBraces(tokens, source);
    const program = parse(tokens, warnings);
    check(program, warnings);
    return { ok: true, program, warnings };
  } catch (e) {
    if (e instanceof LangError) return { ok: false, error: e.diagnostic, warnings };
    console.error(e);
    return { ok: false, error: makeDiagnostic('error', INTERNAL_ERROR_MESSAGE, null), warnings };
  }
}
