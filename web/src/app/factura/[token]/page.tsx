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
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
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
  custom_fields: Record<string, string> | null;
  // Optional: resolved {key,label,value}[] from the RPC (migration 067) — gives
  // the structured "Custom fields" section proper labels on the public page.
  custom_fields_resolved: { key: string; label: string; value: string }[] | null;
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
      // Token-gated RPC (061): anon has no direct read on invoices — the
      // function returns only the one record matching this token, shaped to
      // match the previous embed (clients / invoice_clients / businesses).
      const { data } = await supabase.rpc('get_shared_invoice', { p_token: token });
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

  // The browser uses document.title as the default "Save as PDF" filename, so
  // name the tab after the invoice number (e.g. INV-258643 → INV-258643.pdf)
  // instead of the site title. Restore the previous title on unmount.
  useEffect(() => {
    const num = (raw?.invoice_number ?? '').trim();
    if (!num) return;
    const prev = document.title;
    document.title = num;
    return () => { document.title = prev; };
  }, [raw]);

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

  // Custom fields: prefer the RPC's resolved {key,label,value} (proper labels);
  // otherwise build from the raw custom_fields map (freeform elements still get
  // nice labels from their own snapshot).
  const customFields = raw.custom_fields_resolved?.length
    ? raw.custom_fields_resolved.filter(f => f.value != null && f.value !== '')
    : Object.entries(raw.custom_fields ?? {})
        .filter(([, v]) => v != null && v !== '')
        .map(([key, value]) => ({ key, label: key, value: String(value) }));

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
      company: c.company,
      address: c.address,
      city: c.city,
      state: c.state,
      zip: c.zip_code,
    })),
    customFields,
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
      {/* Full-bleed on print: drop the @page margin and the on-screen max width
          so the letter-ratio page fills the sheet edge-to-edge — otherwise the
          corner decoration stops short of the paper's bottom-right corner. */}
      <style>{'@media print{@page{margin:10mm 10mm 22mm}.inv-doc-page{aspect-ratio:auto!important;overflow:visible!important;display:block!important}.inv-doc-page>*{flex:0 0 auto!important}.inv-footerbar{position:fixed!important;left:0;right:0;bottom:0;margin:0!important}}'}</style>
      <div className="max-w-3xl mx-auto py-10 px-6 print:py-0 print:px-0 print:max-w-none">
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
