import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  InvoiceDetailScreen,
  type InvoiceDetail,
} from '@amixos/shared/screens/dashboard/InvoiceDetailScreen';
import type { InvoiceLang } from '@amixos/shared';

interface RawClient {
  first_name: string;
  last_name: string;
  email: string | null;
  phone_cell: string | null;
}
interface RawInvoice {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  line_items: { description: string; qty: number; rate: number }[];
  subtotal_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  language: InvoiceLang;
  clients: RawClient | null;
  invoice_clients: { clients: RawClient }[];
}

export default function FacturaDetailRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const mapInvoice = (raw: RawInvoice): InvoiceDetail => {
    const clientList: RawClient[] = raw.invoice_clients?.length
      ? raw.invoice_clients.map(ic => ic.clients)
      : raw.clients
        ? [raw.clients]
        : [];
    return {
      id: raw.id,
      invoiceNumber: raw.invoice_number,
      status: raw.status,
      issueDate: raw.issue_date,
      dueDate: raw.due_date,
      lineItems: raw.line_items ?? [],
      subtotalAmount: raw.subtotal_amount,
      taxRate: raw.tax_rate,
      taxAmount: raw.tax_amount,
      totalAmount: raw.total_amount,
      notes: raw.notes,
      language: raw.language ?? 'es',
      clients: clientList.map(c => ({
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phoneCell: c.phone_cell,
      })),
    };
  };

  useEffect(() => {
    if (!business) return;
    supabase
      .from('invoices')
      .select(
        '*, clients(first_name, last_name, email, phone_cell), invoice_clients(clients(first_name, last_name, email, phone_cell))',
      )
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) setInvoice(mapInvoice(data as unknown as RawInvoice));
        setLoading(false);
      });
  }, [id, business]);

  const updateStatus = async (status: 'sent' | 'paid') => {
    setUpdating(true);
    const update: any = { status };
    if (status === 'paid') update.paid_at = new Date().toISOString();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    await supabase.from('invoices').update(update).eq('id', id);
    setInvoice(prev => (prev ? { ...prev, status } : prev));
    setUpdating(false);
  };

  const businessLocation = business
    ? `${business.city ?? ''}${business.state ? `, ${business.state}` : ''}`
    : '';

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <InvoiceDetailScreen
        loading={loading}
        invoice={invoice}
        businessName={business?.name ?? ''}
        businessLocation={businessLocation}
        updating={updating}
        onBack={() => router.back()}
        onUpdateStatus={updateStatus}
        // No print button on mobile.
      />
    </SafeAreaView>
  );
}
