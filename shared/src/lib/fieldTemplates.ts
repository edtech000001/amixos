import type { SupabaseClient } from '@supabase/supabase-js';

// ── Custom-field types & per-field config ──────────────────────────────────

/** All custom field types. 'note' = long multiline text (migration 108). */
export type CustomFieldType = 'text' | 'note' | 'number' | 'date' | 'boolean' | 'select';

/**
 * Per-field options stored in <table>.field_config (JSONB, migration 108).
 *  - integerOnly: number fields accept whole numbers only
 *  - multi: select fields allow multiple selections (value = comma-joined)
 *  - thousands: number fields display a thousands separator (1,000) while
 *    typing. The STORED value stays plain ("1000") so parsing never breaks.
 */
export interface FieldConfig {
  integerOnly?: boolean;
  multi?: boolean;
  thousands?: boolean;
}

/**
 * Add thousands separators to a plain number string for display ("12345.6" →
 * "12,345.6"). Input is the stored/sanitized value — digits, optional leading
 * minus, optional single decimal point.
 */
export function groupNumberString(raw: string): string {
  if (!raw) return raw;
  const neg = raw.startsWith('-');
  const body = neg ? raw.slice(1) : raw;
  const dot = body.indexOf('.');
  const int = dot >= 0 ? body.slice(0, dot) : body;
  const rest = dot >= 0 ? body.slice(dot) : '';
  return (neg ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + rest;
}

/** Defensive parse — the column defaults to {} but old rows may be null. */
export function parseFieldConfig(raw: unknown): FieldConfig {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as FieldConfig) : {};
}

/**
 * Keep number-field input numeric as the user types: strips everything but
 * digits (plus one leading minus, and one decimal point unless integerOnly).
 */
export function sanitizeNumberInput(v: string, integerOnly?: boolean): string {
  let s = v.replace(integerOnly ? /[^0-9-]/g : /[^0-9.-]/g, '');
  // Only a single leading minus.
  s = s.charAt(0) + s.slice(1).replace(/-/g, '');
  if (!integerOnly) {
    // Only the first decimal point survives.
    const firstDot = s.indexOf('.');
    if (firstDot >= 0) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }
  return s;
}

/**
 * Multi-select values are stored comma-joined ("Opción A, Opción B") so every
 * raw display path (detail pages, PDFs, Google-contact biography) reads
 * naturally without knowing about multi-select.
 */
export const MULTI_SEPARATOR = ', ';

export function splitMultiValue(value: string): string[] {
  return value ? value.split(MULTI_SEPARATOR).map((s) => s.trim()).filter(Boolean) : [];
}

/** Toggle one option in a comma-joined multi-select value. */
export function toggleMultiOption(value: string, option: string): string {
  const parts = splitMultiValue(value);
  const next = parts.includes(option) ? parts.filter((p) => p !== option) : [...parts, option];
  return next.join(MULTI_SEPARATOR);
}

/**
 * Tables that follow the field-template shape with a `sort_order` column.
 * Centralised here so both clients and employees reorder via the same code.
 */
export type FieldTemplateTable =
  | 'client_field_templates'
  | 'employee_field_templates'
  | 'job_field_templates'
  | 'job_assignment_field_templates'
  | 'invoice_field_templates';

interface OrderedRow {
  id: string;
  sort_order: number;
}

/**
 * Swap the sort_order of two templates so the user can rearrange them with
 * up/down arrows. Returns a new array reflecting the new order — callers
 * can use it for optimistic UI without re-fetching.
 *
 * No-op when the target index would fall outside the array bounds (i.e.
 * trying to move the first row up or the last row down).
 */
export async function moveTemplate<T extends OrderedRow>(
  supabase: SupabaseClient,
  table: FieldTemplateTable,
  templates: T[],
  id: string,
  direction: 'up' | 'down',
): Promise<T[]> {
  const idx = templates.findIndex((t) => t.id === id);
  if (idx < 0) return templates;
  const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (otherIdx < 0 || otherIdx >= templates.length) return templates;

  const a = templates[idx];
  const b = templates[otherIdx];

  // Two-step update so neither side hits the (business_id, sort_order)
  // unique constraint (if it ever gets added). We don't have one today but
  // this stays robust if we do.
  await supabase.from(table).update({ sort_order: b.sort_order }).eq('id', a.id);
  await supabase.from(table).update({ sort_order: a.sort_order }).eq('id', b.id);

  // Return a new array with the two items swapped + their sort_orders updated.
  const next = [...templates];
  next[idx] = { ...b, sort_order: a.sort_order };
  next[otherIdx] = { ...a, sort_order: b.sort_order };
  return next;
}
