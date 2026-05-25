'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/i18n/LangProvider';
import {
  InvoiceDetailScreen,
  type InvoiceDetail,
} from '@amixos/shared/screens/dashboard/InvoiceDetailScreen';
import type { InvoiceLang } from '@amixos/shared';
import { logAudit } from '@amixos/shared/lib/audit';
import { can } from '@amixos/shared/lib/permissions';

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

export default function FacturaDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, currentRole } = useApp();
  const { t: full } = useLang();
  const tInv = full.dashboard.invoices;
  const tc = full.common;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
    supabase.from('invoices')
      .select('*, clients(first_name, last_name, email, phone_cell), invoice_clients(clients(first_name, last_name, email, phone_cell))')
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
    setInvoice(prev => prev ? { ...prev, status } : prev);
    setUpdating(false);
  };

  const deleteInvoice = async () => {
    if (!business || !invoice) return;
    setDeleting(true);
    setDeleteError('');
    void logAudit(supabase, business.id, 'invoice.deleted', 'invoice', id, {
      invoice_number: invoice.invoiceNumber,
      total_amount: invoice.totalAmount,
      status: invoice.status,
    });
    // Clear the FK from any related jobs first so the invoice can be deleted
    // without a constraint violation.
    await supabase.from('jobs').update({ invoice_id: null }).eq('invoice_id', id);
    await supabase.from('invoice_clients').delete().eq('invoice_id', id);
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) {
      setDeleteError(tInv.errorDelete);
      setDeleting(false);
      return;
    }
    router.push('/dashboard/facturas');
  };

  const businessLocation = business
    ? `${business.city ?? ''}${business.state ? `, ${business.state}` : ''}`
    : '';

  const canDelete = can.deleteInvoice(currentRole);

  return (
    <>
      <InvoiceDetailScreen
        loading={loading}
        invoice={invoice}
        businessName={business?.name ?? ''}
        businessLocation={businessLocation}
        updating={updating}
        onBack={() => router.push('/dashboard/facturas')}
        onUpdateStatus={updateStatus}
        onPrint={() => window.print()}
        onEdit={invoice ? () => router.push(`/dashboard/facturas/nueva?edit=${id}`) : undefined}
        onDelete={invoice && canDelete ? () => setDeleteOpen(true) : undefined}
      />

      {/* Delete confirmation modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={tInv.deleteTitle} size="sm">
        <div className="flex flex-col gap-4">
          <p
            className="text-sm text-gray-600"
            dangerouslySetInnerHTML={{
              __html: tInv.deleteConfirm.replace('{{number}}', invoice?.invoiceNumber ?? ''),
            }}
          />
          {deleteError ? <p className="text-sm text-red-500">{deleteError}</p> : null}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} fullWidth>
              {tc.buttons.cancel}
            </Button>
            <button
              onClick={deleteInvoice}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {deleting ? tInv.deleting : tc.buttons.delete}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
