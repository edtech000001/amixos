// Carries out an Ami action draft on the CLIENT with the same shared helpers
// the app's own screens use, and returns how to undo it ("deshaz eso").

import {
  addJobsToInvoice, createInvoicesFromJobs, removeJobFromInvoice, type InvoiceLineItem,
} from '../lib/invoicing';
import { createQuickQuote } from '../lib/quickQuote';
import { logClientCommunication, deleteClientCommunication } from '../lib/clientCommunications';
import { logAudit } from '../lib/audit';
import type { ActionDraft } from './types';

type Supa = { from: (table: string) => any };

/** What the platform hands the assistant so drafts can be applied locally. */
export interface AssistantLocalEnv {
  supabase: Supa;
  businessId: string;
  userId: string | null;
  locationId: string | null;
  business: {
    invoice_template?: unknown;
    invoice_start_number?: number;
    invoice_due_days?: number | null;
    job_item_types_enabled?: boolean | null;
    invoice_tax_rate?: number | null;
    invoice_qty_field?: string | null;
  };
  labels: {
    itemTypes: Record<string, string>;
    /** "Trabajos" — seeds new invoice notes, same as the jobs list. */
    notesLabel: string;
    /** Payment method key → the stored (translated) name. */
    payMethods: Record<string, string>;
  };
}

export interface Applied {
  /** Record to open from the card (invoice / job / client id). */
  id: string;
  undo?: () => Promise<void>;
}

export async function applyAction(env: AssistantLocalEnv, draft: ActionDraft): Promise<Applied> {
  const { supabase } = env;

  if (draft.action === 'invoice_jobs') {
    const { job_ids, to_invoice_id } = draft.params;
    const common = {
      itemTypeLabels: env.labels.itemTypes,
      hideItemTypes: env.business.job_item_types_enabled === false,
      qtyField: env.business.invoice_qty_field ?? null,
    };
    if (to_invoice_id) {
      const { data: inv } = await supabase.from('invoices').select('id, status, client_id, line_items, tax_rate, discount').eq('id', to_invoice_id).maybeSingle();
      if (inv?.status !== 'draft') throw new Error('Esa factura ya fue enviada.');
      const res = await addJobsToInvoice(supabase, { invoice: inv as { id: string; client_id: string | null; line_items: InvoiceLineItem[] | null }, jobIds: job_ids, ...common });
      if (!res.ok) throw new Error('No pude agregar los trabajos a la factura.');
      return {
        id: to_invoice_id,
        undo: async () => {
          for (const jobId of job_ids) await removeJobFromInvoice(supabase, { jobId, invoice: { id: to_invoice_id, line_items: null } });
        },
      };
    }
    const res = await createInvoicesFromJobs(supabase, {
      businessId: env.businessId,
      jobIds: job_ids,
      invoiceTemplate: env.business.invoice_template,
      startNumber: env.business.invoice_start_number,
      dueDays: env.business.invoice_due_days,
      taxRate: env.business.invoice_tax_rate ?? 0,
      notesLabel: env.labels.notesLabel,
      ...common,
    });
    if (!res.ok) throw new Error('No pude crear la factura.');
    const ids = res.invoices.map((i: { id: string }) => i.id);
    for (const inv of res.invoices) void logAudit(supabase as never, env.businessId, 'invoice.created', 'invoice', inv.id, { invoice_number: inv.invoice_number, source: 'assistant' });
    return {
      id: ids[0],
      // Same as deleting the invoice in the app: jobs back to Completed,
      // client links, then the invoice. Refused once it has been sent.
      undo: async () => {
        const { data: now } = await supabase.from('invoices').select('id, status').in('id', ids);
        if ((now ?? []).some((i: { status: string }) => i.status !== 'draft')) throw new Error('La factura ya se envió — no la puedo borrar.');
        await supabase.from('jobs').update({ status: 'completed', invoice_id: null, invoiced_at: null }).in('invoice_id', ids);
        await supabase.from('invoice_clients').delete().in('invoice_id', ids);
        const { error } = await supabase.from('invoices').delete().in('id', ids);
        if (error) throw error;
      },
    };
  }

  if (draft.action === 'payment') {
    const p = draft.params;
    const method = env.labels.payMethods[p.method] ?? p.method;
    const { data, error } = await supabase.from('invoice_payments')
      .insert({ business_id: env.businessId, invoice_id: p.invoice_id, amount: p.amount, method, paid_on: p.paid_on })
      .select('id').single();
    if (error || !data) throw new Error('No pude registrar el pago.');
    // Paid status follows the ledger in the DB (migration 264); the method
    // summary is what the invoice screen also writes when fully paid.
    const { data: inv } = await supabase.from('invoices').select('status, payment_method').eq('id', p.invoice_id).maybeSingle();
    if (inv?.status === 'paid' && !inv.payment_method) {
      await supabase.from('invoices').update({ payment_method: method }).eq('id', p.invoice_id);
    }
    void logAudit(supabase as never, env.businessId, 'invoice.payment', 'invoice', p.invoice_id, { amount: p.amount, method, source: 'assistant' });
    return {
      id: p.invoice_id,
      undo: async () => {
        const { error: delErr } = await supabase.from('invoice_payments').delete().eq('id', data.id);
        if (delErr) throw delErr;
      },
    };
  }

  if (draft.action === 'quick_quote') {
    const p = draft.params;
    const id = await createQuickQuote(supabase as never, {
      businessId: env.businessId, locationId: env.locationId, userId: env.userId,
      clientId: p.client_id, title: p.title, price: p.price, notes: p.notes ?? '',
    });
    if (!id) throw new Error('No pude guardar la cotización.');
    return { id, undo: async () => { await supabase.from('jobs').delete().eq('id', id).eq('status', 'posible'); } };
  }

  if (draft.action === 'client_note') {
    const p = draft.params;
    const row = await logClientCommunication(supabase as never, {
      businessId: env.businessId, clientId: p.client_id, type: p.type, outcome: p.outcome, note: p.note, createdBy: env.userId,
    });
    if (!row) throw new Error('No pude guardar la nota.');
    return { id: p.client_id, undo: async () => { await deleteClientCommunication(supabase as never, row.id); } };
  }

  // client_create
  const { data, error } = await supabase.from('clients')
    .insert({ business_id: env.businessId, ...draft.params }).select('id').single();
  if (error || !data) throw new Error('No pude crear el cliente.');
  return { id: data.id, undo: async () => { await supabase.from('clients').delete().eq('id', data.id); } };
}
