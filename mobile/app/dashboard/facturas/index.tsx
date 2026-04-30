import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  InvoicesListScreen,
  type InvoiceListItem,
} from '@amixos/shared/screens/dashboard/InvoicesListScreen';

interface InvoiceClient { first_name: string; last_name: string; }
interface RawInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  due_date: string | null;
  created_at: string;
  clients: InvoiceClient | null;
  invoice_clients: { clients: InvoiceClient }[];
}

export default function FacturasTab() {
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
    const { data } = await supabase.from('invoices')
      .select('id, invoice_number, status, total_amount, due_date, created_at, clients(first_name, last_name), invoice_clients(clients(first_name, last_name))')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    const raw = (data ?? []) as unknown as RawInvoice[];
    setInvoices(raw.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      status: inv.status,
      totalAmount: inv.total_amount,
      dueDate: inv.due_date,
      clientNames: mapClientNames(inv),
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  const updateStatus = async (id: string, status: 'sent' | 'paid') => {
    const update: any = { status };
    if (status === 'paid') update.paid_at = new Date().toISOString();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    await supabase.from('invoices').update(update).eq('id', id);
    setInvoices(prev => prev.map(inv => (inv.id === id ? { ...inv, status } : inv)));
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <InvoicesListScreen
        loading={loading}
        invoices={invoices}
        onInvoicePress={(id) => router.push(`/dashboard/facturas/${id}`)}
        onNewInvoicePress={() => Alert.alert('Coming soon', 'Create invoice from mobile not yet built')}
        onUpdateStatus={updateStatus}
      />
    </SafeAreaView>
  );
}
