import type { Span } from './diagnostics';

export type VarType = 'int' | 'bool';
export type ReturnType = VarType | 'void';

export type AssignOp = '=' | '+=' | '-=' | '*=' | '/=' | '%=';
export type BinaryOp = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '>' | '<=' | '>=';

export type Expr =
  | (Span & { kind: 'num'; value: number })
  | (Span & { kind: 'bool'; value: boolean })
  | (Span & { kind: 'str'; value: string })
  | IdentExpr
  | (Span & { kind: 'unary'; op: '-' | '+' | '!'; arg: Expr })
  | (Span & { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr })
  | (Span & { kind: 'logical'; op: '&&' | '||'; left: Expr; right: Expr })
  | (Span & { kind: 'assign'; op: AssignOp; target: IdentExpr; value: Expr })
  | (Span & { kind: 'update'; op: '++' | '--'; prefix: boolean; target: IdentExpr })
  | CallExpr
  | MethodExpr;

export type IdentExpr = Span & { kind: 'ident'; name: string };
export type CallExpr = Span & { kind: 'call'; callee: string; calleeSpan: Span; args: Expr[] };
// Only Serial.xxx(...) is meaningful; the checker rejects anything else.
export type MethodExpr = Span & {
  kind: 'method';
  object: string;
  objectSpan: Span;
  method: string;
  methodSpan: Span;
  args: Expr[];
};

export interface Declarator {
  name: string;
  nameSpan: Span;
  init: Expr | null;
}

export type DeclStmt = Span & { kind: 'decl'; varType: VarType; isConst: boolean; decls: Declarator[] };
export type BlockStmt = Span & { kind: 'block'; body: Stmt[] };

export type Stmt =
  | BlockStmt
  | DeclStmt
  | (Span & { kind: 'empty' })
  | (Span & { kind: 'expr'; expr: Expr })
  | (Span & { kind: 'if'; test: Expr; then: Stmt; else: Stmt | null })
  | (Span & { kind: 'while'; test: Expr; body: Stmt })
  | (Span & { kind: 'for'; init: DeclStmt | (Span & { kind: 'expr'; expr: Expr }) | null; test: Expr | null; update: Expr | null; body: Stmt })
  | (Span & { kind: 'return'; value: Expr | null });

export interface Param {
  type: VarType;
  name: string;
  nameSpan: Span;
  isConst: boolean;
}

export type FuncDef = Span & {
  kind: 'func';
  returnType: ReturnType;
  name: string;
  nameSpan: Span;
  params: Param[];
  body: BlockStmt | null; // null for a prototype like `void dance();`
};

export type TopLevel = FuncDef | DeclStmt;

export interface Program {
  items: TopLevel[];
}
