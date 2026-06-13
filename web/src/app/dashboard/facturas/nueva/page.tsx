'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Trash2, ArrowLeft, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { InvoiceLang } from '@amixos/shared';
import { invoiceDefaultLanguage } from '@amixos/shared/lib/invoiceTemplate';
import { useLang } from '@/i18n/LangProvider';
import { useDirty, useUnsavedChanges } from '@/lib/useUnsavedChanges';

interface LineItem { description: string; qty: number; rate: number; }
interface Client { id: string; first_name: string; last_name: string; }
interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
}

const EMPTY_LINE: LineItem = { description: '', qty: 1, rate: 0 };

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function genInvoiceNumber() {
  const now = new Date();
  return `FAC-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`;
}

// Add `days` to a "YYYY-MM-DD" date (parsed as local to avoid UTC drift).
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function NuevaFacturaPage() {
  return (
    <Suspense fallback={<div className="p-6">…</div>}>
      <NuevaFacturaContent />
    </Suspense>
  );
}

function NuevaFacturaContent() {
  const { t: full } = useLang();
  const t = full.dashboard.invoices.new;
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const [clients, setClients] = useState<Client[]>([]);
  const initialClient = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('client') : null;
  const [clientIds, setClientIds] = useState<string[]>(initialClient ? [initialClient] : []);
  const [invoiceNumber, setInvoiceNumber] = useState(genInvoiceNumber());
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [language, setLanguage] = useState<InvoiceLang>('es');
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [customTemplates, setCustomTemplates] = useState<FieldTemplate[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  // Default due date — runs once on a NEW invoice: if the business set a
  // default due window and the due date is still empty, set it to issue +
  // N days. The ref guard means changing the issue date afterward never
  // re-derives the due date (the user may have set it deliberately).
  const dueDefaultedRef = useRef(false);
  useEffect(() => {
    if (editId || dueDefaultedRef.current || !business) return;
    const days = business.invoice_due_days;
    if (days != null && days >= 0 && issueDate && !dueDate) {
      setDueDate(addDaysISO(issueDate, days));
      dueDefaultedRef.current = true;
    }
  }, [editId, business, issueDate, dueDate]);

  // New invoices start in the business's default language (Invoice theme).
  // Edit mode skips this (the invoice's own language is loaded below); the ref
  // guard means a manual change to the dropdown is never overwritten.
  const langDefaultedRef = useRef(false);
  useEffect(() => {
    if (editId || langDefaultedRef.current || !business) return;
    setLanguage(invoiceDefaultLanguage(business.invoice_template));
    langDefaultedRef.current = true;
  }, [editId, business]);

  useEffect(() => {
    if (!business) return;
    supabase.from('clients').select('id, first_name, last_name').eq('business_id', business.id)
      .order('first_name').then(({ data }) => setClients(data ?? []));
    supabase.from('invoice_field_templates').select('*').eq('business_id', business.id)
      .order('sort_order').then(({ data }) => setCustomTemplates(data ?? []));
  }, [business]);

  // Edit mode: hydrate form from the existing invoice.
  useEffect(() => {
    if (!editId || !business) return;
    let cancelled = false;
    (async () => {
      const [{ data: inv }, { data: links }] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', editId).single(),
        supabase.from('invoice_clients').select('client_id').eq('invoice_id', editId),
      ]);
      if (cancelled) return;
      if (inv) {
        setInvoiceNumber(inv.invoice_number ?? '');
        setIssueDate(inv.issue_date ?? new Date().toISOString().split('T')[0]);
        setDueDate(inv.due_date ?? '');
        setNotes(inv.notes ?? '');
        setTaxRate(inv.tax_rate ?? 0);
        setLanguage((inv.language as InvoiceLang) ?? 'es');
        setCustomFields((inv.custom_fields as Record<string, string> | null) ?? {});
        const lineItems = (inv.line_items as LineItem[] | null) ?? [];
        setLines(lineItems.length > 0 ? [...lineItems, { ...EMPTY_LINE }] : [{ ...EMPTY_LINE }]);
        const idsFromLinks = (links ?? []).map((r: { client_id: string }) => r.client_id);
        if (idsFromLinks.length > 0) setClientIds(idsFromLinks);
        else if (inv.client_id) setClientIds([inv.client_id]);
      }
      setLoadingEdit(false);
    })();
    return () => { cancelled = true; };
  }, [editId, business]);

  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    setLines(prev => {
      const updated = prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l);
      // Auto-add a new row when the last row's description is filled
      if (field === 'description' && i === updated.length - 1 && (value as string).trim()) {
        updated.push({ ...EMPTY_LINE });
      }
      return updated;
    });
  };
  const removeLine = (i: number) => setLines(prev => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i));

  const subtotal = lines.reduce((s, l) => s + (l.qty * l.rate), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const save = async (status: 'draft' | 'sent') => {
    if (!business) return;
    if (lines.every(l => !l.description.trim())) { setError(t.errorAtLeastOne); return; }
    // Required standard fields (configured in Settings → Facturas).
    const req = business.invoice_field_required ?? {};
    const standardChecks: { key: string; label: string; filled: boolean }[] = [
      { key: 'invoice_number', label: t.invoiceNumberLabel, filled: !!invoiceNumber.trim() },
      { key: 'client', label: t.clientsLabel, filled: clientIds.length > 0 },
      { key: 'issue_date', label: t.issueDateLabel, filled: !!issueDate },
      { key: 'due_date', label: t.dueDateLabel, filled: !!dueDate },
      { key: 'notes', label: t.notesLabel, filled: !!notes.trim() },
    ];
    for (const c of standardChecks) {
      if (req[c.key] && !c.filled) {
        setError(t.errorRequiredField.replace('{{field}}', c.label));
        return;
      }
    }
    // Required custom fields must be filled before saving.
    for (const tpl of customTemplates) {
      if (tpl.required && !customFields[tpl.field_key]?.trim()) {
        setError(t.errorRequiredField.replace('{{field}}', tpl.field_label));
        return;
      }
    }
    setSaving(true); setError('');

    const validLines = lines.filter(l => l.description.trim());

    const payload = {
      client_id: clientIds[0] || null,
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDate || null,
      line_items: validLines,
      subtotal_amount: subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: total,
      notes: notes || null,
      language,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
    };

    let invoiceId: string;
    if (editId) {
      // Update: don't override status on save (keep current state). User
      // can advance status via Mark Sent / Mark Paid on the detail page.
      const { error: upErr } = await supabase.from('invoices').update(payload).eq('id', editId);
      if (upErr) { setError(t.errorSave); setSaving(false); return; }
      invoiceId = editId;
    } else {
      const { data, error: e } = await supabase.from('invoices')
        .insert({ business_id: business.id, status, ...payload })
        .select()
        .single();
      if (e || !data) { setError(t.errorSave); setSaving(false); return; }
      invoiceId = data.id;
    }

    // Replace client links so add/remove on edit also works.
    if (editId) await supabase.from('invoice_clients').delete().eq('invoice_id', invoiceId);
    if (clientIds.length > 0) {
      await supabase.from('invoice_clients').insert(
        clientIds.map(cid => ({ invoice_id: invoiceId, client_id: cid }))
      );
    }

    window.location.href = `/dashboard/facturas/${invoiceId}`;
  };

  // Unsaved-changes guard: the back link calls confirmDiscard; beforeunload
  // covers refresh / tab-close. dueDate is excluded — it auto-fills from
  // business.invoice_due_days via an effect after mount. Declared before the
  // loading early-return to keep hook order stable.
  const dirty = useDirty(
    {
      invoiceNumber, clientIds, issueDate, notes, taxRate, language, customFields,
      lines: lines.filter(l => l.description.trim()),
    },
    !loadingEdit,
  );
  const confirmDiscard = useUnsavedChanges(dirty);

  if (loadingEdit) {
    return (
      <div className="p-6 max-w-4xl">
        <p className="text-sm text-gray-400">…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={editId ? `/dashboard/facturas/${editId}` : '/dashboard/facturas'}
          onClick={e => { e.preventDefault(); confirmDiscard(() => { window.location.href = editId ? `/dashboard/facturas/${editId}` : '/dashboard/facturas'; }); }}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={18} className="text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {editId ? t.headingEdit : t.heading}
          </h1>
          <p className="text-sm text-gray-400">{invoiceNumber}</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Client + dates */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-700">{t.generalInfo}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-sm font-medium text-gray-700">{t.clientsLabel}</label>
              {clientIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {clientIds.map(cid => {
                    const c = clients.find(cl => cl.id === cid);
                    if (!c) return null;
                    return (
                      <span key={cid} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1.5 rounded-lg">
                        {c.first_name} {c.last_name}
                        <button type="button" onClick={() => setClientIds(prev => prev.filter(id => id !== cid))} className="hover:text-red-500 transition-colors">
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <select
                value=""
                onChange={e => {
                  const val = e.target.value;
                  if (val && !clientIds.includes(val)) setClientIds(prev => [...prev, val]);
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition appearance-none"
              >
                <option value="">{clientIds.length === 0 ? t.selectClient : t.addAnotherClient}</option>
                {clients.filter(c => !clientIds.includes(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>
            <Input label={t.invoiceNumberLabel} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
            <Input label={t.issueDateLabel} type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            <Input label={t.dueDateLabel} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t.languageLabel}</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as InvoiceLang)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition appearance-none"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{t.itemsHeading}</h2>
          <div className="flex flex-col gap-2">
            <div className="hidden md:grid grid-cols-[1fr_80px_100px_32px] gap-2 text-xs font-medium text-gray-400 px-1">
              <span>{t.colDescription}</span><span className="text-center">{t.colQty}</span><span className="text-right">{t.colRate}</span><span/>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-center">
                <input
                  type="text"
                  placeholder={t.itemPlaceholder}
                  value={line.description}
                  onChange={e => updateLine(i, 'description', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
                <input
                  type="number"
                  min="1"
                  value={line.qty}
                  onChange={e => updateLine(i, 'qty', parseFloat(e.target.value) || 1)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={line.rate || ''}
                  onChange={e => updateLine(i, 'rate', parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-right text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
                <button onClick={() => removeLine(i)} disabled={lines.length === 1} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-20">
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-5 border-t border-gray-50 pt-4 flex flex-col items-end gap-1">
            <div className="flex items-center gap-8 text-sm">
              <span className="text-gray-500">{t.subtotal}</span>
              <span className="font-medium text-gray-900 w-24 text-right">{fmt(subtotal)}</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">{t.taxPercent}</span>
              <input
                type="number" min="0" max="100" step="0.1"
                value={taxRate || ''}
                placeholder="0"
                onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="font-medium text-gray-900 w-24 text-right">{fmt(taxAmount)}</span>
            </div>
            <div className="flex items-center gap-8 text-base font-bold border-t border-gray-100 pt-2 mt-1">
              <span className="text-gray-900">{t.total}</span>
              <span className="text-primary w-24 text-right">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Custom fields */}
        {customTemplates.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">{t.customFieldsHeading}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customTemplates.map(tpl => (
                <CustomFieldInput
                  key={tpl.id}
                  template={tpl}
                  value={customFields[tpl.field_key] ?? ''}
                  onChange={v => setCustomFields(prev => ({ ...prev, [tpl.field_key]: v }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <label className="text-sm font-semibold text-gray-700 block mb-2">{t.notesLabel}</label>
          <textarea
            rows={3}
            placeholder={t.notesPlaceholder}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none transition"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          {editId ? (
            <Button onClick={() => save('draft')} loading={saving} fullWidth size="lg">
              {full.common.buttons.saveChanges}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => save('draft')} loading={saving} fullWidth size="lg">
                {t.saveDraft}
              </Button>
              <Button onClick={() => save('sent')} loading={saving} fullWidth size="lg">
                {t.sendInvoice}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomFieldInput({
  template,
  value,
  onChange,
}: {
  template: FieldTemplate;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t: full } = useLang();
  const tc = full.common;
  const label = template.required ? `${template.field_label} *` : template.field_label;

  if (template.field_type === 'boolean') {
    // Three states — '', 'true', 'false'. Clicking the active button clears
    // so the user can return to "unanswered".
    const yesActive = value === 'true';
    const noActive = value === 'false';
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${yesActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {tc.states.yes}
          </button>
          <button type="button" onClick={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${noActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {tc.states.no}
          </button>
        </div>
      </div>
    );
  }
  if (template.field_type === 'select' && template.field_options?.length) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
        >
          <option value="">—</option>
          {template.field_options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <Input
      label={label}
      type={template.field_type === 'date' ? 'date' : template.field_type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}
