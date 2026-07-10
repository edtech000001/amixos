// Custom pay-calculation formulas (Nómina → Ajustes → "Cálculo de pago").
//
// The owner builds a formula from chips — variables, custom fields, numbers,
// + − × ÷ and parentheses — and it replaces the gross-pay calculation for
// HOURLY workers (salary/daily keep the standard calc). Stored as a token
// array in businesses.payroll_config.formula (jsonb), never as free text,
// and evaluated with shunting-yard — no eval(), no parsing of user strings.
//
// Examples the builder supports:
//   normal_hours × pay_rate + overtime_hours × pay_rate × 1.5
//   ( normal_pay + overtime_pay ) + [Bono] (job custom field, summed)
//   ( normal_pay + overtime_pay ) + [Overnight Stay] × 20

export type FormulaOp = '+' | '-' | '*' | '/';

export type FormulaToken =
  /** Built-in per-worker variable (see FORMULA_VARS). */
  | { t: 'var'; k: FormulaVar }
  /** Employee custom field (field_key) — the worker's own value. With `eq`
   *  (Yes/No and option-list fields) it's 1 when the value matches, else 0. */
  | { t: 'ecf'; k: string; label: string; eq?: string }
  /** Job custom field (field_key) — summed over the worker's jobs in the
   *  period. With `eq` it counts the jobs whose value matches instead. */
  | { t: 'jcf'; k: string; label: string; eq?: string }
  | { t: 'num'; v: number }
  | { t: 'op'; v: FormulaOp }
  | { t: 'lp' }
  | { t: 'rp' };

/** One field read a formula performs (plain sum or option count). */
export interface FieldRef {
  k: string;
  eq?: string;
}

/** Stable id for a field read — keys the engine's per-worker jcf sums. */
export function fieldRefId(ref: FieldRef): string {
  return ref.eq === undefined ? ref.k : `${ref.k}=${ref.eq}`;
}

export const FORMULA_VARS = [
  'pay_rate',
  'worked_hours',
  'driven_hours',
  'total_hours',
  'normal_hours',
  'overtime_hours',
  'normal_pay',
  'overtime_pay',
  'driver_pay',
  'standard_pay',
] as const;

export type FormulaVar = (typeof FORMULA_VARS)[number];

/** Values feeding one worker's formula evaluation. */
export interface FormulaScope {
  vars: Record<FormulaVar, number>;
  /** The worker's RAW custom_fields — the evaluator converts per token. */
  ecf: Record<string, unknown>;
  /** Job custom-field period sums, keyed by fieldRefId(). */
  jcf: Record<string, number>;
}

/** Numeric read of a custom-field value: numbers pass through, numeric
 *  strings parse (commas stripped), booleans/"true" count as 1. Anything
 *  else is 0 so a stray text value can never corrupt a paycheck. */
export function numericFieldValue(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === 'sí' || s === 'si' || s === 'yes') return 1;
    if (s === 'false' || s === 'no' || s === '') return 0;
    const n = parseFloat(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Option match for Yes/No and option-list fields: 1 when the stored value
 * equals `eq` (case/accent-tolerant, booleans normalized so true/Sí/Yes all
 * agree), else 0. Multi-select values ("A, B") match if the option is among
 * them. A blank value matches nothing — an unanswered job never counts.
 */
export function matchFieldValue(v: unknown, eq: string): number {
  const norm = (x: string) => x.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const asBool = (x: string) =>
    x === 'true' || x === 'si' || x === 'yes' ? 'true'
    : x === 'false' || x === 'no' ? 'false'
    : null;
  const raw = typeof v === 'boolean' ? String(v) : String(v ?? '');
  const sv = norm(raw);
  const se = norm(eq);
  if (!sv) return 0;
  if (sv === se) return 1;
  const bv = asBool(sv);
  const be = asBool(se);
  if (bv && be && bv === be) return 1;
  if (raw.split(',').map(norm).includes(se)) return 1;
  return 0;
}

export type FormulaError = 'empty' | 'sequence' | 'parens';

/**
 * Grammar check: operands (var/field/number) and operators must alternate,
 * parentheses must balance, and the formula can't end mid-expression.
 * Returns null when valid.
 */
export function validateFormula(tokens: FormulaToken[]): FormulaError | null {
  if (!tokens.length) return 'empty';
  let depth = 0;
  let expectOperand = true;
  for (const tok of tokens) {
    if (expectOperand) {
      if (tok.t === 'lp') depth++;
      else if (tok.t === 'var' || tok.t === 'ecf' || tok.t === 'jcf' || tok.t === 'num') expectOperand = false;
      else return 'sequence';
    } else {
      if (tok.t === 'op') expectOperand = true;
      else if (tok.t === 'rp') { depth--; if (depth < 0) return 'parens'; }
      else return 'sequence';
    }
  }
  if (expectOperand) return 'sequence';
  if (depth !== 0) return 'parens';
  return null;
}

const PRECEDENCE: Record<FormulaOp, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

/**
 * Evaluate a VALID formula against one worker's scope. Division by zero
 * yields 0 (not Infinity/NaN) so a blank field can never explode a paycheck.
 * Returns null if the formula is invalid — callers fall back to standard pay.
 */
export function evaluateFormula(tokens: FormulaToken[], scope: FormulaScope): number | null {
  if (validateFormula(tokens) !== null) return null;

  // Shunting-yard → RPN.
  const out: FormulaToken[] = [];
  const ops: FormulaToken[] = [];
  for (const tok of tokens) {
    if (tok.t === 'var' || tok.t === 'ecf' || tok.t === 'jcf' || tok.t === 'num') out.push(tok);
    else if (tok.t === 'op') {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === 'op' && PRECEDENCE[top.v] >= PRECEDENCE[tok.v]) out.push(ops.pop() as FormulaToken);
        else break;
      }
      ops.push(tok);
    } else if (tok.t === 'lp') ops.push(tok);
    else { // rp
      while (ops.length && ops[ops.length - 1].t !== 'lp') out.push(ops.pop() as FormulaToken);
      ops.pop(); // discard lp
    }
  }
  while (ops.length) out.push(ops.pop() as FormulaToken);

  // RPN eval.
  const stack: number[] = [];
  for (const tok of out) {
    if (tok.t === 'num') stack.push(tok.v);
    else if (tok.t === 'var') stack.push(scope.vars[tok.k] ?? 0);
    else if (tok.t === 'ecf') {
      stack.push(tok.eq === undefined ? numericFieldValue(scope.ecf[tok.k]) : matchFieldValue(scope.ecf[tok.k], tok.eq));
    } else if (tok.t === 'jcf') stack.push(scope.jcf[fieldRefId(tok)] ?? 0);
    else if (tok.t === 'op') {
      const b = stack.pop() ?? 0;
      const a = stack.pop() ?? 0;
      stack.push(
        tok.v === '+' ? a + b
        : tok.v === '-' ? a - b
        : tok.v === '*' ? a * b
        : b === 0 ? 0 : a / b,
      );
    }
  }
  const result = stack.pop() ?? 0;
  return Number.isFinite(result) ? result : 0;
}

/** Job-custom-field reads the formula performs — tells the engine what to
 *  sum (plain fields) or count (option-match fields). */
export function formulaJobFieldRefs(tokens: FormulaToken[]): FieldRef[] {
  const refs: FieldRef[] = [];
  const seen = new Set<string>();
  tokens.forEach(tok => {
    if (tok.t !== 'jcf') return;
    const id = fieldRefId(tok);
    if (seen.has(id)) return;
    seen.add(id);
    refs.push(tok.eq === undefined ? { k: tok.k } : { k: tok.k, eq: tok.eq });
  });
  return refs;
}

/** Defensive parse of payroll_config.formula — drops anything malformed. */
export function normalizeFormula(raw: unknown): FormulaToken[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const tokens: FormulaToken[] = [];
  for (const item of raw) {
    const tok = item as Partial<FormulaToken> & { t?: string; k?: unknown; v?: unknown; label?: unknown };
    if (tok?.t === 'var' && FORMULA_VARS.includes(tok.k as FormulaVar)) tokens.push({ t: 'var', k: tok.k as FormulaVar });
    else if ((tok?.t === 'ecf' || tok?.t === 'jcf') && typeof tok.k === 'string' && tok.k) {
      const eq = (tok as { eq?: unknown }).eq;
      tokens.push({
        t: tok.t,
        k: tok.k,
        label: typeof tok.label === 'string' ? tok.label : tok.k,
        ...(typeof eq === 'string' ? { eq } : {}),
      });
    } else if (tok?.t === 'num' && typeof tok.v === 'number' && Number.isFinite(tok.v)) tokens.push({ t: 'num', v: tok.v });
    else if (tok?.t === 'op' && (tok.v === '+' || tok.v === '-' || tok.v === '*' || tok.v === '/')) tokens.push({ t: 'op', v: tok.v });
    else if (tok?.t === 'lp') tokens.push({ t: 'lp' });
    else if (tok?.t === 'rp') tokens.push({ t: 'rp' });
    else return null; // one bad token → distrust the whole formula
  }
  return validateFormula(tokens) === null ? tokens : null;
}

/** A custom field offered in the builder palette. number → one sum chip;
 *  boolean → a Yes and a No count chip; select → one count chip per option.
 *  Text/date/note fields are never offered. */
export interface FormulaFieldDef {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select';
  options?: string[];
}

/** Display symbol for an operator chip (× ÷ instead of * /). */
export const OP_SYMBOLS: Record<FormulaOp, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };
