// Applies an Ami invoice-edit draft on the CLIENT with the same invoicing
// helpers the invoice screen uses (saveInvoiceLines recomputes totals with
// computeTotals, retries on concurrent saves, and detects RLS refusals).
// The API only drafts invoice edits; it never writes invoices.

import { saveInvoiceLines, moveJobToInvoice, replaceJobAddonLines, normStateCode, type InvoiceLineItem } from '../lib/invoicing';
import { addonChoices, currentAddonIds, toggledRate, toggleInlineFlat, foldedFlat, addonSave } from '../lib/lineAddons';
import { rowToPriceSheetItem, type PriceSheetRow, type RateContext } from '../lib/priceSheet';
import { lineItemsHash, type InvoiceEditDraft } from './types';

type Supa = { from: (table: string) => any };

const SENT = 'Esa factura ya fue enviada — ya no puedo cambiarla.';
const STALE = 'La factura cambió desde que la leí — pídemelo de nuevo.';

type Undo = (() => Promise<void>) | undefined;

/** Put the lines back as they were — only if nobody changed them since. */
const restoreLines = (supabase: Supa, invoiceId: string, before: InvoiceLineItem[], after: InvoiceLineItem[]) => async () => {
  await saveInvoiceLines(supabase, invoiceId, (items, inv) => {
    if (inv?.status !== 'draft') throw new Error(SENT);
    if (lineItemsHash(items) !== lineItemsHash(after)) throw new Error('La factura cambió después — ya no puedo deshacerlo.');
    return before;
  });
};

/** Applies the draft; resolves how to undo it (undefined = can't, e.g. a move). */
export async function applyInvoiceEdit(supabase: Supa, draft: InvoiceEditDraft): Promise<Undo> {
  // Ami saw these exact lines; indexes are only valid against them.
  const guard = (items: InvoiceLineItem[], inv: { status?: string }) => {
    if (inv?.status !== 'draft') throw new Error(SENT);
    if (lineItemsHash(items) !== draft.snapshot_hash) throw new Error(STALE);
  };

  const client = draft.ops.find(o => o.op === 'client');
  if (client?.op === 'client') return applyClient(supabase, draft, client.client_id, guard);

  const addons = draft.ops.find(o => o.op === 'addons');
  if (addons?.op === 'addons') return applyAddons(supabase, draft, addons, guard);

  const move = draft.ops.find(o => o.op === 'move');
  if (move?.op === 'move') {
    const { data: to } = await supabase.from('invoices').select('status').eq('id', move.to_invoice_id).maybeSingle();
    if (to?.status !== 'draft') throw new Error('La factura de destino ya fue enviada.');
    const { data: src } = await supabase.from('invoices').select('status, line_items').eq('id', draft.invoice_id).maybeSingle();
    const lines = (src?.line_items ?? []) as InvoiceLineItem[];
    guard(lines, src ?? {});
    const line = lines[move.index];
    if (!line) throw new Error(STALE);
    if (line.job_id) {
      // A job's lines bill together — move the whole job (repoints jobs.invoice_id).
      await moveJobToInvoice(supabase, {
        jobId: line.job_id,
        from: { id: draft.invoice_id, line_items: null },
        to: { id: move.to_invoice_id, line_items: null },
      });
      return undefined;
    }
    // Manual line: destination first, so a failure leaves it on both, never neither.
    await saveInvoiceLines(supabase, move.to_invoice_id, items => [...items, line]);
    await saveInvoiceLines(supabase, draft.invoice_id, (items, inv) => {
      guard(items, inv);
      return items.filter((_, i) => i !== move.index);
    });
    return undefined;
  }

  const res = await saveInvoiceLines(supabase, draft.invoice_id, (items, inv) => {
    guard(items, inv);
    const next = items.map(li => ({ ...li }));
    const removed = new Set<number>();
    const added: InvoiceLineItem[] = [];
    for (const op of draft.ops) {
      if (op.op === 'add') {
        added.push({ description: op.description, qty: op.qty, rate: op.rate });
        continue;
      }
      if (op.op === 'move' || op.op === 'addons' || op.op === 'client') continue;
      const li = next[op.index];
      if (!li) throw new Error(STALE);
      if (op.op === 'remove') removed.add(op.index);
      else if (op.op === 'exclude') li.excluded = op.excluded;
      else {
        if (op.description !== undefined) li.description = op.description;
        if (op.qty !== undefined) li.qty = op.qty;
        if (op.rate !== undefined) li.rate = op.rate;
        // A hand-set price no longer matches the auto-priced add-on breakdown
        // (same rule as Edit item).
        if (op.qty !== undefined || op.rate !== undefined) {
          li.addonNote = null;
          (li as { priceBasis?: unknown }).priceBasis = null;
        }
        if (li.job_id) li.edited = true;
      }
    }
    // A job that loses some (not all) of its lines: freeze the rest so the
    // draft rebuild doesn't re-derive the removed one from job_items.
    const touchedJobs = new Set(Array.from(removed, i => next[i].job_id).filter(Boolean));
    const kept = next.filter((_, i) => !removed.has(i))
      .map(li => (li.job_id && touchedJobs.has(li.job_id) ? { ...li, edited: true } : li));
    return [...kept, ...added];
  });
  if (!res?.saved) return undefined;

  const { before, after } = res;
  // A job with no lines left is detached (back to completed), like
  // "Remove from invoice" — otherwise the rebuild would put it right back.
  const gone = Array.from(new Set(before.map(l => l.job_id).filter((j): j is string => !!j)))
    .filter(j => !after.some(l => l.job_id === j));
  const renamed = draft.ops.flatMap(op => (op.op === 'update' && op.description !== undefined && before[op.index]?.job_id ? [before[op.index].job_id as string] : []));
  const touched = Array.from(new Set([...gone, ...renamed]));
  const { data: jobsBefore } = touched.length
    ? await supabase.from('jobs').select('id, status, invoice_id, invoiced_at, title').in('id', touched)
    : { data: [] };
  for (const jobId of gone) {
    await supabase.from('jobs').update({ status: 'completed', invoice_id: null, invoiced_at: null }).eq('id', jobId);
  }
  // A job billed as a single line shares its name with the line — keep the
  // job's title in sync, as Edit item does.
  for (const op of draft.ops) {
    if (op.op !== 'update' || op.description === undefined) continue;
    const li = before[op.index];
    if (!li?.job_id || li.addon) continue;
    if (before.filter(l => l.job_id === li.job_id && !l.addon).length !== 1) continue;
    const title = op.description.trim();
    if (title) await supabase.from('jobs').update({ title }).eq('id', li.job_id);
  }
  return async () => {
    await restoreLines(supabase, draft.invoice_id, before, after)();
    for (const j of (jobsBefore ?? []) as { id: string }[]) {
      const { id, ...rest } = j as Record<string, unknown> & { id: string };
      await supabase.from('jobs').update(rest).eq('id', id);
    }
  };
}

/** Add-on toggles for one line — the exact sequence of Edit item → Add-ons:
 *  each toggle adjusts qty/rate/basis (per-unit folds into the rate, inline
 *  flat bundles), then addonSave + the flat "+ name" lines on save. */
async function applyAddons(
  supabase: Supa,
  draft: InvoiceEditDraft,
  op: { index: number; on: string[]; off: string[] },
  guard: (items: InvoiceLineItem[], inv: { status?: string }) => void,
): Promise<Undo> {
  const { data: inv } = await supabase.from('invoices').select('business_id, client_id, line_items').eq('id', draft.invoice_id).maybeSingle();
  if (!inv) throw new Error(STALE);
  const line0 = ((inv.line_items ?? []) as InvoiceLineItem[])[op.index];
  const [{ data: rows }, { data: job }, { data: client }] = await Promise.all([
    supabase.from('price_sheet_items')
      .select('id, name, category, pricing_mode, unit_label, rate, state_rates, client_rates, match_terms, is_addon, addon_inline, sort_order, active')
      .eq('business_id', inv.business_id).eq('active', true),
    line0?.job_id ? supabase.from('jobs').select('job_state').eq('id', line0.job_id).maybeSingle() : Promise.resolve({ data: null }),
    inv.client_id ? supabase.from('clients').select('state').eq('id', inv.client_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const items = ((rows ?? []) as PriceSheetRow[]).map(rowToPriceSheetItem);
  // Same rate context as Edit item: job's state, else the client's; client prices win.
  const ctx: RateContext = {
    state: normStateCode(job?.job_state) ?? normStateCode(client?.state),
    clientId: inv.client_id ?? null,
  };

  const res = await saveInvoiceLines(supabase, draft.invoice_id, (lines, cur) => {
    guard(lines, cur);
    const line = lines[op.index];
    if (!line || line.addon) throw new Error(STALE);
    const choices = addonChoices(items, line);
    const byId = new Map(choices.map(a => [a.id, a]));
    const missing = [...op.on, ...op.off].find(id => !byId.has(id));
    if (missing) {
      const name = items.find(i => i.id === missing)?.name ?? missing;
      throw new Error(`El add-on "${name}" no aplica a esa línea.`);
    }
    let picked = currentAddonIds(lines, op.index, choices);
    let price = { qty: Number(line.qty) || 1, rate: Number(line.rate) || 0, basis: line.priceBasis ?? null };
    const toggle = (id: string, on: boolean) => {
      if (picked.includes(id) === on) return; // already in that state
      const a = byId.get(id)!;
      if (a.pricingMode !== 'flat') price = { ...price, rate: Number(toggledRate(String(price.rate), a, on, ctx)) };
      else if (foldedFlat(a, line)) {
        const otherOn = choices.some(o => o.id !== a.id && foldedFlat(o, line) && picked.includes(o.id));
        price = toggleInlineFlat(price, a, on, ctx, otherOn);
      }
      picked = on ? [...picked, id] : picked.filter(x => x !== id);
    };
    op.off.forEach(id => toggle(id, false));
    op.on.forEach(id => toggle(id, true));

    const { addonNote, flatAddons } = addonSave(choices, picked, ctx, line);
    const mapped = lines.map((li, i) => (i === op.index
      ? {
          ...li,
          qty: price.qty,
          rate: price.rate,
          addonNote,
          priceBasis: price.basis && price.qty === 1 ? price.basis : null,
          ...(li.job_id ? { edited: true } : {}),
        }
      : li));
    return mapped[op.index].job_id ? replaceJobAddonLines(mapped, op.index, flatAddons.managed, flatAddons.chosen) : mapped;
  });
  return res?.saved ? restoreLines(supabase, draft.invoice_id, res.before, res.after) : undefined;
}

/** Re-bill the invoice to another client — the same writes as the invoice
 *  edit form (client_id + replace invoice_clients) — and move its jobs too. */
async function applyClient(
  supabase: Supa,
  draft: InvoiceEditDraft,
  clientId: string,
  guard: (items: InvoiceLineItem[], inv: { status?: string }) => void,
): Promise<Undo> {
  const { data: inv } = await supabase.from('invoices').select('status, line_items, billed_through, client_id').eq('id', draft.invoice_id).maybeSingle();
  if (!inv) throw new Error(STALE);
  guard((inv.line_items ?? []) as InvoiceLineItem[], inv);
  if (((inv.line_items ?? []) as { passthrough?: unknown }[]).some(l => l.passthrough) || (inv.billed_through ?? []).length) {
    throw new Error('Esta factura tiene líneas facturadas a través de otra empresa — cambia el cliente desde la pantalla de la factura.');
  }
  // Undo snapshot: the old client, its client links and each job's client.
  const [{ data: links }, { data: jobs }] = await Promise.all([
    supabase.from('invoice_clients').select('client_id').eq('invoice_id', draft.invoice_id),
    supabase.from('jobs').select('id, client_id').eq('invoice_id', draft.invoice_id),
  ]);
  const { data: hit, error } = await supabase.from('invoices').update({ client_id: clientId }).eq('id', draft.invoice_id).select('id');
  if (error) throw error;
  if (!hit?.length) throw new Error('No tienes permiso para cambiar esta factura.');
  const { error: delErr } = await supabase.from('invoice_clients').delete().eq('invoice_id', draft.invoice_id);
  if (delErr) throw delErr;
  const { error: insErr } = await supabase.from('invoice_clients').insert([{ invoice_id: draft.invoice_id, client_id: clientId }]);
  if (insErr) throw insErr;
  const { error: jobErr } = await supabase.from('jobs').update({ client_id: clientId }).eq('invoice_id', draft.invoice_id);
  if (jobErr) throw jobErr;
  return async () => {
    await supabase.from('invoices').update({ client_id: inv.client_id ?? null }).eq('id', draft.invoice_id);
    await supabase.from('invoice_clients').delete().eq('invoice_id', draft.invoice_id);
    const rows = ((links ?? []) as { client_id: string }[]).map(l => ({ invoice_id: draft.invoice_id, client_id: l.client_id }));
    if (rows.length) await supabase.from('invoice_clients').insert(rows);
    for (const j of (jobs ?? []) as { id: string; client_id: string | null }[]) {
      await supabase.from('jobs').update({ client_id: j.client_id }).eq('id', j.id);
    }
  };
}
