import { useEffect, useState } from 'react';
import { Alert, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import {
  InvoiceDetailScreen,
  type InvoiceDetail,
} from '@amixos/shared/screens/dashboard/InvoiceDetailScreen';
import type { InvoiceLang } from '@amixos/shared';
import { logAudit } from '@amixos/shared/lib/audit';
import { can } from '@amixos/shared/lib/permissions';
import {
  resolveConfig,
  buildInvoiceViewModel,
  buildInvoiceHtml,
  type InvoiceBranding,
} from '@amixos/shared/lib/invoiceTemplate';

const genToken = () =>
  Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

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
  custom_fields: Record<string, string> | null;
  clients: RawClient | null;
  invoice_clients: { clients: RawClient }[];
}

interface InvoiceFieldTemplate {
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
}

export default function FacturaDetailRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, currentRole } = useApp();
  const { t: full } = useLang();
  const tInv = full.dashboard.invoices;
  const tc = full.common;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [invoiceConfigRaw, setInvoiceConfigRaw] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const mapInvoice = (raw: RawInvoice, tpls: InvoiceFieldTemplate[]): InvoiceDetail => {
    const clientList: RawClient[] = raw.invoice_clients?.length
      ? raw.invoice_clients.map(ic => ic.clients)
      : raw.clients
        ? [raw.clients]
        : [];
    // Resolve custom fields into ordered, label-mapped, non-empty entries.
    const cf = raw.custom_fields ?? {};
    const customFields = tpls
      .map(tpl => {
        const v = cf[tpl.field_key];
        if (v == null || v === '') return null;
        const value = tpl.field_type === 'boolean'
          ? (v === 'true' ? tc.states.yes : tc.states.no)
          : v;
        return { label: tpl.field_label, value };
      })
      .filter((e): e is { label: string; value: string } => e !== null);
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
      customFields,
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
    void (async () => {
      const [{ data }, { data: tpls }] = await Promise.all([
        supabase
          .from('invoices')
          .select(
            '*, clients(first_name, last_name, email, phone_cell), invoice_clients(clients(first_name, last_name, email, phone_cell))',
          )
          .eq('id', id)
          .single(),
        supabase
          .from('invoice_field_templates')
          .select('field_key, field_label, field_type')
          .eq('business_id', business.id)
          .order('sort_order'),
      ]);
      const templateList = (tpls ?? []) as InvoiceFieldTemplate[];
      if (data) {
        setInvoice(mapInvoice(data as unknown as RawInvoice, templateList));
        const raw = data as unknown as { share_token: string | null; template_config: Record<string, unknown> | null };
        setShareToken(raw.share_token ?? null);
        setInvoiceConfigRaw(raw.template_config ?? null);
      }
      setLoading(false);
    })();
  }, [id, business]);

  const updateStatus = async (status: 'sent' | 'paid') => {
    setUpdating(true);
    const update: any = { status };
    if (status === 'paid') update.paid_at = new Date().toISOString();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    await supabase.from('invoices').update(update).eq('id', id);
    if (business) {
      void logAudit(supabase, business.id, status === 'paid' ? 'invoice.paid' : 'invoice.sent', 'invoice', id, {
        invoice_number: invoice?.invoiceNumber,
      });
    }
    setInvoice(prev => (prev ? { ...prev, status } : prev));
    setUpdating(false);
  };

  const confirmDelete = () => {
    if (!invoice || !business) return;
    Alert.alert(
      tInv.deleteTitle,
      tInv.deleteConfirm
        .replace('{{number}}', invoice.invoiceNumber)
        .replace(/<\/?strong>/g, ''),
      [
        { text: tc.buttons.cancel, style: 'cancel' },
        {
          text: tc.buttons.delete,
          style: 'destructive',
          onPress: async () => {
            void logAudit(supabase, business.id, 'invoice.deleted', 'invoice', id, {
              invoice_number: invoice.invoiceNumber,
              total_amount: invoice.totalAmount,
              status: invoice.status,
            });
            // Clear FK from jobs so the invoice can be deleted.
            await supabase.from('jobs').update({ invoice_id: null }).eq('invoice_id', id);
            await supabase.from('invoice_clients').delete().eq('invoice_id', id);
            const { error } = await supabase.from('invoices').delete().eq('id', id);
            if (error) {
              Alert.alert('', tInv.errorDelete);
              return;
            }
            router.replace('/dashboard/facturas' as never);
          },
        },
      ],
    );
  };

  const branding: InvoiceBranding = {
    name: business?.name ?? '',
    logoUrl: business?.logo_url ?? null,
    city: business?.city ?? null,
    state: business?.state ?? null,
    address: business?.address ?? null,
    postalCode: business?.postal_code ?? null,
    taxId: business?.tax_id ?? null,
    licenseNumber: business?.license_number ?? null,
    email: business?.email ?? null,
    phone: business?.phone ?? null,
    website: business?.website ?? null,
  };
  const templateConfig = resolveConfig(invoiceConfigRaw, business?.invoice_template ?? null);

  // Generate (once) + persist the public share token, freezing the resolved
  // config onto the invoice so restyling the default never changes a shared one.
  const ensureShareToken = async (): Promise<string> => {
    if (shareToken) return shareToken;
    const token = genToken();
    await supabase
      .from('invoices')
      .update({ share_token: token, template_config: invoiceConfigRaw ?? templateConfig })
      .eq('id', id);
    setShareToken(token);
    return token;
  };

  const exportPdf = async () => {
    if (!invoice) return;
    const vm = buildInvoiceViewModel(templateConfig, invoice, branding);
    const { uri } = await Print.printToFileAsync({ html: buildInvoiceHtml(vm) });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    }
  };

  const shareLink = async () => {
    const token = await ensureShareToken();
    const base = process.env.EXPO_PUBLIC_WEB_URL ?? '';
    const url = `${base}/factura/${token}`;
    await Share.share({ message: url, url });
  };

  const canDelete = can.deleteInvoice(currentRole);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <InvoiceDetailScreen
        loading={loading}
        invoice={invoice}
        branding={branding}
        templateConfig={templateConfig}
        updating={updating}
        onBack={() => router.replace('/dashboard/facturas' as never)}
        onUpdateStatus={updateStatus}
        onPrint={invoice ? exportPdf : undefined}
        onShareLink={invoice ? shareLink : undefined}
        onEdit={invoice ? () => router.push(`/dashboard/facturas/nueva?edit=${id}` as never) : undefined}
        onDelete={invoice && canDelete ? confirmDelete : undefined}
      />
    </SafeAreaView>
  );
}
