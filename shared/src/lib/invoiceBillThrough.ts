// Bill another business's invoice lines through one of this user's other
// businesses (migration 240). Example: Champion Built did 3 jobs for a client
// that Pivot Builders also works for; Pivot sends the client ONE invoice that
// lists both. Champion's invoice stays a normal unpaid invoice (Pivot pays
// Champion later). On Pivot's invoice the copied lines are client-facing and
// count in the total, but carry a `passthrough` tag so revenue leaves them out
// (invoices.passthrough_amount, maintained by a trigger).
//
// Access: the caller must be a member of BOTH businesses with invoice rights —
// RLS enforces it on every read/write here (same model as delegateJob). The
// source business must opt in (businesses.allow_bill_through); the UI gates on
// that, and the copy refuses without it.

import { can, isCustomRole, type Role } from './permissions';
import { CLIENT_COPY_FIELDS } from './delegation';
import {
  computeTotals,
  insertInvoiceUnique,
  type InvoiceLineItem,
  type PassthroughTag,
} from './invoicing';
import { invoiceDefaultLanguage, nextInvoiceNumber, resolveLineDescriptions } from './invoiceTemplate';

type Supa = { from: (table: string) => any };

export interface BillThroughTarget {
  id: string;
  name: string;
}

/** Businesses the lines can be billed into: every OTHER business the user is
 *  in whose role can create or edit invoices. Custom roles can't be resolved
 *  for a non-active business (their permissions load per active business), so
 *  they're offered and RLS has the final say. */
export function billThroughTargets(
  businesses: { id: string; name: string | null }[],
  roles: Record<string, Role | string | null | undefined>,
  currentBusinessId: string | null | undefined,
): BillThroughTarget[] {
  return businesses
    .filter(b => b.id !== currentBusinessId)
    .filter(b => {
      const role = roles[b.id] as Role | null | undefined;
      if (!role) return false;
      return isCustomRole(role) || can.editInvoice(role) || can.createInvoice(role);
    })
    .map(b => ({ id: b.id, name: b.name ?? '' }));
}

// ── Clients ────────────────────────────────────────────────────────────────

export interface BillThroughClient {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
}

export type ClientMatchReason = 'email' | 'phone' | 'name' | 'company';

export interface ClientMatch extends BillThroughClient {
  reason: ClientMatchReason;
}

const CLIENT_COLS = 'id, first_name, last_name, company, city, state, phone_cell, email_office, email_home';

function toClient(r: any): BillThroughClient {
  return {
    id: r.id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    company: r.company ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    phone: r.phone_cell ?? null,
    email: r.email_office ?? r.email_home ?? null,
  };
}

/** PostgREST `.or()` values are comma/paren-delimited — quote them. */
const orVal = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
/** ilike pattern with the user's own wildcards escaped. */
const likeEsc = (v: string) => v.replace(/[\\%_]/g, m => `\\${m}`);

/**
 * Likely matches for the source client in the target business, strongest
 * first: same email, same phone, same first+last name, same company. A
 * suggestion only — the user can always pick another client or copy this one.
 */
export async function suggestTargetClients(
  supabase: Supa,
  targetBusinessId: string,
  sourceClientId: string | null,
): Promise<ClientMatch[]> {
  if (!sourceClientId) return [];
  const { data: src } = await supabase
    .from('clients')
    .select('first_name, last_name, company, phone_cell, phone_office, email_office, email_home')
    .eq('id', sourceClientId)
    .single();
  if (!src) return [];

  const out = new Map<string, ClientMatch>();
  const add = (rows: any[] | null | undefined, reason: ClientMatchReason) => {
    for (const r of rows ?? []) if (!out.has(r.id)) out.set(r.id, { ...toClient(r), reason });
  };

  const emails = [src.email_office, src.email_home].map(e => (e ?? '').trim()).filter(Boolean);
  if (emails.length) {
    const ors = emails.flatMap(e => [`email_office.ilike.${orVal(likeEsc(e))}`, `email_home.ilike.${orVal(likeEsc(e))}`]);
    const { data } = await supabase.from('clients').select(CLIENT_COLS)
      .eq('business_id', targetBusinessId).or(ors.join(',')).limit(5);
    add(data, 'email');
  }
  const phones = [src.phone_cell, src.phone_office].map(p => (p ?? '').trim()).filter(Boolean);
  if (phones.length) {
    const ors = phones.flatMap(p => [`phone_cell.eq.${orVal(p)}`, `phone_office.eq.${orVal(p)}`]);
    const { data } = await supabase.from('clients').select(CLIENT_COLS)
      .eq('business_id', targetBusinessId).or(ors.join(',')).limit(5);
    add(data, 'phone');
  }
  const first = (src.first_name ?? '').trim();
  const last = (src.last_name ?? '').trim();
  if (first || last) {
    let q = supabase.from('clients').select(CLIENT_COLS).eq('business_id', targetBusinessId);
    if (first) q = q.ilike('first_name', likeEsc(first));
    if (last) q = q.ilike('last_name', likeEsc(last));
    const { data } = await q.limit(5);
    add(data, 'name');
  }
  const company = (src.company ?? '').trim();
  if (company) {
    const { data } = await supabase.from('clients').select(CLIENT_COLS)
      .eq('business_id', targetBusinessId).ilike('company', likeEsc(company)).limit(5);
    add(data, 'company');
  }
  return Array.from(out.values()).slice(0, 6);
}

/** Free search of the target business's clients (name / company). */
export async function searchTargetClients(
  supabase: Supa,
  targetBusinessId: string,
  query: string,
): Promise<BillThroughClient[]> {
  const q = query.trim();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean).slice(0, 3);
  let req = supabase.from('clients').select(CLIENT_COLS).eq('business_id', targetBusinessId);
  // Every word must hit first name, last name or company.
  for (const w of words) {
    const p = orVal(`%${likeEsc(w)}%`);
    req = req.or(`first_name.ilike.${p},last_name.ilike.${p},company.ilike.${p}`);
  }
  const { data } = await req.order('first_name').limit(20);
  return (data ?? []).map(toClient);
}

/** Copy the source client into the target business as a new client. */
export async function copyClientToBusiness(
  supabase: Supa,
  sourceClientId: string,
  targetBusinessId: string,
): Promise<string | null> {
  const { data: src } = await supabase.from('clients').select('*').eq('id', sourceClientId).single();
  if (!src) return null;
  const payload: Record<string, unknown> = { business_id: targetBusinessId };
  for (const f of CLIENT_COPY_FIELDS) payload[f] = (src as Record<string, unknown>)[f] ?? null;
  const { data, error } = await supabase.from('clients').insert(payload).select('id').single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

// ── Target invoices ────────────────────────────────────────────────────────

export interface OpenInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  issueDate: string | null;
  totalAmount: number;
}

/** The client's still-open invoices in the target business (draft / sent /
 *  overdue), newest first — the ones it makes sense to add lines to. */
export async function openInvoicesForClient(
  supabase: Supa,
  targetBusinessId: string,
  clientId: string,
): Promise<OpenInvoice[]> {
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, issue_date, total_amount')
    .eq('business_id', targetBusinessId)
    .eq('client_id', clientId)
    .in('status', ['draft', 'sent', 'overdue'])
    .order('created_at', { ascending: false })
    .limit(15);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    invoiceNumber: r.invoice_number ?? '',
    status: r.status,
    issueDate: r.issue_date ?? null,
    totalAmount: Number(r.total_amount) || 0,
  }));
}

// ── The copy ───────────────────────────────────────────────────────────────

export type BillThroughResult =
  | { ok: true; invoiceId: string; invoiceNumber: string; businessId: string }
  | { ok: false; error: 'not_found' | 'not_allowed' | 'no_lines' | 'duplicate' | 'failed'; message?: string };

export interface BillThroughOpts {
  sourceInvoiceId: string;
  /** Indexes into the source invoice's line_items. */
  lineIndexes: number[];
  targetBusinessId: string;
  targetClientId: string;
  /** Existing open invoice to append to; null = create a new draft. */
  targetInvoiceId: string | null;
  /** Internal note appended on the target, e.g. "3 items from Champion Built INV-1002". */
  targetNote: (count: number, sourceBusinessName: string, sourceInvoiceNumber: string) => string;
  /** Proceed even if this source invoice was already billed into the target. */
  allowDuplicate?: boolean;
}

const today = () => new Date().toISOString().split('T')[0];
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

/** Lines of `inv` already billed through from `sourceInvoiceId`. */
function hasLinesFrom(items: InvoiceLineItem[], sourceInvoiceId: string): boolean {
  return items.some(li => li.passthrough?.invoice_id === sourceInvoiceId);
}

export async function billInvoiceThrough(supabase: Supa, opts: BillThroughOpts): Promise<BillThroughResult> {
  // 1. Source invoice + its business (opt-in check).
  const { data: src } = await supabase
    .from('invoices')
    .select('id, business_id, invoice_number, line_items, billed_through')
    .eq('id', opts.sourceInvoiceId)
    .single();
  if (!src) return { ok: false, error: 'not_found' };
  if (src.business_id === opts.targetBusinessId) return { ok: false, error: 'not_allowed' };
  const { data: srcBiz } = await supabase
    .from('businesses').select('name, allow_bill_through').eq('id', src.business_id).single();
  if (!srcBiz?.allow_bill_through) return { ok: false, error: 'not_allowed' };
  const { data: tgtBiz } = await supabase
    .from('businesses')
    .select('name, invoice_template, invoice_start_number, invoice_due_days, invoice_tax_rate')
    .eq('id', opts.targetBusinessId)
    .single();
  if (!tgtBiz) return { ok: false, error: 'not_allowed' };

  // 2. Build the copied lines. Names/dates resolve the way the source's own
  //    document shows them (job title for single-line jobs, job date when the
  //    line has none). job_id is dropped: that job lives in the other business,
  //    and the job-rename trigger (219) must not touch these lines.
  const srcItems = (src.line_items ?? []) as InvoiceLineItem[];
  const picked = Array.from(new Set(opts.lineIndexes)).filter(i => i >= 0 && i < srcItems.length).sort((a, b) => a - b);
  if (!picked.length) return { ok: false, error: 'no_lines' };
  const jobIds = Array.from(new Set(srcItems.map(li => li.job_id).filter((x): x is string => !!x)));
  const titles: Record<string, string> = {};
  const dates: Record<string, string> = {};
  if (jobIds.length) {
    const { data: jobs } = await supabase.from('jobs').select('id, title, scheduled_date').in('id', jobIds);
    for (const j of (jobs ?? []) as { id: string; title: string | null; scheduled_date: string | null }[]) {
      if (j.title) titles[j.id] = j.title;
      if (j.scheduled_date) dates[j.id] = j.scheduled_date;
    }
  }
  const names = resolveLineDescriptions(srcItems as any, titles);
  const tag: PassthroughTag = {
    business_id: src.business_id,
    business_name: srcBiz.name ?? '',
    invoice_id: src.id,
    invoice_number: src.invoice_number ?? '',
  };
  const copied: InvoiceLineItem[] = picked.map(i => {
    const li = srcItems[i];
    const date = li.service_date ?? (li.job_id && !li.addon ? dates[li.job_id] : null) ?? null;
    return {
      description: li.addon ? `+ ${names[i]}` : names[i],
      qty: Number(li.qty) || 0,
      rate: Number(li.rate) || 0,
      ...(date ? { service_date: date } : {}),
      ...(li.addonNote ? { addonNote: li.addonNote } : {}),
      passthrough: tag,
    };
  });
  const note = opts.targetNote(copied.length, tag.business_name, tag.invoice_number);
  const appendNote = (existing: string | null | undefined) =>
    existing?.trim() ? `${existing.trim()}\n${note}` : note;

  // 3. Write the target invoice.
  let target: { id: string; invoice_number: string };
  if (opts.targetInvoiceId) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, invoice_number, line_items, tax_rate, discount, internal_notes')
      .eq('id', opts.targetInvoiceId)
      .single();
    if (!inv) return { ok: false, error: 'not_found' };
    const existing = (inv.line_items ?? []) as InvoiceLineItem[];
    if (!opts.allowDuplicate && hasLinesFrom(existing, src.id)) return { ok: false, error: 'duplicate' };
    const next = [...existing, ...copied];
    const { subtotal, tax, total } = computeTotals(next, inv.tax_rate ?? 0, inv.discount ?? 0);
    const { error } = await supabase
      .from('invoices')
      .update({
        line_items: next,
        subtotal_amount: subtotal,
        tax_amount: tax,
        total_amount: total,
        internal_notes: appendNote(inv.internal_notes),
      })
      .eq('id', inv.id);
    if (error) return { ok: false, error: 'failed', message: error.message };
    target = { id: inv.id, invoice_number: inv.invoice_number ?? '' };
  } else {
    const lang = invoiceDefaultLanguage(tgtBiz.invoice_template);
    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', opts.targetBusinessId);
    const taxRate = Number(tgtBiz.invoice_tax_rate) || 0;
    const { subtotal, tax, total } = computeTotals(copied, taxRate, 0);
    const { data: inv, error } = await insertInvoiceUnique(supabase, {
      business_id: opts.targetBusinessId,
      client_id: opts.targetClientId,
      invoice_number: nextInvoiceNumber(lang, tgtBiz.invoice_start_number, count ?? 0),
      status: 'draft',
      language: lang,
      issue_date: today(),
      due_date: plusDays(tgtBiz.invoice_due_days ?? 30),
      line_items: copied,
      subtotal_amount: subtotal,
      tax_rate: taxRate,
      tax_amount: tax,
      discount: 0,
      total_amount: total,
      notes: null,
      internal_notes: note,
    });
    if (error || !inv) return { ok: false, error: 'failed', message: error?.message };
    target = { id: inv.id, invoice_number: inv.invoice_number ?? '' };
  }

  // 4. Stamp the source (informational; its status/amounts are untouched).
  //    Best-effort: the copy already happened, so a failure here mustn't
  //    report the whole operation as failed.
  const stamp = {
    business_id: opts.targetBusinessId,
    business_name: tgtBiz.name ?? '',
    invoice_id: target.id,
    invoice_number: target.invoice_number,
    at: new Date().toISOString(),
  };
  const prior = Array.isArray(src.billed_through) ? src.billed_through : [];
  await supabase
    .from('invoices')
    .update({ billed_through: [...prior.filter((b: any) => b?.invoice_id !== target.id), stamp] })
    .eq('id', src.id);

  return { ok: true, invoiceId: target.id, invoiceNumber: target.invoice_number, businessId: opts.targetBusinessId };
}
