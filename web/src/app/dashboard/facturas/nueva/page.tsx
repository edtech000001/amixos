'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, ArrowLeft, X, Search, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { insertInvoiceUnique } from '@amixos/shared/lib/invoicing';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { InvoiceLang } from '@amixos/shared';
import { invoiceDefaultLanguage, nextInvoiceNumber } from '@amixos/shared/lib/invoiceTemplate';
import { can } from '@amixos/shared/lib/permissions';
import { useLang } from '@/i18n/LangProvider';
import { useDirty, useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { parseHiddenFields, isFieldHidden } from '@amixos/shared/lib/fieldLayout';
import { groupNumberString, localizeTemplates, parseFieldConfig, sanitizeNumberInput, splitMultiValue, toggleMultiOption } from '@amixos/shared/lib/fieldTemplates';
import { clientPickerDisplay } from '@amixos/shared/lib/clientSearch';
import {
  INVOICE_FIELD_SECTIONS,
  INVOICE_FIELDS_ALWAYS_SHOWN,
  INVOICE_SECTION_FIELDS,
  parseInvoiceLayout,
  invoiceFieldsInSection,
  type InvoiceFieldSection,
} from '@amixos/shared/lib/invoiceFieldSections';

// job_id/edited: source-job linkage — must survive an edit round-trip or
// Move/Remove on the detail screen breaks. qtyText/rateText hold the raw
// input while typing so "12." isn't collapsed by parseFloat (stripped on save).
interface LineItem { description: string; qty: number; rate: number; job_id?: string | null; edited?: boolean; qtyText?: string; rateText?: string; }
interface Client { id: string; first_name: string; last_name: string; company: string | null; contacts?: { name: string; role: string | null }[]; }
interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'note' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
  field_config: { integerOnly?: boolean; multi?: boolean; thousands?: boolean } | null;
}

const EMPTY_LINE: LineItem = { description: '', qty: 1, rate: 0 };

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
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
  const { t: full, locale } = useLang();
  const t = full.dashboard.invoices.new;
  const supabase = createSupabaseClient();
  const { business, currentRole, activeLocationId, myHomeLocationId } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');

  // Route guard: creating needs createInvoice, editing needs editInvoice. RLS
  // blocks the write regardless — this stops a read-only role from reaching the
  // form via a direct link.
  useEffect(() => {
    if (!business) return;
    const allowed = editId ? can.editInvoice(currentRole) : can.createInvoice(currentRole);
    if (!allowed) router.replace('/dashboard/facturas');
  }, [business, currentRole, editId, router]);
  const [clients, setClients] = useState<Client[]>([]);
  const initialClient = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('client') : null;
  const [clientIds, setClientIds] = useState<string[]>(initialClient ? [initialClient] : []);
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  // Auto-filled with the next sequential number once the invoice count loads.
  const [invoiceNumber, setInvoiceNumber] = useState('');
  // Once the user types their own number, stop auto-deriving it.
  const numberEditedRef = useRef(false);
  // Existing-invoice count (null = not loaded). Drives the sequential
  // auto-number: business.invoice_start_number + count.
  const invoiceCountRef = useRef<number | null>(null);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  // Internal notes: private to the business, never rendered on the invoice.
  const [internalNotes, setInternalNotes] = useState('');
  // Stored status of the invoice being edited — lets save recompute
  // sent/overdue from the (possibly changed) due date.
  const [editStatus, setEditStatus] = useState<string | null>(null);
  // Notes source: 'default' = use the business's default note (Ajustes →
  // Facturas), 'custom' = write your own. New invoices start on 'default' when
  // a default note exists so it's actually applied.
  const [notesMode, setNotesMode] = useState<'default' | 'custom'>('custom');
  const defaultNote = (business?.invoice_notes_default ?? '').trim();
  // New invoices start at the business default (Ajustes → Facturas);
  // editing an existing invoice overwrites this with its stored rate.
  const [taxRate, setTaxRate] = useState(() => business?.invoice_tax_rate ?? 0);
  const [taxRateText, setTaxRateText] = useState<string | null>(null);
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
    // Net-30 by default for everyone; a business can override the window in
    // Ajustes → Facturas (invoice_due_days). Only fills an empty due date.
    const days = business.invoice_due_days ?? 30;
    if (days >= 0 && issueDate && !dueDate) {
      setDueDate(addDaysISO(issueDate, days));
      dueDefaultedRef.current = true;
    }
  }, [editId, business, issueDate, dueDate]);

  // New invoices prefill the default note (Ajustes → Facturas) and start on the
  // "Use default" toggle so it's actually applied. Ref guard = runs once.
  const notesDefaultedRef = useRef(false);
  useEffect(() => {
    if (editId || notesDefaultedRef.current || !business) return;
    const def = (business.invoice_notes_default ?? '').trim();
    if (def) { setNotes(def); setNotesMode('default'); }
    notesDefaultedRef.current = true;
  }, [editId, business]);

  // New invoices start in the business's default language (Invoice theme).
  // Edit mode skips this (the invoice's own language is loaded below); the ref
  // guard means a manual change to the dropdown is never overwritten.
  const langDefaultedRef = useRef(false);
  useEffect(() => {
    if (editId || langDefaultedRef.current || !business) return;
    setLanguage(invoiceDefaultLanguage(business.invoice_template, locale));
    langDefaultedRef.current = true;
  }, [editId, business]);

  // Keep the auto invoice number in sync with language (INV-/FAC-) and the
  // business's starting number, until the user types their own. Waits for the
  // invoice count so the sequence is correct.
  useEffect(() => {
    if (editId || numberEditedRef.current || invoiceCountRef.current === null) return;
    setInvoiceNumber(nextInvoiceNumber(language, business?.invoice_start_number, invoiceCountRef.current));
  }, [language, editId, business]);

  useEffect(() => {
    if (!business) return;
    (async () => {
      const [{ data: cl }, contactRes] = await Promise.all([
        supabase.from('clients').select('id, first_name, last_name, company').eq('business_id', business.id)
          .order('first_name'),
        // Client contacts — so the picker can find an account by a contact's
        // name (primary contact first), same as the job form.
        supabase.from('client_contacts').select('client_id, name, role').eq('business_id', business.id)
          .order('is_primary', { ascending: false }).then(r => r, () => ({ data: [] as { client_id: string; name: string; role: string | null }[] })),
      ]);
      const contactsByClient = new Map<string, { name: string; role: string | null }[]>();
      for (const ct of (contactRes.data ?? []) as { client_id: string; name: string; role: string | null }[]) {
        (contactsByClient.get(ct.client_id) ?? contactsByClient.set(ct.client_id, []).get(ct.client_id)!).push({ name: ct.name, role: ct.role });
      }
      setClients(((cl ?? []) as Client[]).map(c => ({ ...c, contacts: contactsByClient.get(c.id) })));
    })();
    supabase.from('invoice_field_templates').select('*').eq('business_id', business.id)
      .order('sort_order').then(({ data }) => setCustomTemplates(localizeTemplates(data ?? [], locale)));
    // New invoice: load the count so the auto-number = start + count.
    if (!editId) {
      supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('business_id', business.id)
        .then(({ count }) => {
          invoiceCountRef.current = count ?? 0;
          if (!numberEditedRef.current) {
            setInvoiceNumber(nextInvoiceNumber(language, business.invoice_start_number, invoiceCountRef.current));
          }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business, locale]);

  // Reuse the job form's search strings so the invoice picker reads identically.
  const jt = full.dashboard.jobs.new;

  // Client search — matches own fields AND contact people, same as the job
  // form, so typing a contact's name surfaces the account they belong to.
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => {
      const own = [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase();
      if (own.includes(q)) return true;
      return (c.contacts ?? []).some(ct => ct.name.toLowerCase().includes(q) || (ct.role ?? '').toLowerCase().includes(q));
    });
  }, [clients, clientSearch]);

  // The contact that matched (when the account matched via a contact, not its
  // own name) — shown under the client so you know who you searched.
  const matchedContactOf = (c: Client) => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return null;
    const own = [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase();
    if (own.includes(q)) return null;
    return (c.contacts ?? []).find(ct => ct.name.toLowerCase().includes(q) || (ct.role ?? '').toLowerCase().includes(q)) ?? null;
  };

  // Close client dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
        setInternalNotes((inv as { internal_notes?: string | null }).internal_notes ?? '');
        setEditStatus((inv as { status?: string | null }).status ?? null);
        // Show "Use default" when the saved note still matches the business
        // default; otherwise it's a custom note.
        const def = (business?.invoice_notes_default ?? '').trim();
        setNotesMode(def && (inv.notes ?? '').trim() === def ? 'default' : 'custom');
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
      const updated = prev.map((l, idx) => idx === i
        ? { ...l, [field]: value, ...(l.job_id && field !== 'qtyText' && field !== 'rateText' ? { edited: true } : {}) }
        : l);
      // Auto-add a new row when the last row's description is filled
      if (field === 'description' && i === updated.length - 1 && (value as string).trim()) {
        updated.push({ ...EMPTY_LINE });
      }
      return updated;
    });
  };
  const removeLine = (i: number) => setLines(prev => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i));

  // toFixed(6) strips float noise, preserving exact decimals (see computeTotals).
  const subtotal = Number(lines.reduce((s, l) => s + Number((l.qty * l.rate).toFixed(6)), 0).toFixed(6));
  const taxAmount = Number((subtotal * (taxRate / 100)).toFixed(6));
  const total = Number((subtotal + taxAmount).toFixed(6));

  // Per-field show/hide (always-shown fields can never be hidden).
  const invHidden = parseHiddenFields(business?.invoice_field_hidden);
  const fHidden = (key: string) =>
    !INVOICE_FIELDS_ALWAYS_SHOWN.includes(key) && isFieldHidden(invHidden, key);

  // Custom fields grouped by section, in saved layout order.
  const invAllKeys = [
    ...INVOICE_FIELD_SECTIONS.flatMap(s => INVOICE_SECTION_FIELDS[s]),
    ...customTemplates.map(tpl => `custom:${tpl.id}`),
  ];
  const invLayout = parseInvoiceLayout(business?.invoice_field_layout ?? null, invAllKeys);
  const customsInSection = (section: InvoiceFieldSection): FieldTemplate[] =>
    invoiceFieldsInSection(invLayout, section)
      .filter(k => k.startsWith('custom:'))
      .map(k => customTemplates.find(tpl => `custom:${tpl.id}` === k))
      .filter((tpl): tpl is FieldTemplate => !!tpl);
  const additionalLabel = locale === 'es' ? 'Detalles adicionales' : 'Additional details';
  const sectionLabel = (section: InvoiceFieldSection): string => {
    const es = locale === 'es';
    switch (section) {
      case 'general': return 'General';
      case 'notes': return es ? 'Notas' : 'Notes';
      case 'additional': return es ? 'Detalles adicionales' : 'Additional details';
    }
  };

  const renderInvCustom = (tpl: FieldTemplate) => (
    <CustomFieldInput
      key={tpl.id}
      template={tpl}
      value={customFields[tpl.field_key] ?? ''}
      onChange={v => setCustomFields(prev => ({ ...prev, [tpl.field_key]: v }))}
    />
  );

  // The multi-select client picker — structural-ish but lives in the General
  // section (always shown). Spans the full grid width.
  const clientPicker = (
    <div key="client" className="flex flex-col gap-1.5 md:col-span-2">
      <label className="text-sm font-medium text-ink">{t.clientsLabel}</label>
      {clientIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {clientIds.map(cid => {
            const c = clients.find(cl => cl.id === cid);
            if (!c) return null;
            return (
              <span key={cid} className="inline-flex items-center gap-1 bg-border-soft text-ink text-xs font-medium px-2.5 py-1.5 rounded-lg">
                {clientPickerDisplay(c).top}
                <button type="button" onClick={() => setClientIds(prev => prev.filter(id => id !== cid))} className="hover:text-red-500 transition-colors">
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative" ref={clientDropdownRef}>
        <button type="button" onClick={() => setClientDropdownOpen(o => !o)}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-left text-faint flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary">
          <span>{clientIds.length === 0 ? t.selectClient : t.addAnotherClient}</span>
          <ChevronDown size={14} className="text-faint shrink-0 ml-2"/>
        </button>
        {clientDropdownOpen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="p-2 border-b border-border-soft">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"/>
                <input autoFocus type="text" placeholder={jt.clientSearchPlaceholder}
                  value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                  className="w-full rounded-lg border border-border pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filteredClients.filter(c => !clientIds.includes(c.id)).map(c => {
                const ct = matchedContactOf(c);
                const { top, sub } = clientPickerDisplay(c);
                return (
                  <button type="button" key={c.id}
                    onClick={() => { setClientIds(prev => [...prev, c.id]); setClientSearch(''); setClientDropdownOpen(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-surface transition-colors">
                    <span className="block text-base text-ink truncate">
                      {top}
                      {sub && <span className="text-faint ml-1 text-sm">· {sub}</span>}
                    </span>
                    {ct && (
                      <span className="block text-xs text-primary truncate mt-0.5">{ct.name}{ct.role ? `  ·  ${ct.role}` : ''}</span>
                    )}
                  </button>
                );
              })}
              {filteredClients.filter(c => !clientIds.includes(c.id)).length === 0 && (
                <p className="px-4 py-3 text-xs text-faint text-center">{jt.clientNoResults}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Full-width grid-cell JSX for each built-in General field key. Only
  // invoice_number/client/issue_date/due_date go through the data-driven loop;
  // language + line items + tax/totals are structural and rendered separately.
  const renderInvField = (key: string): React.ReactNode => {
    switch (key) {
      case 'invoice_number':
        return <Input key={key} label={t.invoiceNumberLabel} value={invoiceNumber} onChange={e => { setInvoiceNumber(e.target.value); numberEditedRef.current = true; }} />;
      case 'client':
        return clientPicker;
      case 'issue_date':
        return <Input key={key} label={t.issueDateLabel} type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />;
      case 'due_date':
        return <Input key={key} label={t.dueDateLabel} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />;
      default:
        return null;
    }
  };

  const save = async (status: 'draft' | 'sent') => {
    if (!business) return;
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
      if (req[c.key] && !fHidden(c.key) && !c.filled) {
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
      line_items: validLines.map(l => ({ description: l.description, qty: l.qty, rate: l.rate, ...(l.job_id ? { job_id: l.job_id, ...(l.edited ? { edited: true } : {}) } : {}) })),
      subtotal_amount: subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: total,
      notes: notes || null,
      internal_notes: internalNotes.trim() || null,
      language,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
    };

    // If a sent/overdue invoice's due date moved, re-derive which of the two
    // it is now (a future/empty due date is no longer overdue). Draft/paid/
    // total_loss are left untouched.
    const today = new Date().toISOString().split('T')[0];
    const nextStatus =
      editStatus === 'sent' || editStatus === 'overdue'
        ? dueDate && dueDate < today
          ? 'overdue'
          : 'sent'
        : null;

    let invoiceId: string;
    if (editId) {
      // Only status change on save is the overdue↔sent re-derivation above;
      // draft/paid/total_loss are preserved. Mark Sent/Paid live on the detail.
      const { error: upErr } = await supabase.from('invoices')
        .update(nextStatus ? { ...payload, status: nextStatus } : payload).eq('id', editId);
      if (upErr) { setError(t.errorSave); setSaving(false); return; }
      invoiceId = editId;
    } else {
      // insertInvoiceUnique: the auto-number is count-based, so after deleting
      // an invoice the next number collides with an existing row — walk
      // forward to the next free number instead of failing the save.
      const { data, error: e } = await insertInvoiceUnique(supabase, {
        business_id: business.id, status,
        // File a manual invoice under the branch you're working in, else your
        // own home branch.
        location_id: activeLocationId ?? myHomeLocationId ?? null,
        ...payload,
      });
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

    // Client-side navigation (not window.location) so the unsaved-changes
    // beforeunload guard doesn't fire the browser's "Leave site?" prompt on a
    // successful save. The detail page fetches its own data on mount.
    router.push(`/dashboard/facturas/${invoiceId}`);
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
        <p className="text-sm text-faint">…</p>
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
          className="p-2 rounded-xl hover:bg-border-soft transition-colors"
        >
          <ArrowLeft size={18} className="text-muted" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {editId ? t.headingEdit : t.heading}
          </h1>
          <p className="text-sm text-faint">{invoiceNumber}</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* General section — invoice_number, client, issue_date, due_date +
            general customs rendered in saved layout order. Language selector
            is structural and stays after them in the grid. */}
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-ink">{sectionLabel('general')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {invoiceFieldsInSection(invLayout, 'general')
              .filter(k => (k.startsWith('custom:') ? true : !fHidden(k)))
              .map(k => {
                if (k.startsWith('custom:')) {
                  const tpl = customTemplates.find(tp => `custom:${tp.id}` === k);
                  return tpl ? renderInvCustom(tpl) : null;
                }
                return renderInvField(k);
              })}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{t.languageLabel}</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as InvoiceLang)}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition appearance-none"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">{t.itemsHeading}</h2>
          <div className="flex flex-col gap-2">
            <div className="hidden md:grid grid-cols-[1fr_80px_100px_32px] gap-2 text-xs font-medium text-faint px-1">
              <span>{t.colDescription}</span><span className="text-center">{t.colQty}</span><span className="text-right">{t.colRate}</span><span/>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-start">
                {/* Wrap + grow with the text (capped, then scrolls) so a long
                    item name is readable instead of clipped — never an endless box. */}
                <textarea
                  rows={1}
                  ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; } }}
                  placeholder={t.itemPlaceholder}
                  value={line.description}
                  onChange={e => updateLine(i, 'description', e.target.value)}
                  className="w-full resize-none overflow-auto rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={line.qtyText ?? (line.qty ? String(line.qty) : '')}
                  onChange={e => {
                    const clean = e.target.value.replace(/[^0-9.]/g, '');
                    updateLine(i, 'qtyText', clean);
                    updateLine(i, 'qty', parseFloat(clean) || 0);
                  }}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-center text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={line.rateText ?? (line.rate ? String(line.rate) : '')}
                  onChange={e => {
                    const clean = e.target.value.replace(/[^0-9.-]/g, '').replace(/(?!^)-/g, '');
                    updateLine(i, 'rateText', clean);
                    updateLine(i, 'rate', parseFloat(clean) || 0);
                  }}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-right text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
                <button onClick={() => removeLine(i)} disabled={lines.length === 1} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-20">
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-5 border-t border-border-soft pt-4 flex flex-col items-end gap-1">
            <div className="flex items-center gap-8 text-sm">
              <span className="text-muted">{t.subtotal}</span>
              <span className="font-medium text-ink w-24 text-right">{fmt(subtotal)}</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted">{t.taxPercent}</span>
              <input
                type="text" inputMode="decimal"
                value={taxRateText ?? (taxRate ? String(taxRate) : '')}
                placeholder="0"
                onChange={e => {
                  const clean = e.target.value.replace(/[^0-9.]/g, '');
                  setTaxRateText(clean);
                  setTaxRate(parseFloat(clean) || 0);
                }}
                className="w-16 rounded-lg border border-border px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="font-medium text-ink w-24 text-right">{fmt(taxAmount)}</span>
            </div>
            <div className="flex items-center gap-8 text-base font-bold border-t border-border-soft pt-2 mt-1">
              <span className="text-ink">{t.total}</span>
              <span className="text-primary w-24 text-right">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Notes section — notes field + notes customs in saved layout order. */}
        {(() => {
          const visibleKeys = invoiceFieldsInSection(invLayout, 'notes')
            .filter(k => (k.startsWith('custom:') ? true : !fHidden(k)));
          if (visibleKeys.length === 0) return null;
          return (
            <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-ink">{sectionLabel('notes')}</h2>
              {visibleKeys.map(k => {
                if (k.startsWith('custom:')) {
                  const tpl = customTemplates.find(tp => `custom:${tp.id}` === k);
                  return tpl ? renderInvCustom(tpl) : null;
                }
                if (k === 'notes') {
                  return (
                    <div key="notes" className="flex flex-col gap-2">
                      {/* Toggle only appears when a default note exists — otherwise
                          it's just the editable box (no default to fall back to). */}
                      {defaultNote ? (
                        <div className="inline-flex gap-1 bg-border-soft p-1 rounded-xl self-start">
                          {(['default', 'custom'] as const).map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setNotesMode(m);
                                if (m === 'default') setNotes(defaultNote);
                                else if (!notes.trim() || notes.trim() === defaultNote) setNotes(defaultNote);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                notesMode === m ? 'bg-primary/15 text-primary shadow-sm' : 'text-muted hover:text-ink'
                              }`}
                            >
                              {m === 'default' ? t.notesUseDefault : t.notesCustom}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {defaultNote && notesMode === 'default' ? (
                        <div className="w-full rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm text-muted whitespace-pre-wrap">
                          {defaultNote}
                        </div>
                      ) : (
                        <textarea
                          rows={3}
                          placeholder={t.notesPlaceholder}
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none transition"
                        />
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          );
        })()}

        {/* Internal notes — private to the business, never on the invoice. */}
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
          <h2 className="text-sm font-semibold text-ink mb-2">{t.internalNotesLabel}</h2>
          <textarea
            rows={3}
            placeholder={t.internalNotesPlaceholder}
            value={internalNotes}
            onChange={e => setInternalNotes(e.target.value)}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none transition"
          />
        </div>

        {/* Additional custom fields */}
        {customsInSection('additional').length > 0 && (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
            <h2 className="text-sm font-semibold text-ink mb-4">{additionalLabel}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customsInSection('additional').map(tpl => (
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

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          {/* Creating an invoice always makes a draft — sending is an explicit
             action from the invoice detail (was mistakenly marking new
             invoices "sent"). */}
          <Button onClick={() => save('draft')} loading={saving} fullWidth size="lg">
            {editId ? full.common.buttons.saveChanges : t.sendInvoice}
          </Button>
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
  const cfg = parseFieldConfig(template.field_config);

  if (template.field_type === 'note') {
    // Long free text — multiline.
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">{label}</label>
        <textarea
          rows={4}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y"
        />
      </div>
    );
  }
  if (template.field_type === 'boolean') {
    // Three states — '', 'true', 'false'. Clicking the active button clears
    // so the user can return to "unanswered".
    const yesActive = value === 'true';
    const noActive = value === 'false';
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${yesActive ? 'border-primary bg-primary text-white' : 'border-border bg-card text-ink hover:bg-surface'}`}>
            {tc.states.yes}
          </button>
          <button type="button" onClick={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${noActive ? 'border-primary bg-primary text-white' : 'border-border bg-card text-ink hover:bg-surface'}`}>
            {tc.states.no}
          </button>
        </div>
      </div>
    );
  }
  if (template.field_type === 'select' && template.field_options?.length) {
    // Multi-select: chips, value stored comma-joined ("A, B") so display
    // paths read naturally. Single-select keeps the dropdown.
    if (cfg.multi) {
      const selected = splitMultiValue(value);
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">{label}</label>
          <div className="flex flex-wrap gap-2">
            {template.field_options.map(o => {
              const on = selected.includes(o);
              return (
                <button key={o} type="button" onClick={() => onChange(toggleMultiOption(value, o))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted hover:border-border'}`}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">{label}</label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none"
        >
          <option value="">—</option>
          {template.field_options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  if (template.field_type === 'number') {
    // type="text" + inputMode so we can enforce numeric (and optional
    // whole-number-only) as the user types — type="number" can't be sanitized.
    return (
      <Input
        label={label}
        type="text"
        inputMode={cfg.integerOnly ? 'numeric' : 'decimal'}
        value={cfg.thousands ? groupNumberString(value) : value}
        onChange={e => onChange(sanitizeNumberInput(e.target.value, cfg.integerOnly))}
      />
    );
  }
  return (
    <Input
      label={label}
      type={template.field_type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}
