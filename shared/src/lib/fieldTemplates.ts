import type { SupabaseClient } from '@supabase/supabase-js';

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
