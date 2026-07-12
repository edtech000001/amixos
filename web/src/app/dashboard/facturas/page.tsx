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
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { logAudit } from '@amixos/shared/lib/audit';
import { can } from '@amixos/shared/lib/permissions';
import { useLang } from '@/i18n/LangProvider';
import ImportModal from '@/components/dashboard/ImportModal';

interface InvoiceClient { first_name: string; last_name: string; company: string | null; state: string | null }
interface RawInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  due_date: string | null;
  issue_date: string | null;
  created_at: string;
  clients: InvoiceClient | null;
  invoice_clients: { clients: InvoiceClient }[];
}

// Primary client for company/state — the single `clients` relation if present,
// else the first of the multi-client list.
const primaryClient = (raw: RawInvoice): InvoiceClient | null =>
  raw.clients ?? raw.invoice_clients?.[0]?.clients ?? null;

export default function FacturasPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, currentRole } = useApp();
  const { t: full } = useLang();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

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
    const raw = await fetchAll<RawInvoice>((from, to) =>
      supabase.from('invoices')
        .select('id, invoice_number, status, total_amount, due_date, issue_date, created_at, line_items, clients(first_name, last_name, company, state), invoice_clients(clients(first_name, last_name, company, state)), jobs(external_ref, title)')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .range(from, to));
    setInvoices(raw.map(inv => {
      const pc = primaryClient(inv);
      return {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        status: inv.status,
        totalAmount: inv.total_amount,
        dueDate: inv.due_date,
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
    }));
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  const updateStatus = async (id: string, status: 'sent' | 'paid') => {
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
      onInvoicePress={(id) => router.push(`/dashboard/facturas/${id}`)}
      onNewInvoicePress={() => router.push('/dashboard/facturas/nueva')}
      onPriceSheetPress={() => router.push('/dashboard/precios')}
      onUpdateStatus={updateStatus}
      businessId={business?.id}
      onBulkDelete={
        can.deleteInvoice(currentRole)
          ? async (ids) => {
              if (!business) return;
              const msg = full.dashboard.invoices.confirmDeleteBulk.replace('{{count}}', String(ids.length));
              if (!window.confirm(msg)) return;
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
