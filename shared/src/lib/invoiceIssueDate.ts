// "This invoice's issue date isn't today — use today?" Asked before an invoice
// goes to the client (email send) and when work is billed through onto an
// existing draft. A stale issue date makes the invoice look late (or already
// overdue) the moment the client opens it.

import { addDaysISO, formatDateLong, todayLocalISO } from './format';
import { confirm } from '../ui/confirmBus';

type Supa = { from: (table: string) => any };

/** Dates to write when moving the issue date to today, or null when it's
 *  already today. The due date moves with it when it still sits at the
 *  default window (same rule as the invoice form) or would end up before the
 *  new issue date; a due date set by hand otherwise stays. Pure. */
export function issueDateToToday(
  issueDate: string | null,
  dueDate: string | null,
  dueDays: number,
  today: string = todayLocalISO(),
): { issue_date: string; due_date: string | null } | null {
  if (!issueDate || issueDate === today) return null;
  const days = dueDays >= 0 ? dueDays : 30;
  const followed = !dueDate || dueDate === addDaysISO(issueDate, days) || dueDate < today;
  return { issue_date: today, due_date: followed ? addDaysISO(today, days) : dueDate };
}

const dayDiff = (a: string, b: string) =>
  Math.round((Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86400000);

export interface IssueDateLabels {
  issueDateStaleTitle: string;
  issueDateStalePast: string;
  issueDateStaleFuture: string;
  issueDateDueMoves: string;
  issueDateUseToday: string;
  issueDateKeep: string;
}

/** Ask, and update the invoice when the user picks "Use today". Only drafts
 *  and sent-but-unpaid invoices are offered. Returns the new dates when it
 *  changed them (callers reload / use the new due date), else null. Never
 *  blocks the caller's action: any error = date kept. */
export async function offerIssueDateToday(
  supabase: Supa,
  invoiceId: string,
  t: IssueDateLabels,
  locale: string,
): Promise<{ issue_date: string; due_date: string | null } | null> {
  try {
    const { data: inv } = await supabase.from('invoices')
      .select('issue_date, due_date, status, business_id').eq('id', invoiceId).maybeSingle();
    if (!inv || !['draft', 'sent'].includes(inv.status)) return null;
    const { data: biz } = await supabase.from('businesses')
      .select('invoice_due_days').eq('id', inv.business_id).maybeSingle();
    const today = todayLocalISO();
    const next = issueDateToToday(inv.issue_date, inv.due_date, biz?.invoice_due_days ?? 30, today);
    if (!next) return null;
    const fmt = (d: string) => formatDateLong(`${d}T00:00:00`, locale);
    const diff = dayDiff(today, inv.issue_date);
    const lead = (diff > 0 ? t.issueDateStalePast : t.issueDateStaleFuture)
      .replace('{{date}}', fmt(inv.issue_date)).replace('{{days}}', String(Math.abs(diff)));
    const tail = next.due_date && next.due_date !== inv.due_date
      ? '\n\n' + t.issueDateDueMoves.replace('{{today}}', fmt(today)).replace('{{due}}', fmt(next.due_date))
      : '';
    const ok = await confirm({
      title: t.issueDateStaleTitle,
      message: lead + tail,
      confirmText: t.issueDateUseToday,
      cancelText: t.issueDateKeep.replace('{{date}}', fmt(inv.issue_date)),
    });
    if (!ok) return null;
    const { error } = await supabase.from('invoices').update(next).eq('id', invoiceId);
    return error ? null : next;
  } catch {
    return null;
  }
}
