'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';
import { InvoiceDocument } from '@amixos/shared/screens/dashboard/InvoiceDocument';
import {
  resolveConfig,
  buildInvoiceViewModel,
  type InvoiceBranding,
  type InvoiceDocData,
} from '@amixos/shared/lib/invoiceTemplate';
import type { InvoiceLang } from '@amixos/shared';

interface RawClient {
  first_name: string;
  last_name: string;
  email: string | null;
  phone_cell: string | null;
}
interface RawBusiness {
  name: string;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  postal_code: string | null;
  tax_id: string | null;
  license_number: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  invoice_template: Record<string, unknown> | null;
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
  template_config: Record<string, unknown> | null;
  clients: RawClient | null;
  invoice_clients: { clients: RawClient }[];
  businesses: RawBusiness | null;
}

export default function PublicInvoicePage({ params }: { params: { token: string } }) {
  const { token } = params;
  const { t: full } = useLang();
  const tInv = full.dashboard.invoices;
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get('print') === '1';

  const [raw, setRaw] = useState<RawInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createSupabaseClient();
      const { data } = await supabase
        .from('invoices')
        .select(
          '*, clients(first_name, last_name, email, phone_cell), invoice_clients(clients(first_name, last_name, email, phone_cell)), businesses(name, logo_url, city, state, address, postal_code, tax_id, license_number, email, phone, website, invoice_template)',
        )
        .eq('share_token', token)
        .single();
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setRaw(data as unknown as RawInvoice);
      setLoading(false);
    };
    void load();
  }, [token]);

  useEffect(() => {
    if (!loading && raw && autoPrint) {
      const id = setTimeout(() => window.print(), 500);
      return () => clearTimeout(id);
    }
  }, [loading, raw, autoPrint]);

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );

  if (notFound || !raw)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg font-semibold text-gray-900">{tInv.notFound}</p>
      </div>
    );

  const clientList: RawClient[] = raw.invoice_clients?.length
    ? raw.invoice_clients.map(ic => ic.clients)
    : raw.clients
      ? [raw.clients]
      : [];

  const invoice: InvoiceDocData = {
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

  const b = raw.businesses;
  const branding: InvoiceBranding = {
    name: b?.name ?? '',
    logoUrl: b?.logo_url ?? null,
    city: b?.city ?? null,
    state: b?.state ?? null,
    address: b?.address ?? null,
    postalCode: b?.postal_code ?? null,
    taxId: b?.tax_id ?? null,
    licenseNumber: b?.license_number ?? null,
    email: b?.email ?? null,
    phone: b?.phone ?? null,
    website: b?.website ?? null,
  };

  const config = resolveConfig(raw.template_config, b?.invoice_template ?? null);
  const vm = buildInvoiceViewModel(config, invoice, branding);

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <div className="max-w-3xl mx-auto py-10 px-6 print:py-0 print:px-0">
        <div className="bg-white rounded-2xl print:rounded-none border border-gray-100 print:border-0 shadow-sm print:shadow-none overflow-hidden">
          <InvoiceDocument vm={vm} />
        </div>
        <div className="text-center print:hidden mt-8">
          <button
            onClick={() => window.print()}
            className="px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors"
          >
            {tInv.print}
          </button>
        </div>
      </div>
    </div>
  );
}
