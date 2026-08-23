import { useEffect, useMemo, useRef, useState } from 'react';
import { SkeletonBlock, SkeletonCard } from '@amixos/shared/ui/Skeleton';
import { formatMoneyInput, formatNumberGrouped } from '@amixos/shared/lib/format';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal as RNModal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronDown,
  Search,
  X,
  Trash2,
  Check,
  FileText,
  Lock,
} from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { insertInvoiceUnique } from '@amixos/shared/lib/invoicing';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useDirty, useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Button, Input, Select, DatePicker } from '@amixos/shared/ui';
import type { InvoiceLang } from '@amixos/shared';
import { invoiceDefaultLanguage, nextInvoiceNumber } from '@amixos/shared/lib/invoiceTemplate';
import { can } from '@amixos/shared/lib/permissions';
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

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  /** People at this client — searchable so you can find the account by a
   *  contact's name (primary contact first). */
  contacts?: { name: string; role: string | null }[];
}

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

interface LineItem {
  id: string;
  description: string;
  qty: number;
  rate: number;
  /** Source job (invoices built from jobs) — must survive an edit round-trip
   *  or Move/Remove on the detail screen breaks. */
  job_id?: string | null;
  /** Hand-edited job line: the draft rebuild keeps it instead of re-deriving. */
  edited?: boolean;
  // Raw input text while typing, so intermediate states like "12." aren't
  // collapsed by parseFloat. Display prefers these; numbers stay in sync.
  qtyText?: string;
  rateText?: string;
}

const newId = () => Math.random().toString(36).slice(2);
const newLine = (): LineItem => ({ id: newId(), description: '', qty: 1, rate: 0 });

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const todayISO = () => new Date().toISOString().split('T')[0];
// Add `days` to a "YYYY-MM-DD" date (parsed as local to avoid UTC drift).
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function NuevaFacturaRoute() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const supabase = createSupabaseClient();
  const insets = useSafeAreaInsets();
  const { business, currentRole, activeLocationId, myHomeLocationId } = useApp();
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.invoices.new;
  const tc = full.common;

  const editId = edit ?? null;

  // Route guard: creating needs createInvoice, editing needs editInvoice. RLS
  // blocks the write regardless — this stops a read-only role from reaching the
  // form via a deep link.
  useEffect(() => {
    if (!business) return;
    const allowed = editId ? can.editInvoice(currentRole) : can.createInvoice(currentRole);
    if (!allowed) router.replace('/dashboard/facturas' as never);
  }, [business, currentRole, editId, router]);

  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  // Auto-filled with the next sequential number once the invoice count loads
  // (see effect below). Empty until then; the user can also type their own.
  const [invoiceNumber, setInvoiceNumber] = useState('');
  // Once the user types their own number, stop auto-deriving it.
  const numberEditedRef = useRef(false);
  // Existing-invoice count for this business (null = not loaded yet). Drives the
  // sequential auto-number: business.invoice_start_number + count.
  const invoiceCountRef = useRef<number | null>(null);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  // Internal notes: private to the business, never rendered on the invoice.
  const [internalNotes, setInternalNotes] = useState('');
  // Stored status of the invoice being edited — lets save recompute
  // sent/overdue from the (possibly changed) due date.
  const [editStatus, setEditStatus] = useState<string | null>(null);
  // Notes source: 'default' = use the business's default note, 'custom' = write
  // your own. New invoices start on 'default' when a default note exists.
  const [notesMode, setNotesMode] = useState<'default' | 'custom'>('custom');
  const defaultNote = (business?.invoice_notes_default ?? '').trim();
  // New invoices start at the business default (Ajustes → Facturas);
  // editing an existing invoice overwrites this with its stored rate.
  const [taxRate, setTaxRate] = useState(() => business?.invoice_tax_rate ?? 0);
  const [taxRateText, setTaxRateText] = useState<string | null>(null);
  const [language, setLanguage] = useState<InvoiceLang>('es');
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  const [clients, setClients] = useState<Client[]>([]);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
  // "Use default" toggle so it's actually applied.
  const notesDefaultedRef = useRef(false);
  useEffect(() => {
    if (editId || notesDefaultedRef.current || !business) return;
    const def = (business.invoice_notes_default ?? '').trim();
    if (def) { setNotes(def); setNotesMode('default'); }
    notesDefaultedRef.current = true;
  }, [editId, business]);

  // New invoices start in the business's default language (Invoice theme).
  // Edit mode loads the invoice's own language below; the ref guard means a
  // manual change to the dropdown is never overwritten.
  const langDefaultedRef = useRef(false);
  useEffect(() => {
    if (editId || langDefaultedRef.current || !business) return;
    setLanguage(invoiceDefaultLanguage(business.invoice_template, locale));
    langDefaultedRef.current = true;
  }, [editId, business]);

  // Keep the auto invoice number in sync with language (INV-/FAC-) and the
  // business's starting number, until the user types their own. Waits for the
  // invoice count to load so the sequence is correct.
  useEffect(() => {
    if (editId || numberEditedRef.current || invoiceCountRef.current === null) return;
    setInvoiceNumber(nextInvoiceNumber(language, business?.invoice_start_number, invoiceCountRef.current));
  }, [language, editId, business]);

  // Load clients + optionally the invoice being edited.
  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    (async () => {
      const [{ data: cl }, { data: tpls }, contactRes] = await Promise.all([
        supabase
          .from('clients')
          .select('id, first_name, last_name, company')
          .eq('business_id', business.id)
          .order('first_name'),
        supabase
          .from('invoice_field_templates')
          .select('*')
          .eq('business_id', business.id)
          .order('sort_order'),
        // Client contacts — so the picker can find an account by a contact's
        // name (primary contact first), same as the job form.
        supabase
          .from('client_contacts')
          .select('client_id, name, role')
          .eq('business_id', business.id)
          .order('is_primary', { ascending: false })
          .then((r) => r, () => ({ data: [] as { client_id: string; name: string; role: string | null }[] })),
      ]);
      if (cancelled) return;
      const contactsByClient = new Map<string, { name: string; role: string | null }[]>();
      for (const ct of (contactRes.data ?? []) as { client_id: string; name: string; role: string | null }[]) {
        (contactsByClient.get(ct.client_id) ?? contactsByClient.set(ct.client_id, []).get(ct.client_id)!)
          .push({ name: ct.name, role: ct.role });
      }
      setClients(((cl ?? []) as Client[]).map((c) => ({ ...c, contacts: contactsByClient.get(c.id) })));
      setTemplates(localizeTemplates((tpls ?? []) as FieldTemplate[], locale));

      // New invoice: load the count so the auto-number = start + count.
      if (!editId) {
        const { count } = await supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id);
        if (cancelled) return;
        invoiceCountRef.current = count ?? 0;
        if (!numberEditedRef.current) {
          setInvoiceNumber(nextInvoiceNumber(language, business.invoice_start_number, invoiceCountRef.current));
        }
      }

      if (editId) {
        const [{ data: inv }, { data: links }] = await Promise.all([
          supabase.from('invoices').select('*').eq('id', editId).single(),
          supabase.from('invoice_clients').select('client_id').eq('invoice_id', editId),
        ]);
        if (cancelled) return;
        if (inv) {
          setInvoiceNumber(inv.invoice_number ?? '');
          setIssueDate(inv.issue_date ?? todayISO());
          setDueDate(inv.due_date ?? '');
          setNotes(inv.notes ?? '');
          setInternalNotes((inv as { internal_notes?: string | null }).internal_notes ?? '');
          setEditStatus((inv as { status?: string | null }).status ?? null);
          {
            const def = (business?.invoice_notes_default ?? '').trim();
            setNotesMode(def && (inv.notes ?? '').trim() === def ? 'default' : 'custom');
          }
          setTaxRate(inv.tax_rate ?? 0);
          setLanguage((inv.language as InvoiceLang) ?? 'es');
          setCustomFields((inv.custom_fields as Record<string, string> | null) ?? {});
          const items = (inv.line_items as { description: string; qty: number; rate: number; job_id?: string | null; edited?: boolean }[] | null) ?? [];
          setLines(
            items.length > 0
              ? items.map((i) => ({ id: newId(), description: i.description, qty: i.qty, rate: i.rate, job_id: i.job_id ?? null, edited: i.edited }))
              : [newLine()],
          );
          const idsFromLinks = (links ?? []).map((r: { client_id: string }) => r.client_id);
          if (idsFromLinks.length > 0) setClientIds(idsFromLinks);
          else if (inv.client_id) setClientIds([inv.client_id]);
        }
        setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [business?.id, editId, locale]);

  // Auto-append a blank line when every row has a DESCRIPTION. Deliberately
  // not qty/price: a line without a description is dropped on save, so
  // spawning the next row off a bare amount would promise a line that never
  // gets stored.
  useEffect(() => {
    if (lines.length === 0) return;
    if (lines.every((l) => l.description.trim() !== '')) {
      setLines((prev) => [...prev, newLine()]);
    }
  }, [lines.map((l) => l.description).join('|')]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const own = [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase();
      if (own.includes(q)) return true;
      // Also match on the client's contacts — search a contact, find the account.
      return (c.contacts ?? []).some((ct) => ct.name.toLowerCase().includes(q) || (ct.role ?? '').toLowerCase().includes(q));
    });
  }, [clients, clientSearch]);

  // The contact that matched (when the account matched via a contact, not its
  // own name) — shown under the client so you know who you searched.
  const matchedContactOf = (c: Client) => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return null;
    const own = [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase();
    if (own.includes(q)) return null;
    return (c.contacts ?? []).find((ct) => ct.name.toLowerCase().includes(q) || (ct.role ?? '').toLowerCase().includes(q)) ?? null;
  };

  // Per-field show/hide (Ajustes → Facturas eye toggles). invoice_number +
  // client can never be hidden.
  const hidden = parseHiddenFields(business?.invoice_field_hidden);
  const fHidden = (key: string) =>
    !INVOICE_FIELDS_ALWAYS_SHOWN.includes(key) && isFieldHidden(hidden, key);

  // Custom fields grouped by section, in the saved layout order.
  const invoiceLayout = useMemo(() => {
    const standardKeys = INVOICE_FIELD_SECTIONS.flatMap(s => INVOICE_SECTION_FIELDS[s]);
    const allKeys = [...standardKeys, ...templates.map(tpl => `custom:${tpl.id}`)];
    return parseInvoiceLayout(business?.invoice_field_layout, allKeys);
  }, [business?.invoice_field_layout, templates]);
  const customFieldsFor = (section: InvoiceFieldSection): FieldTemplate[] =>
    invoiceFieldsInSection(invoiceLayout, section)
      .filter(k => k.startsWith('custom:'))
      .map(k => templates.find(tpl => `custom:${tpl.id}` === k))
      .filter((tpl): tpl is FieldTemplate => !!tpl);

  const renderCustomField = (tpl: FieldTemplate) => {
    const value = customFields[tpl.field_key] ?? '';
    const labelText = `${tpl.field_label}${tpl.required ? ' *' : ''}`;
    const cfg = parseFieldConfig(tpl.field_config);
    const setVal = (v: string) =>
      setCustomFields(prev => ({ ...prev, [tpl.field_key]: v }));

    if (tpl.field_type === 'note') {
      // Long free text — multiline, grows with content.
      return (
        <View key={tpl.field_key}>
          <Text className="text-sm font-semibold text-ink mb-2">{labelText}</Text>
          <TextInput
            value={value}
            onChangeText={setVal}
            multiline
            numberOfLines={4}
            placeholderTextColor={c.faint}
            className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink min-h-[90px]"
            style={{ textAlignVertical: 'top' }}
          />
        </View>
      );
    }
    if (tpl.field_type === 'select' && tpl.field_options) {
      // Multi-select: chips, value stored comma-joined ("A, B") so display
      // paths read naturally. Single-select keeps the dropdown.
      if (cfg.multi) {
        const selected = splitMultiValue(value);
        return (
          <View key={tpl.field_key}>
            <Text className="text-sm font-semibold text-ink mb-2">{labelText}</Text>
            <View className="flex-row flex-wrap gap-2">
              {tpl.field_options.map(o => {
                const on = selected.includes(o);
                return (
                  <Pressable
                    key={o}
                    onPress={() => setVal(toggleMultiOption(value, o))}
                    className={`rounded-full border px-4 py-2 ${on ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
                  >
                    <Text className={`text-sm font-medium ${on ? 'text-primary' : 'text-muted'}`}>{o}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      }
      return (
        <Select
          key={tpl.field_key}
          label={labelText}
          value={value}
          onValueChange={setVal}
          options={[
            { value: '', label: '—' },
            ...tpl.field_options.map(o => ({ value: o, label: o })),
          ]}
        />
      );
    }
    if (tpl.field_type === 'boolean') {
      const yesActive = value === 'true';
      const noActive = value === 'false';
      return (
        <View key={tpl.field_key}>
          <Text className="text-sm font-semibold text-ink mb-2">{labelText}</Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setVal(yesActive ? '' : 'true')}
              className={`flex-1 rounded-2xl border px-4 py-3 items-center ${yesActive ? 'border-primary bg-primary' : 'border-border bg-card'}`}
            >
              <Text className={`text-sm font-semibold ${yesActive ? 'text-white' : 'text-ink'}`}>
                {tc.states.yes}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setVal(noActive ? '' : 'false')}
              className={`flex-1 rounded-2xl border px-4 py-3 items-center ${noActive ? 'border-primary bg-primary' : 'border-border bg-card'}`}
            >
              <Text className={`text-sm font-semibold ${noActive ? 'text-white' : 'text-ink'}`}>
                {tc.states.no}
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }
    if (tpl.field_type === 'date') {
      return <DatePicker key={tpl.field_key} label={labelText} value={value} onChange={setVal} />;
    }
    const isNumber = tpl.field_type === 'number';
    return (
      <Input
        key={tpl.field_key}
        label={labelText}
        value={isNumber && cfg.thousands ? groupNumberString(value) : value}
        onChangeText={v => setVal(isNumber ? sanitizeNumberInput(v, cfg.integerOnly) : v)}
        keyboardType={isNumber ? (cfg.integerOnly ? 'number-pad' : 'numeric') : 'default'}
      />
    );
  };

  // Bilingual section headers (data-driven layout).
  const sectionLabel: Record<InvoiceFieldSection, string> = {
    general: 'General',
    notes: locale === 'es' ? 'Notas' : 'Notes',
    additional: locale === 'es' ? 'Detalles adicionales' : 'Additional details',
  };

  // Full-width JSX for one built-in field key. `client` renders the chip list +
  // picker trigger (modal lives outside the scroll). Pairs are stacked.
  const renderField = (key: string): React.ReactNode => {
    switch (key) {
      case 'invoice_number':
        return (
          <Input
            key={key}
            label={t.invoiceNumberLabel}
            value={invoiceNumber}
            onChangeText={(v) => { setInvoiceNumber(v); numberEditedRef.current = true; }}
          />
        );
      case 'client':
        return (
          <View key={key} className="flex flex-col gap-2">
            <Text className="text-sm font-semibold text-ink">{t.clientsLabel}</Text>
            {clientIds.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {clientIds.map((cid) => {
                  const found = clients.find((cl) => cl.id === cid);
                  if (!found) return null;
                  return (
                    <View
                      key={cid}
                      className="flex-row items-center gap-1.5 bg-border-soft rounded-lg px-2.5 py-1.5"
                    >
                      <Text className="text-xs font-medium text-ink">
                        {clientPickerDisplay(found).top}
                      </Text>
                      <Pressable
                        onPress={() => setClientIds((prev) => prev.filter((id) => id !== cid))}
                        hitSlop={6}
                      >
                        <X size={12} color={c.muted} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}
            <Pressable
              onPress={() => setClientPickerOpen(true)}
              className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5"
            >
              <Text className="text-base text-faint flex-1">
                {clientIds.length === 0 ? t.selectClient : t.addAnotherClient}
              </Text>
              <ChevronDown size={16} color={c.faint} />
            </Pressable>
          </View>
        );
      case 'issue_date':
        return (
          <DatePicker key={key} label={t.issueDateLabel} value={issueDate} onChange={setIssueDate} />
        );
      case 'due_date':
        return (
          <DatePicker key={key} label={t.dueDateLabel} value={dueDate} onChange={setDueDate} />
        );
      default:
        return null;
    }
  };

  // Built-in general keys (gated by fHidden) + general customs, in layout order.
  // The structural language selector renders after these, inside the same card.
  const generalKeys = invoiceFieldsInSection(invoiceLayout, 'general')
    .filter(k => (k.startsWith('custom:') ? true : !fHidden(k)));

  // toFixed(6) strips float noise, preserving exact decimals (see computeTotals).
  const subtotal = Number(lines.reduce((s, l) => s + Number((l.qty * l.rate).toFixed(6)), 0).toFixed(6));
  const taxAmount = Number((subtotal * (taxRate / 100)).toFixed(6));
  const total = Number((subtotal + taxAmount).toFixed(6));

  const updateLine = <K extends keyof LineItem>(id: string, field: K, value: LineItem[K]) =>
    setLines((prev) => prev.map((l) => (l.id === id
      ? { ...l, [field]: value, ...(l.job_id && field !== 'qtyText' && field !== 'rateText' ? { edited: true } : {}) }
      : l)));

  const removeLine = (id: string) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));

  const goBack = () => {
    if (editId) router.replace(`/dashboard/facturas/${editId}` as never);
    else router.replace('/dashboard/facturas' as never);
  };

  // Unsaved-changes guard on the back arrow + hardware back. `values` covers
  // the editable fields (lines filtered to those with a description so the
  // trailing empty row isn't counted); the snapshot is taken once data loads
  // (edit) or at mount (new), so untouched forms never prompt. dueDate is
  // intentionally excluded — it auto-fills from business.invoice_due_days via
  // an effect after mount, which would otherwise read as an instant edit.
  const dirty = useDirty(
    {
      invoiceNumber, clientIds, issueDate, notes, taxRate, language,
      customFields,
      lines: lines.filter((l) => l.description.trim()),
    },
    !loadingEdit,
  );
  const { confirmLeave: confirmBack, unsavedSheet } = useUnsavedGuard({ dirty, onLeave: goBack });

  const save = async (status: 'draft' | 'sent') => {
    if (!business) return;
    const validLines = lines.filter((l) => l.description.trim());
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
    for (const tpl of templates) {
      if (tpl.required && !customFields[tpl.field_key]?.trim()) {
        setError(t.errorRequiredField.replace('{{field}}', tpl.field_label));
        return;
      }
    }
    setSaving(true);
    setError('');

    const payload = {
      client_id: clientIds[0] || null,
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDate || null,
      line_items: validLines.map((l) => ({ description: l.description, qty: l.qty, rate: l.rate, ...(l.job_id ? { job_id: l.job_id, ...(l.edited ? { edited: true } : {}) } : {}) })),
      subtotal_amount: subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: total,
      notes: notes.trim() || null,
      internal_notes: internalNotes.trim() || null,
      language,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
    };

    // If a sent/overdue invoice's due date moved, re-derive which of the two
    // it is now (a future/empty due date is no longer overdue). Draft/paid/
    // total_loss are left untouched.
    const nextStatus =
      editStatus === 'sent' || editStatus === 'overdue'
        ? dueDate && dueDate < todayISO()
          ? 'overdue'
          : 'sent'
        : null;

    let invoiceId: string;
    if (editId) {
      const { error: upErr } = await supabase
        .from('invoices')
        .update(nextStatus ? { ...payload, status: nextStatus } : payload)
        .eq('id', editId);
      if (upErr) {
        setError(t.errorSave);
        setSaving(false);
        return;
      }
      invoiceId = editId;
    } else {
      // insertInvoiceUnique: the auto-number is count-based, so after deleting
      // an invoice the next number collides with an existing row — walk
      // forward to the next free number instead of failing the save.
      const { data, error: insErr } = await insertInvoiceUnique(supabase, {
        business_id: business.id, status,
        // File a manual invoice under the branch you're working in, else your
        // own home branch.
        location_id: activeLocationId ?? myHomeLocationId ?? null,
        ...payload,
      });
      if (insErr || !data) {
        setError(t.errorSave);
        setSaving(false);
        return;
      }
      invoiceId = data.id;
    }

    // Replace client links on edit so add/remove also works.
    if (editId) await supabase.from('invoice_clients').delete().eq('invoice_id', invoiceId);
    if (clientIds.length > 0) {
      await supabase.from('invoice_clients').insert(
        clientIds.map((cid) => ({ invoice_id: invoiceId, client_id: cid })),
      );
    }

    router.replace(`/dashboard/facturas/${invoiceId}` as never);
  };

  if (loadingEdit) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
          <SkeletonBlock className="h-7 w-56" />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const heading = editId ? t.headingEdit : t.heading;
  const subtitle = editId ? t.subtitleEdit : t.subtitleNew;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable
          onPress={confirmBack}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-border-soft"
        >
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <View className="ml-2 flex-1">
          <Text className="text-lg font-bold text-ink">{heading}</Text>
          <Text className="text-xs text-faint">{subtitle}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerClassName="px-5 pt-5 pb-44"
          keyboardShouldPersistTaps="handled"
        >
          {/* General info — built-in keys (invoice_number, client, issue_date,
             due_date) + general customs in saved layout order, then the
             structural language selector. */}
          <Section title={sectionLabel.general}>
            <View className="gap-3">
              {generalKeys.map(k => {
                if (k.startsWith('custom:')) {
                  const tpl = templates.find(tp => `custom:${tp.id}` === k);
                  return tpl ? renderCustomField(tpl) : null;
                }
                return renderField(k);
              })}

              {/* Language selector is structural (drives invoice template) — never gated. */}
              <Select
                label={t.languageLabel}
                value={language}
                onValueChange={(v) => setLanguage(v as InvoiceLang)}
                options={[
                  { value: 'es', label: 'Español' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </View>
          </Section>

          {/* Line items */}
          <Section title={t.itemsHeading}>
            <View className="flex flex-col gap-3">
              {lines.map((line) => (
                <View
                  key={line.id}
                  className="bg-surface rounded-2xl p-3 border border-border-soft"
                >
                  <TextInput
                    value={line.description}
                    onChangeText={(v) => updateLine(line.id, 'description', v)}
                    placeholder={t.itemPlaceholder}
                    placeholderTextColor={c.faint}
                    // Wrap + grow with the text instead of clipping a long name,
                    // but cap the height (then it scrolls) so the row can't be
                    // stretched into an endless box.
                    multiline
                    className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-ink"
                    style={{ minHeight: 40, maxHeight: 120, textAlignVertical: 'top' }}
                  />
                  <View className="flex-row items-end gap-2 mt-2">
                    <View className="flex-1">
                      <Text className="text-[10px] text-faint mb-1">{t.colQty}</Text>
                      <TextInput
                        value={formatNumberGrouped(line.qtyText ?? (line.qty ? String(line.qty) : ''))}
                        onChangeText={(v) => {
                          const clean = v.replace(/[^0-9.]/g, '');
                          updateLine(line.id, 'qtyText', clean);
                          updateLine(line.id, 'qty', parseFloat(clean) || 0);
                        }}
                        keyboardType="decimal-pad"
                        placeholder="1"
                        placeholderTextColor={c.faint}
                        className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink text-center"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] text-faint mb-1">{t.colRate}</Text>
                      <TextInput
                        value={formatMoneyInput(line.rateText ?? (line.rate ? String(line.rate) : ''))}
                        onChangeText={(v) => {
                          const clean = v.replace(/[^0-9.-]/g, '').replace(/(?!^)-/g, '');
                          updateLine(line.id, 'rateText', clean);
                          updateLine(line.id, 'rate', parseFloat(clean) || 0);
                        }}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={c.faint}
                        className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink text-right"
                      />
                    </View>
                  </View>
                  {/* Total gets its own row: sharing one with qty + price
                      squeezed a seven-figure amount into a wrapped column. */}
                  <View className="flex-row items-center justify-between mt-2.5">
                    <Text className="text-[11px] text-faint">Total</Text>
                    <View className="flex-row items-center gap-3">
                      <Text className="text-base font-semibold text-ink">
                        {fmtMoney(line.qty * line.rate)}
                      </Text>
                      {lines.length > 1 ? (
                        <Pressable
                          onPress={() => removeLine(line.id)}
                          hitSlop={8}
                          className="p-1.5 rounded-xl active:bg-red-500/10"
                        >
                          <Trash2 size={16} color={c.danger} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}

              {/* Totals */}
              <View className="pt-2 border-t border-border-soft gap-2">
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-muted">{t.subtotal}</Text>
                  <Text className="text-sm font-medium text-ink">{fmtMoney(subtotal)}</Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-muted">{t.taxPercent}</Text>
                  <TextInput
                    value={taxRateText ?? (taxRate ? String(taxRate) : '')}
                    onChangeText={(v) => {
                      const clean = v.replace(/[^0-9.]/g, '');
                      setTaxRateText(clean);
                      setTaxRate(parseFloat(clean) || 0);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={c.faint}
                    className="w-24 rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-ink text-right"
                  />
                </View>
                <View className="flex-row justify-between items-center pt-2 border-t border-border-soft">
                  <Text className="text-base font-bold text-ink">{t.total}</Text>
                  <Text className="text-lg font-bold text-primary">{fmtMoney(total)}</Text>
                </View>
              </View>
            </View>
          </Section>

          {/* Notes section — built-in notes (gated) + notes-assigned customs,
             interleaved in saved layout order. */}
          {(!fHidden('notes') || customFieldsFor('notes').length > 0) && (
          <Section title={sectionLabel.notes} icon={<FileText size={14} color={c.primary} />}>
            <View className="gap-3">
              {invoiceFieldsInSection(invoiceLayout, 'notes').map(k => {
                if (k.startsWith('custom:')) {
                  const tpl = templates.find(tp => `custom:${tp.id}` === k);
                  return tpl ? renderCustomField(tpl) : null;
                }
                if (k === 'notes' && !fHidden('notes')) {
                  return (
                    <View key={k} className="gap-2">
                      {/* Toggle appears only when a default note exists. */}
                      {defaultNote ? (
                        <View className="flex-row gap-1 bg-border-soft p-1 rounded-xl self-start">
                          {(['default', 'custom'] as const).map(m => (
                            <Pressable
                              key={m}
                              onPress={() => {
                                setNotesMode(m);
                                if (m === 'default') setNotes(defaultNote);
                                else if (!notes.trim() || notes.trim() === defaultNote) setNotes(defaultNote);
                              }}
                              className={`px-3 py-1.5 rounded-lg ${notesMode === m ? 'bg-card' : ''}`}
                            >
                              <Text className={`text-xs font-semibold ${notesMode === m ? 'text-primary' : 'text-muted'}`}>
                                {m === 'default' ? t.notesUseDefault : t.notesCustom}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                      {defaultNote && notesMode === 'default' ? (
                        <View className="rounded-2xl border border-border-soft bg-surface px-4 py-3">
                          <Text className="text-sm text-muted">{defaultNote}</Text>
                        </View>
                      ) : (
                        <TextInput
                          value={notes}
                          onChangeText={setNotes}
                          placeholder={t.notesPlaceholder}
                          placeholderTextColor={c.faint}
                          multiline
                          numberOfLines={3}
                          className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink min-h-[80px]"
                          style={{ textAlignVertical: 'top' }}
                        />
                      )}
                    </View>
                  );
                }
                return null;
              })}
            </View>
          </Section>
          )}

          {/* Internal notes — private to the business, never on the invoice. */}
          <Section title={t.internalNotesLabel} icon={<Lock size={14} color={c.primary} />}>
            <TextInput
              value={internalNotes}
              onChangeText={setInternalNotes}
              placeholder={t.internalNotesPlaceholder}
              placeholderTextColor={c.faint}
              multiline
              numberOfLines={3}
              className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink min-h-[80px]"
              style={{ textAlignVertical: 'top' }}
            />
          </Section>

          {/* Additional — custom fields assigned to the 'additional' section. */}
          {customFieldsFor('additional').length > 0 ? (
            <Section title={sectionLabel.additional}>
              <View className="gap-3">
                {customFieldsFor('additional').map(renderCustomField)}
              </View>
            </Section>
          ) : null}

          {error ? (
            <View className="mt-4 rounded-2xl bg-red-500/10 border border-red-100 px-4 py-3">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          {/* Save — last element of the form so it's where the thumb lands
             after filling the final field. */}
          <View className="mt-4">
            {/* Creating an invoice always makes a draft — sending is an explicit
               action from the invoice detail (was mistakenly marking new
               invoices "sent"). */}
            <Button onPress={() => save('draft')} loading={saving} fullWidth>
              {editId ? tc.buttons.saveChanges : t.sendInvoice}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Client picker modal */}
      <RNModal
        visible={clientPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setClientPickerOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          {/* Dark scrim — inline color so it renders without waiting on a
              NativeWind regeneration. */}
          <Pressable
            onPress={() => setClientPickerOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
          {/* Floating card: rounded on all corners, lifted off the screen
              edges with side + bottom margins and a soft shadow. */}
          <View
            className="bg-card rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
            style={{
              height: '80%',
              marginBottom: insets.bottom + 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 24,
              elevation: 24,
            }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="px-5 mb-3 flex-row items-center justify-between">
              <Text className="text-base font-semibold text-ink">{t.clientsLabel}</Text>
              <Pressable onPress={() => setClientPickerOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>
            <View className="px-5 mb-3">
              <View className="flex-row items-center rounded-xl border border-border bg-card px-3">
                <Search size={16} color={c.faint} />
                <TextInput
                  value={clientSearch}
                  onChangeText={setClientSearch}
                  placeholder={t.selectClient}
                  placeholderTextColor={c.faint}
                  autoFocus
                  className="flex-1 py-2.5 pl-2 text-sm text-ink"
                />
              </View>
            </View>
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
              {filteredClients
                .filter((c) => !clientIds.includes(c.id))
                .map((c) => {
                  const { top, sub } = clientPickerDisplay(c);
                  const ct = matchedContactOf(c);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        setClientIds((prev) => [...prev, c.id]);
                        setClientPickerOpen(false);
                        setClientSearch('');
                      }}
                      className="flex-row items-center justify-between px-5 py-3.5 active:bg-surface"
                    >
                      <View className="flex-1">
                        <Text className="text-base text-ink" numberOfLines={1}>
                          {top}
                        </Text>
                        {sub ? (
                          <Text className="text-xs text-faint mt-0.5" numberOfLines={1}>
                            {sub}
                          </Text>
                        ) : null}
                        {ct ? (
                          <Text className="text-xs text-primary mt-0.5" numberOfLines={1}>
                            {ct.name}{ct.role ? `  ·  ${ct.role}` : ''}
                          </Text>
                        ) : null}
                      </View>
                      <Check size={16} color="transparent" />
                    </Pressable>
                  );
                })}
              {filteredClients.filter((c) => !clientIds.includes(c.id)).length === 0 ? (
                <View className="px-5 py-8 items-center">
                  <Text className="text-sm text-faint">—</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </RNModal>
      {unsavedSheet}
    </SafeAreaView>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-5">
      <View className="flex-row items-center gap-2 mb-3 px-1">
        {icon}
        <Text className="text-xs font-semibold text-faint uppercase tracking-wide">
          {title}
        </Text>
      </View>
      <View className="bg-card rounded-2xl border border-border-soft p-4">
        {children}
      </View>
    </View>
  );
}
