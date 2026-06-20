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
  const { business } = useApp();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);

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
        .select('id, invoice_number, status, total_amount, due_date, issue_date, created_at, clients(first_name, last_name, company, state), invoice_clients(clients(first_name, last_name, company, state))')
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
    <InvoicesListScreen
      loading={loading}
      invoices={invoices}
      onInvoicePress={(id) => router.push(`/dashboard/facturas/${id}`)}
      onNewInvoicePress={() => router.push('/dashboard/facturas/nueva')}
      onUpdateStatus={updateStatus}
    />
  );
}
