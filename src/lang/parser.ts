import type {
  AssignOp, BinaryOp, BlockStmt, DeclStmt, Declarator, Expr, FuncDef, IdentExpr, Param, Program,
  ReturnType, Stmt, TopLevel, VarType,
} from './ast';
import { errorAt, makeDiagnostic, type Diagnostic, type LangError, type Span } from './diagnostics';
import type { Token } from './tokenizer';

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=']);
const TYPE_WORDS = new Set(['int', 'bool', 'boolean', 'void']);
const OPERATOR_TOKENS = new Set([
  '=', '+=', '-=', '*=', '/=', '%=', '+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!', ',', '(',
]);
// Built-ins that take a number, for the "forward 2;" mistake.
const NUMBER_COMMANDS = new Set(['forward', 'backward', 'delay']);

export function parse(tokens: Token[], warnings: Diagnostic[]): Program {
  return new Parser(tokens, warnings).parseProgram();
}

function spanFrom(a: Span, b: Span): Span {
  return { line: a.line, from: a.from, to: b.to };
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private warnings: Diagnostic[]) {}

  // ---- token helpers ----

  private peek(k = 0): Token {
    return this.tokens[Math.min(this.pos + k, this.tokens.length - 1)];
  }
  private prev(): Token {
    return this.tokens[Math.max(this.pos - 1, 0)];
  }
  private next(): Token {
    const t = this.peek();
    if (t.type !== 'eof') this.pos++;
    return t;
  }
  private isPunct(v: string, k = 0): boolean {
    const t = this.peek(k);
    return t.type === 'punct' && t.value === v;
  }
  private isKw(v: string, k = 0): boolean {
    const t = this.peek(k);
    return t.type === 'kw' && t.value === v;
  }
  private eatPunct(v: string): Token | null {
    return this.isPunct(v) ? this.next() : null;
  }

  // ---- shared error builders ----

  // Called when a ; was expected after `this.prev()`.
  private missingSemicolon(): LangError {
    const prev = this.prev();
    const t = this.peek();
    if (t.type === 'punct' && t.value === ')' && t.line === prev.line) {
      return errorAt(`Line ${t.line} has an extra ).`, t);
    }
    if (t.type === 'eof' || t.line > prev.line || (t.type === 'punct' && t.value === '}')) {
      return errorAt(`Line ${prev.line} needs a ; at the end.`, prev);
    }
    return errorAt(`Line ${prev.line} needs a ; before '${t.value}'.`, t);
  }

  private expectSemicolon(): Token {
    const t = this.eatPunct(';');
    if (!t) throw this.missingSemicolon();
    return t;
  }

  private expectCloseParen(open: Token): Token {
    const t = this.eatPunct(')');
    if (t) return t;
    const here = this.peek();
    if (here.line === open.line || here.type === 'eof') {
      return this.throwAt(`Line ${open.line} is missing a ).`, open);
    }
    return this.throwAt(`The ( on line ${open.line} is never closed with a ).`, open);
  }

  private throwAt(message: string, span: Span): never {
    throw errorAt(message, span);
  }

  private unexpected(): never {
    const t = this.peek();
    const prev = this.prev();
    if (prev.type === 'punct' && OPERATOR_TOKENS.has(prev.value) && this.pos > 0) {
      this.throwAt(`Line ${prev.line} is missing a value after '${prev.value}'.`, prev);
    }
    if (t.type === 'eof') this.throwAt(`Line ${prev.line} ends before the code is finished.`, prev);
    if (t.type === 'punct' && t.value === ')') this.throwAt(`Line ${t.line} has an extra ).`, t);
    this.throwAt(`Line ${t.line}: RoverSim didn't expect '${t.value}' here.`, t);
  }

  // ---- program ----

  parseProgram(): Program {
    const items: TopLevel[] = [];
    while (this.peek().type !== 'eof') {
      if (this.eatPunct(';')) continue;
      const t = this.peek();
      if (t.type === 'kw' && (TYPE_WORDS.has(t.value) || t.value === 'const')) {
        items.push(this.parseTopDecl());
        continue;
      }
      if (t.type === 'ident' && this.isPunct('(', 1) && this.looksLikeFunctionHeader()) {
        this.throwAt(`Line ${t.line}: Functions need a type in front, like void ${t.value}().`, t);
      }
      if (t.type === 'punct' && t.value === '}') this.throwAt(`Line ${t.line} has an extra } that doesn't match any {.`, t);
      if (t.type === 'punct' && t.value === '{') this.throwAt(`Line ${t.line} has a { that isn't part of a function.`, t);
      this.throwAt(`Line ${t.line}: Commands need to go inside setup() or loop(), between the { }.`, t);
    }
    return { items };
  }

  // At `name (`: does a matching ) followed by { come next?
  private looksLikeFunctionHeader(): boolean {
    let depth = 0;
    for (let k = 1; this.peek(k).type !== 'eof'; k++) {
      const t = this.peek(k);
      if (t.type !== 'punct') continue;
      if (t.value === '(') depth++;
      else if (t.value === ')' && --depth === 0) return this.isPunct('{', k + 1);
    }
    return false;
  }

  private parseType(): { type: ReturnType; tok: Token } {
    const tok = this.next();
    const type = tok.value === 'boolean' ? 'bool' : (tok.value as ReturnType);
    if (this.isPunct('*')) this.throwAt(`Line ${tok.line}: Pointers aren't supported in RoverSim yet.`, this.peek());
    return { type, tok };
  }

  private parseTopDecl(): TopLevel {
    const start = this.peek();
    const isConst = !!(this.isKw('const') && this.next());
    if (isConst && !(this.peek().type === 'kw' && TYPE_WORDS.has(this.peek().value))) {
      this.throwAt(`Line ${start.line}: After const you need a type, like const int speed = 3;`, this.peek());
    }
    const { type, tok: typeTok } = this.parseType();
    const nameTok = this.expectName(typeTok);

    if (this.isPunct('(')) {
      if (isConst) this.throwAt(`Line ${start.line}: Functions can't be const. Remove the const.`, start);
      return this.parseFunction(start, type, nameTok);
    }
    if (type === 'void') this.throwAt(`Line ${typeTok.line}: Variables can't be void. Use int or bool.`, typeTok);
    return this.parseDeclRest(start, type, isConst, nameTok);
  }

  private expectName(typeTok: Token): Token {
    const t = this.peek();
    if (t.type === 'ident') return this.next();
    if (t.type === 'kw') {
      this.throwAt(`Line ${t.line}: '${t.value}' is a special word in C++, so it can't be used as a name.`, t);
    }
    if (t.type === 'num') this.throwAt(`Line ${t.line}: Names can't start with a number.`, t);
    this.throwAt(`Line ${typeTok.line}: After '${typeTok.value}' you need a name, like ${typeTok.value} steps = 3;`, typeTok);
  }

  private parseFunction(start: Token, returnType: ReturnType, nameTok: Token): FuncDef {
    const open = this.next(); // (
    const params: Param[] = [];
    if (this.isKw('void') && this.isPunct(')', 1)) this.next();
    if (!this.isPunct(')')) {
      for (;;) {
        const pStart = this.peek();
        const isConst = !!(this.isKw('const') && this.next());
        const t = this.peek();
        if (!(t.type === 'kw' && (t.value === 'int' || t.value === 'bool' || t.value === 'boolean'))) {
          if (t.type === 'kw' && t.value === 'void') {
            this.throwAt(`Line ${t.line}: A value in ( ) can't be void. Use int or bool.`, t);
          }
          this.throwAt(`Line ${pStart.line}: Each value in the ( ) of ${nameTok.value} needs a type, like int steps.`, t);
        }
        const { type, tok } = this.parseType();
        const pName = this.expectName(tok);
        if (this.isPunct('=')) {
          this.throwAt(`Line ${pName.line}: Default values in ( ) aren't supported in RoverSim yet.`, this.peek());
        }
        params.push({ type: type as VarType, name: pName.value, nameSpan: pName, isConst });
        if (this.eatPunct(',')) continue;
        break;
      }
    }
    this.expectCloseParen(open);

    if (this.isPunct(';')) {
      const end = this.next();
      return { kind: 'func', returnType, name: nameTok.value, nameSpan: nameTok, params, body: null, ...spanFrom(start, end) };
    }
    if (!this.isPunct('{')) {
      this.throwAt(
        `Line ${nameTok.line}: ${nameTok.value}() needs { } after the ( ), like void ${nameTok.value}() { }.`,
        this.prev(),
      );
    }
    const body = this.parseBlock();
    return { kind: 'func', returnType, name: nameTok.value, nameSpan: nameTok, params, body, ...spanFrom(start, body) };
  }

  // After `[const] type name` has been read. Consumes the trailing ;.
  private parseDeclRest(start: Token, varType: VarType, isConst: boolean, firstName: Token, forHeader?: Token): DeclStmt {
    const decls: Declarator[] = [];
    let nameTok = firstName;
    for (;;) {
      let init: Expr | null = null;
      if (this.eatPunct('=')) {
        init = this.parseExpr();
      } else if (isConst) {
        this.throwAt(`Line ${nameTok.line}: A const needs a value right away, like const int ${nameTok.value} = 3;`, nameTok);
      } else {
        const t = this.peek();
        if ((t.type === 'num' || t.type === 'ident') && t.line === nameTok.line) {
          this.throwAt(`Line ${t.line}: To give '${nameTok.value}' a value, use =, like int ${nameTok.value} = 5;`, t);
        }
      }
      decls.push({ name: nameTok.value, nameSpan: nameTok, init });
      if (!this.eatPunct(',')) break;
      nameTok = this.expectName(this.prev());
    }
    if (!this.isPunct(';')) {
      if (forHeader) throw this.forSemicolonError(forHeader);
      throw this.missingSemicolon();
    }
    const end = this.next();
    return { kind: 'decl', varType, isConst, decls, ...spanFrom(start, end) };
  }

  // ---- statements ----

  private parseBlock(): BlockStmt {
    const open = this.next(); // {
    const body: Stmt[] = [];
    while (!this.isPunct('}')) {
      if (this.peek().type === 'eof') this.throwAt(`The { on line ${open.line} is never closed with a }.`, open);
      body.push(this.parseStatement());
    }
    const close = this.next();
    return { kind: 'block', body, ...spanFrom(open, close) };
  }

  private parseStatement(): Stmt {
    const t = this.peek();

    if (t.type === 'punct') {
      if (t.value === '{') return this.parseBlock();
      if (t.value === ';') {
        this.next();
        return { kind: 'empty', ...spanFrom(t, t) };
      }
    }

    if (t.type === 'kw') {
      switch (t.value) {
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'for': return this.parseFor();
        case 'return': return this.parseReturn();
        case 'else':
          this.throwAt(`Line ${t.line} has an else without an if right before it.`, t);
        // falls through (throwAt never returns)
        case 'const':
        case 'int':
        case 'bool':
        case 'boolean':
        case 'void':
          return this.parseLocalDecl();
      }
    }

    const expr = this.parseExpr();
    const end = this.expectSemicolon();
    return { kind: 'expr', expr, ...spanFrom(t, end) };
  }

  private parseLocalDecl(): DeclStmt {
    const start = this.peek();
    const isConst = !!(this.isKw('const') && this.next());
    const typeTokPeek = this.peek();
    if (isConst && !(typeTokPeek.type === 'kw' && TYPE_WORDS.has(typeTokPeek.value))) {
      this.throwAt(`Line ${start.line}: After const you need a type, like const int speed = 3;`, typeTokPeek);
    }
    const { type, tok: typeTok } = this.parseType();
    const nameTok = this.expectName(typeTok);
    if (this.isPunct('(')) {
      this.throwAt(
        `Line ${start.line}: ${typeTok.value} ${nameTok.value}() starts a new function, but the function above it isn't closed with a } yet.`,
        nameTok,
      );
    }
    if (type === 'void') this.throwAt(`Line ${typeTok.line}: Variables can't be void. Use int or bool.`, typeTok);
    return this.parseDeclRest(start, type, isConst, nameTok);
  }

  private parseCondition(keyword: Token): Expr {
    const word = keyword.value;
    const open = this.eatPunct('(');
    if (!open) {
      this.throwAt(`Line ${keyword.line}: The condition after ${word} needs to be inside ( ), like ${word} (x > 2).`, keyword);
    }
    if (this.isPunct(')')) {
      this.throwAt(`Line ${keyword.line}: The ( ) after ${word} needs a condition inside, like ${word} (x > 2).`, open);
    }
    const test = this.parseExpr();
    this.expectCloseParen(open);
    return test;
  }

  // Body of if/while/for. Warns about the classic `if (x);` mistake.
  private parseBody(keyword: Token): Stmt {
    const t = this.peek();
    if (t.type === 'eof' || (t.type === 'punct' && t.value === '}')) {
      this.throwAt(`Line ${keyword.line}: The ${keyword.value} needs something to do after the ( ), like { forward(1); }`, keyword);
    }
    if (t.type === 'punct' && t.value === ';' && t.line === keyword.line) {
      this.warnings.push(
        makeDiagnostic(
          'warning',
          `Line ${t.line}: The ; right after ${keyword.value} ( ) ends the ${keyword.value}, so the lines below aren't part of it. Remove that ;.`,
          t,
        ),
      );
    }
    return this.parseStatement();
  }

  private parseIf(): Stmt {
    const kw = this.next();
    const test = this.parseCondition(kw);
    const then = this.parseBody(kw);
    let alt: Stmt | null = null;
    if (this.isKw('else')) {
      const elseTok = this.next();
      alt = this.isKw('if') ? this.parseIf() : this.parseBody(elseTok);
    }
    return { kind: 'if', test, then, else: alt, ...spanFrom(kw, alt ?? then) };
  }

  private parseWhile(): Stmt {
    const kw = this.next();
    const test = this.parseCondition(kw);
    const body = this.parseBody(kw);
    return { kind: 'while', test, body, ...spanFrom(kw, body) };
  }

  private forSemicolonError(kw: Token): LangError {
    return errorAt(
      `Line ${kw.line}: The for needs two ; inside the ( ), like for (int i = 0; i < 4; i++)`,
      kw,
    );
  }

  private parseFor(): Stmt {
    const kw = this.next();
    const open = this.eatPunct('(');
    if (!open) this.throwAt(`Line ${kw.line}: for needs ( ) after it, like for (int i = 0; i < 4; i++)`, kw);

    let init: DeclStmt | (Span & { kind: 'expr'; expr: Expr }) | null = null;
    if (!this.eatPunct(';')) {
      const t = this.peek();
      if (t.type === 'kw' && (t.value === 'int' || t.value === 'bool' || t.value === 'boolean' || t.value === 'const')) {
        const isConst = !!(this.isKw('const') && this.next());
        const { type, tok } = this.parseType();
        const nameTok = this.expectName(tok);
        init = this.parseDeclRest(t, type as VarType, isConst, nameTok, kw);
      } else {
        const expr = this.parseExpr();
        if (!this.isPunct(';')) throw this.forSemicolonError(kw);
        const end = this.next();
        init = { kind: 'expr', expr, ...spanFrom(t, end) };
      }
    }

    let test: Expr | null = null;
    if (!this.isPunct(';')) test = this.parseExpr();
    if (!this.eatPunct(';')) throw this.forSemicolonError(kw);

    let update: Expr | null = null;
    if (!this.isPunct(')')) update = this.parseExpr();
    if (this.isPunct(';')) this.throwAt(`Line ${kw.line}: The for ( ) only needs two ;. Remove the last one.`, this.peek());
    if (this.isPunct(',')) this.throwAt(`Line ${kw.line}: Commas inside for ( ) aren't supported in RoverSim yet.`, this.peek());
    this.expectCloseParen(open);

    const body = this.parseBody(kw);
    return { kind: 'for', init, test, update, body, ...spanFrom(kw, body) };
  }

  private parseReturn(): Stmt {
    const kw = this.next();
    let value: Expr | null = null;
    if (!this.isPunct(';')) value = this.parseExpr();
    const end = this.expectSemicolon();
    return { kind: 'return', value, ...spanFrom(kw, end) };
  }

  // ---- expressions (lowest to highest precedence) ----

  parseExpr(): Expr {
    return this.parseAssign();
  }

  private parseAssign(): Expr {
    const left = this.parseOr();
    const t = this.peek();
    if (t.type === 'punct' && ASSIGN_OPS.has(t.value)) {
      if (left.kind !== 'ident') {
        this.throwAt(`Line ${t.line}: The left side of ${t.value} must be a variable name.`, left);
      }
      this.next();
      const value = this.parseAssign();
      return { kind: 'assign', op: t.value as AssignOp, target: left, value, ...spanFrom(left, value) };
    }
    return left;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isPunct('||')) {
      this.next();
      const right = this.parseAnd();
      left = { kind: 'logical', op: '||', left, right, ...spanFrom(left, right) };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseBinary(0);
    while (this.isPunct('&&')) {
      this.next();
      const right = this.parseBinary(0);
      left = { kind: 'logical', op: '&&', left, right, ...spanFrom(left, right) };
    }
    return left;
  }

  private static LEVELS: string[][] = [['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];

  private parseBinary(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.parseUnary();
    let left = this.parseBinary(level + 1);
    for (;;) {
      const t = this.peek();
      if (!(t.type === 'punct' && Parser.LEVELS[level].includes(t.value))) return left;
      this.next();
      const right = this.parseBinary(level + 1);
      left = { kind: 'binary', op: t.value as BinaryOp, left, right, ...spanFrom(left, right) };
    }
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.type === 'punct') {
      if (t.value === '!' || t.value === '-' || t.value === '+') {
        this.next();
        const arg = this.parseUnary();
        return { kind: 'unary', op: t.value, arg, ...spanFrom(t, arg) };
      }
      if (t.value === '++' || t.value === '--') {
        this.next();
        const target = this.parseUnary();
        return { kind: 'update', op: t.value, prefix: true, target: this.updateTarget(t, target), ...spanFrom(t, target) };
      }
      if (t.value === '*') this.throwAt(`Line ${t.line}: Pointers aren't supported in RoverSim yet.`, t);
    }
    return this.parsePostfix();
  }

  private updateTarget(op: Token, target: Expr): IdentExpr {
    if (target.kind !== 'ident') {
      this.throwAt(`Line ${op.line}: ${op.value} only works on a variable, like steps${op.value};`, op);
    }
    return target;
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    while (this.isPunct('++') || this.isPunct('--')) {
      const op = this.next();
      expr = { kind: 'update', op: op.value as '++' | '--', prefix: false, target: this.updateTarget(op, expr), ...spanFrom(expr, op) };
    }
    return expr;
  }

  private parseArgs(): { args: Expr[]; close: Token } {
    const open = this.next(); // (
    const args: Expr[] = [];
    if (!this.isPunct(')')) {
      for (;;) {
        args.push(this.parseExpr());
        if (!this.eatPunct(',')) break;
      }
    }
    const close = this.expectCloseParen(open);
    return { args, close };
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    switch (t.type) {
      case 'num':
        this.next();
        return { kind: 'num', value: t.num!, ...spanFrom(t, t) };
      case 'str':
        this.next();
        return { kind: 'str', value: t.value, ...spanFrom(t, t) };
      case 'kw':
        if (t.value === 'true' || t.value === 'false') {
          this.next();
          return { kind: 'bool', value: t.value === 'true', ...spanFrom(t, t) };
        }
        return this.unexpected();
      case 'punct':
        if (t.value === '(') {
          const open = this.next();
          if (this.isPunct(')')) this.throwAt(`Line ${open.line} has empty ( ) with nothing inside.`, open);
          const inner = this.parseExpr();
          const close = this.expectCloseParen(open);
          return { ...inner, line: open.line, from: open.from, to: close.to };
        }
        return this.unexpected();
      case 'ident':
        return this.parseIdentExpr();
      default:
        return this.unexpected();
    }
  }

  private parseIdentExpr(): Expr {
    const t = this.next();

    if (this.isPunct('.')) {
      this.next();
      const m = this.peek();
      if (m.type !== 'ident') {
        this.throwAt(`Line ${t.line}: After ${t.value}. write a command, like Serial.println(x);`, m.type === 'eof' ? t : m);
      }
      this.next();
      if (!this.isPunct('(')) {
        this.throwAt(`Line ${m.line}: ${t.value}.${m.value} needs ( ) after it, like Serial.println(x);`, m);
      }
      const { args, close } = this.parseArgs();
      return {
        kind: 'method', object: t.value, objectSpan: spanFrom(t, t), method: m.value, methodSpan: spanFrom(m, m), args,
        ...spanFrom(t, close),
      };
    }

    if (this.isPunct('(')) {
      const { args, close } = this.parseArgs();
      return { kind: 'call', callee: t.value, calleeSpan: spanFrom(t, t), args, ...spanFrom(t, close) };
    }

    const after = this.peek();
    if (after.type === 'num' && after.line === t.line && NUMBER_COMMANDS.has(t.value)) {
      this.throwAt(`Line ${t.line}: ${t.value} needs ( ) around its number, like ${t.value}(${after.value});`, after);
    }
    return { kind: 'ident', name: t.value, ...spanFrom(t, t) };
  }
}
