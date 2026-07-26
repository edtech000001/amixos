'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  InvoicesListScreen,
  type InvoiceListItem,
} from '@amixos/shared/screens/dashboard/InvoicesListScreen';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import { logAudit } from '@amixos/shared/lib/audit';
import { can } from '@amixos/shared/lib/permissions';
import { useLang } from '@/i18n/LangProvider';
import ImportModal from '@/components/dashboard/ImportModal';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { useScrollRestore, saveScrollAnchor } from '@/lib/useScrollRestore';

interface InvoiceClient { first_name: string; last_name: string; company: string | null; state: string | null }
interface RawInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  due_date: string | null;
  issue_date: string | null;
  created_at: string;
  sent_at: string | null;
  clients: InvoiceClient | null;
  invoice_clients: { clients: InvoiceClient }[];
}

// Primary client for company/state — the single `clients` relation if present,
// else the first of the multi-client list.
const primaryClient = (raw: RawInvoice): InvoiceClient | null =>
  raw.clients ?? raw.invoice_clients?.[0]?.clients ?? null;

// Module-level cache — survives SPA route changes, so coming back from an
// invoice detail paints the last full list instantly (no loading flash, and
// the scroll restore has the real page height) while a refresh replaces it.
let invoicesListCache: { key: string; invoices: InvoiceListItem[] } | null = null;

export default function FacturasPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, currentRole, activeLocationId } = useApp();
  const { t: full } = useLang();
  const cacheKey = business ? `${business.id}:${activeLocationId ?? 'all'}` : null;
  const [invoices, setInvoices] = useState<InvoiceListItem[]>(() =>
    cacheKey && invoicesListCache?.key === cacheKey ? invoicesListCache.invoices : []);
  const [loading, setLoading] = useState(() =>
    !(cacheKey && invoicesListCache?.key === cacheKey));
  const [importOpen, setImportOpen] = useState(false);

  // Coming back from an invoice detail lands at the top otherwise — restore
  // the list scroll position once the rows have rendered.
  useScrollRestore('invoices-list', !loading);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('import') === '1') {
      setImportOpen(true);
      params.delete('import');
      const qs = params.toString();
      window.history.replaceState(null, '', `/dashboard/facturas${qs ? `?${qs}` : ''}`);
    }
  }, []);

  const mapClientNames = (raw: RawInvoice): string | null => {
    const list = raw.invoice_clients?.length
      ? raw.invoice_clients.map(ic => `${ic.clients.first_name} ${ic.clients.last_name}`)
      : raw.clients
        ? [`${raw.clients.first_name} ${raw.clients.last_name}`]
        : [];
    return list.length ? list.join(', ') : null;
  };

  const load = async () => {
    if (!business) return;
    const businessId = business.id;
    // Flip sent invoices whose due date has passed to 'overdue' before loading,
    // so the list reflects it (the badge reads the STORED status). One UPDATE;
    // after the first pass those rows are already 'overdue' and it no-ops. So
    // overdue marking no longer depends on visiting the dashboard home.
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('invoices').update({ status: 'overdue' })
      .eq('business_id', businessId).eq('status', 'sent').lt('due_date', today);
    const raw = await fetchAllById<RawInvoice>((afterId, pageSize) => {
      let q = supabase.from('invoices')
        .select('id, invoice_number, status, total_amount, due_date, issue_date, created_at, sent_at, line_items, clients(first_name, last_name, company, state), invoice_clients(clients(first_name, last_name, company, state)), jobs(external_ref, title)')
        .eq('business_id', businessId);
      if (activeLocationId) q = q.eq('location_id', activeLocationId);
      q = q.order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    });
    const mapped: InvoiceListItem[] = raw.map(inv => {
      const pc = primaryClient(inv);
      return {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        status: inv.status,
        totalAmount: inv.total_amount,
        dueDate: inv.due_date,
        sentAt: inv.sent_at,
        clientNames: mapClientNames(inv),
        company: pc?.company ?? null,
        state: pc?.state ?? null,
        issueDate: inv.issue_date ?? inv.created_at?.slice(0, 10) ?? null,
        // Line names + linked jobs' Project IDs/titles feed the search box.
        searchExtra: [
          ...(((inv as any).line_items ?? []) as { description?: string }[]).map(li => li.description ?? ''),
          ...(((inv as any).jobs ?? []) as { external_ref: string | null; title: string | null }[]).flatMap(j => [j.external_ref ?? '', j.title ?? '']),
        ].filter(Boolean).join(' '),
      };
    });
    setInvoices(mapped);
    setLoading(false);
    invoicesListCache = { key: `${businessId}:${activeLocationId ?? 'all'}`, invoices: mapped };
  };

  useEffect(() => { load(); }, [business, activeLocationId]);

  const updateStatus = async (id: string, status: 'sent' | 'paid') => {
    if (!can.editInvoice(currentRole)) return;
    const update: any = { status };
    if (status === 'paid') update.paid_at = new Date().toISOString();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    await supabase.from('invoices').update(update).eq('id', id);
    if (business) {
      void logAudit(supabase, business.id, status === 'paid' ? 'invoice.paid' : 'invoice.sent', 'invoice', id, {
        invoice_number: invoices.find(inv => inv.id === id)?.invoiceNumber,
      });
    }
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status } : inv));
  };

  return (
    <>
    {business && (
      <ImportModal
        open={importOpen}
        mode="invoices"
        businessId={business.id}
        supabase={supabase}
        invoiceTemplate={business.invoice_template}
        onClose={() => setImportOpen(false)}
        onDone={load}
      />
    )}
    <InvoicesListScreen
      loading={loading}
      invoices={invoices}
      onInvoicePress={(id) => { saveScrollAnchor('invoices-list', id); router.push(`/dashboard/facturas/${id}`); }}
      onNewInvoicePress={can.createInvoice(currentRole) ? () => router.push('/dashboard/facturas/nueva') : undefined}
      onPriceSheetPress={() => router.push('/dashboard/precios')}
      onUpdateStatus={updateStatus}
      businessId={business?.id}
      onBulkDelete={
        can.deleteInvoice(currentRole)
          ? async (ids) => {
              if (!business) return;
              const msg = full.dashboard.invoices.confirmDeleteBulk.replace('{{count}}', String(ids.length));
              if (!(await confirm({ message: msg, destructive: true }))) return;
              for (let i = 0; i < ids.length; i += 50) {
                const chunk = ids.slice(i, i + 50);
                // Mirror the single-delete: revert linked jobs to Completed
                // (else they'd be stranded "invoiced" with no invoice), drop
                // the client links, then the invoices. Payments cascade.
                await supabase.from('jobs').update({ status: 'completed', invoice_id: null, invoiced_at: null }).in('invoice_id', chunk);
                await supabase.from('invoice_clients').delete().in('invoice_id', chunk);
                await supabase.from('invoices').delete().in('id', chunk);
              }
              void logAudit(supabase, business.id, 'invoice.deleted', 'invoice', null, { count: ids.length, bulk: true });
              await load();
            }
          : undefined
      }
    />
    </>
  );
}
