// Payment-reminder log for open invoices (migration 228). One row per time the
// business chased the client (email / text / call / in person). The invoice
// row carries a trigger-maintained summary (reminder_count, last_reminded_on)
// so lists can show "Reminded 3d ago" without reading this table.

import { daysSince } from './format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export const REMINDER_METHODS = ['email', 'text', 'call', 'in_person', 'other'] as const;
export type ReminderMethod = (typeof REMINDER_METHODS)[number];

export interface InvoiceReminder {
  id: string;
  /** Day the client was reminded, YYYY-MM-DD. */
  remindedOn: string;
  method: ReminderMethod;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface ReminderRow {
  id: string;
  reminded_on: string;
  method: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

const toMethod = (m: string): ReminderMethod =>
  (REMINDER_METHODS as readonly string[]).includes(m) ? (m as ReminderMethod) : 'other';

/** Newest first. Bounded per invoice (a handful of rows), so no paging. */
export async function fetchInvoiceReminders(supabase: SupabaseLike, invoiceId: string): Promise<InvoiceReminder[]> {
  const { data, error } = await supabase
    .from('invoice_reminders')
    .select('id, reminded_on, method, note, created_by, created_at')
    .eq('invoice_id', invoiceId)
    .order('reminded_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ReminderRow[]).map(r => ({
    id: r.id,
    remindedOn: r.reminded_on,
    method: toMethod(r.method),
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function addInvoiceReminder(
  supabase: SupabaseLike,
  input: { businessId: string; invoiceId: string; remindedOn: string; method: ReminderMethod; note?: string | null },
): Promise<void> {
  const { error } = await supabase.from('invoice_reminders').insert({
    business_id: input.businessId,
    invoice_id: input.invoiceId,
    reminded_on: input.remindedOn,
    method: input.method,
    note: input.note?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteInvoiceReminder(supabase: SupabaseLike, id: string): Promise<void> {
  const { error } = await supabase.from('invoice_reminders').delete().eq('id', id);
  if (error) throw error;
}

/** Only open invoices get chased. */
export const invoiceTakesReminders = (status: string) => status === 'sent' || status === 'overdue';

/**
 * List-row reminder badge. Overdue invoices always get one (so "Not reminded"
 * stands out); sent invoices only once they've actually been reminded.
 * Returns null when nothing should render.
 */
export function reminderBadge(
  inv: { status: string; reminderCount?: number | null; lastRemindedOn?: string | null },
  t: { listReminded: string; listRemindedToday: string; listNotReminded: string },
): { label: string; reminded: boolean } | null {
  if (!invoiceTakesReminders(inv.status)) return null;
  if ((inv.reminderCount ?? 0) > 0 && inv.lastRemindedOn) {
    const n = daysSince(inv.lastRemindedOn);
    const base = n === 0 ? t.listRemindedToday : t.listReminded.replace('{{n}}', String(n));
    const count = inv.reminderCount ?? 0;
    return { label: count > 1 ? `${base} · ${count}×` : base, reminded: true };
  }
  if (inv.status === 'overdue') return { label: t.listNotReminded, reminded: false };
  return null;
}
