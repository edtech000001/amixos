import { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useDirty, useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Button, Input, Select, DatePicker } from '@amixos/shared/ui';
import type { InvoiceLang } from '@amixos/shared';
import { invoiceDefaultLanguage, nextInvoiceNumber } from '@amixos/shared/lib/invoiceTemplate';
import { parseHiddenFields, isFieldHidden } from '@amixos/shared/lib/fieldLayout';
import { groupNumberString, parseFieldConfig, sanitizeNumberInput, splitMultiValue, toggleMultiOption } from '@amixos/shared/lib/fieldTemplates';
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
  const { business } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.invoices.new;
  const tc = full.common;

  const editId = edit ?? null;
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
  // New invoices start at the business default (Ajustes → Facturas);
  // editing an existing invoice overwrites this with its stored rate.
  const [taxRate, setTaxRate] = useState(() => business?.invoice_tax_rate ?? 0);
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
    const days = business.invoice_due_days;
    if (days != null && days >= 0 && issueDate && !dueDate) {
      setDueDate(addDaysISO(issueDate, days));
      dueDefaultedRef.current = true;
    }
  }, [editId, business, issueDate, dueDate]);

  // New invoices start in the business's default language (Invoice theme).
  // Edit mode loads the invoice's own language below; the ref guard means a
  // manual change to the dropdown is never overwritten.
  const langDefaultedRef = useRef(false);
  useEffect(() => {
    if (editId || langDefaultedRef.current || !business) return;
    setLanguage(invoiceDefaultLanguage(business.invoice_template));
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
      const [{ data: cl }, { data: tpls }] = await Promise.all([
        supabase
          .from('clients')
          .select('id, first_name, last_name')
          .eq('business_id', business.id)
          .order('first_name'),
        supabase
          .from('invoice_field_templates')
          .select('*')
          .eq('business_id', business.id)
          .order('sort_order'),
      ]);
      if (cancelled) return;
      setClients((cl ?? []) as Client[]);
      setTemplates((tpls ?? []) as FieldTemplate[]);

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
          setTaxRate(inv.tax_rate ?? 0);
          setLanguage((inv.language as InvoiceLang) ?? 'es');
          setCustomFields((inv.custom_fields as Record<string, string> | null) ?? {});
          const items = (inv.line_items as { description: string; qty: number; rate: number }[] | null) ?? [];
          setLines(
            items.length > 0
              ? items.map((i) => ({ id: newId(), description: i.description, qty: i.qty, rate: i.rate }))
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
  }, [business?.id, editId]);

  // Auto-append a blank line when the last row has a description.
  useEffect(() => {
    if (lines.length === 0) return;
    if (lines.every((l) => l.description.trim() !== '')) {
      setLines((prev) => [...prev, newLine()]);
    }
  }, [lines.map((l) => l.description).join('|')]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return q
      ? clients.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q))
      : clients;
  }, [clients, clientSearch]);

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
          <Text className="text-sm font-semibold text-gray-700 mb-2">{labelText}</Text>
          <TextInput
            value={value}
            onChangeText={setVal}
            multiline
            numberOfLines={4}
            placeholderTextColor="#9CA3AF"
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[90px]"
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
            <Text className="text-sm font-semibold text-gray-700 mb-2">{labelText}</Text>
            <View className="flex-row flex-wrap gap-2">
              {tpl.field_options.map(o => {
                const on = selected.includes(o);
                return (
                  <Pressable
                    key={o}
                    onPress={() => setVal(toggleMultiOption(value, o))}
                    className={`rounded-full border px-4 py-2 ${on ? 'border-primary bg-primary/10' : 'border-gray-200 bg-white'}`}
                  >
                    <Text className={`text-sm font-medium ${on ? 'text-primary' : 'text-gray-600'}`}>{o}</Text>
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
          <Text className="text-sm font-semibold text-gray-700 mb-2">{labelText}</Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setVal(yesActive ? '' : 'true')}
              className={`flex-1 rounded-2xl border px-4 py-3 items-center ${yesActive ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}`}
            >
              <Text className={`text-sm font-semibold ${yesActive ? 'text-white' : 'text-gray-700'}`}>
                {tc.states.yes}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setVal(noActive ? '' : 'false')}
              className={`flex-1 rounded-2xl border px-4 py-3 items-center ${noActive ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}`}
            >
              <Text className={`text-sm font-semibold ${noActive ? 'text-white' : 'text-gray-700'}`}>
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
            <Text className="text-sm font-semibold text-gray-700">{t.clientsLabel}</Text>
            {clientIds.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {clientIds.map((cid) => {
                  const c = clients.find((cl) => cl.id === cid);
                  if (!c) return null;
                  return (
                    <View
                      key={cid}
                      className="flex-row items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1.5"
                    >
                      <Text className="text-xs font-medium text-gray-700">
                        {c.first_name} {c.last_name}
                      </Text>
                      <Pressable
                        onPress={() => setClientIds((prev) => prev.filter((id) => id !== cid))}
                        hitSlop={6}
                      >
                        <X size={12} color="#6B7280" />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}
            <Pressable
              onPress={() => setClientPickerOpen(true)}
              className="flex-row items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5"
            >
              <Text className="text-base text-gray-400 flex-1">
                {clientIds.length === 0 ? t.selectClient : t.addAnotherClient}
              </Text>
              <ChevronDown size={16} color="#9CA3AF" />
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

  const subtotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const updateLine = <K extends keyof LineItem>(id: string, field: K, value: LineItem[K]) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

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
    if (validLines.length === 0) {
      setError(t.errorAtLeastOne);
      return;
    }
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
      line_items: validLines.map((l) => ({ description: l.description, qty: l.qty, rate: l.rate })),
      subtotal_amount: subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: total,
      notes: notes.trim() || null,
      language,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
    };

    let invoiceId: string;
    if (editId) {
      const { error: upErr } = await supabase.from('invoices').update(payload).eq('id', editId);
      if (upErr) {
        setError(t.errorSave);
        setSaving(false);
        return;
      }
      invoiceId = editId;
    } else {
      const { data, error: insErr } = await supabase
        .from('invoices')
        .insert({ business_id: business.id, status, ...payload })
        .select()
        .single();
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
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#4F46E5" />
      </SafeAreaView>
    );
  }

  const heading = editId ? t.headingEdit : t.heading;
  const subtitle = editId ? t.subtitleEdit : t.subtitleNew;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable
          onPress={confirmBack}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="ml-2 flex-1">
          <Text className="text-lg font-bold text-gray-900">{heading}</Text>
          <Text className="text-xs text-gray-400">{subtitle}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerClassName="px-5 pt-5 pb-32"
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
                  className="bg-gray-50 rounded-2xl p-3 border border-gray-100"
                >
                  <TextInput
                    value={line.description}
                    onChangeText={(v) => updateLine(line.id, 'description', v)}
                    placeholder={t.itemPlaceholder}
                    placeholderTextColor="#9CA3AF"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                  />
                  <View className="flex-row items-center gap-2 mt-2">
                    <View className="flex-1">
                      <Text className="text-[10px] text-gray-400 mb-1">{t.colQty}</Text>
                      <TextInput
                        value={line.qty ? String(line.qty) : ''}
                        onChangeText={(v) =>
                          updateLine(line.id, 'qty', parseFloat(v) || 0)
                        }
                        keyboardType="decimal-pad"
                        placeholder="1"
                        placeholderTextColor="#9CA3AF"
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 text-center"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] text-gray-400 mb-1">{t.colRate}</Text>
                      <TextInput
                        value={line.rate ? String(line.rate) : ''}
                        onChangeText={(v) =>
                          updateLine(line.id, 'rate', parseFloat(v) || 0)
                        }
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#9CA3AF"
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 text-right"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] text-gray-400 mb-1">Total</Text>
                      <View className="rounded-xl bg-white px-3 py-2 border border-gray-100">
                        <Text className="text-sm font-semibold text-gray-900 text-right">
                          {fmtMoney(line.qty * line.rate)}
                        </Text>
                      </View>
                    </View>
                    {lines.length > 1 ? (
                      <Pressable
                        onPress={() => removeLine(line.id)}
                        hitSlop={8}
                        className="p-2 rounded-xl active:bg-red-50 self-end"
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </Pressable>
                    ) : (
                      <View style={{ width: 32 }} />
                    )}
                  </View>
                </View>
              ))}

              {/* Totals */}
              <View className="pt-2 border-t border-gray-100 gap-2">
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-gray-500">{t.subtotal}</Text>
                  <Text className="text-sm font-medium text-gray-900">{fmtMoney(subtotal)}</Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-gray-500">{t.taxPercent}</Text>
                  <TextInput
                    value={taxRate ? String(taxRate) : ''}
                    onChangeText={(v) => setTaxRate(parseFloat(v) || 0)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                    className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 text-right"
                  />
                </View>
                <View className="flex-row justify-between items-center pt-2 border-t border-gray-100">
                  <Text className="text-base font-bold text-gray-900">{t.total}</Text>
                  <Text className="text-lg font-bold text-primary">{fmtMoney(total)}</Text>
                </View>
              </View>
            </View>
          </Section>

          {/* Notes section — built-in notes (gated) + notes-assigned customs,
             interleaved in saved layout order. */}
          {(!fHidden('notes') || customFieldsFor('notes').length > 0) && (
          <Section title={sectionLabel.notes} icon={<FileText size={14} color="#4F46E5" />}>
            <View className="gap-3">
              {invoiceFieldsInSection(invoiceLayout, 'notes').map(k => {
                if (k.startsWith('custom:')) {
                  const tpl = templates.find(tp => `custom:${tp.id}` === k);
                  return tpl ? renderCustomField(tpl) : null;
                }
                if (k === 'notes' && !fHidden('notes')) {
                  return (
                    <TextInput
                      key={k}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder={t.notesPlaceholder}
                      placeholderTextColor="#9CA3AF"
                      multiline
                      numberOfLines={3}
                      className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[80px]"
                      style={{ textAlignVertical: 'top' }}
                    />
                  );
                }
                return null;
              })}
            </View>
          </Section>
          )}

          {/* Additional — custom fields assigned to the 'additional' section. */}
          {customFieldsFor('additional').length > 0 ? (
            <Section title={sectionLabel.additional}>
              <View className="gap-3">
                {customFieldsFor('additional').map(renderCustomField)}
              </View>
            </Section>
          ) : null}

          {error ? (
            <View className="mt-4 rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          {/* Save — last element of the form so it's where the thumb lands
             after filling the final field. */}
          <View className="mt-4">
            {editId ? (
              <Button onPress={() => save('draft')} loading={saving} fullWidth>
                {tc.buttons.saveChanges}
              </Button>
            ) : (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button variant="secondary" onPress={() => save('draft')} loading={saving} fullWidth>
                    {t.saveDraft}
                  </Button>
                </View>
                <View className="flex-1">
                  <Button onPress={() => save('sent')} loading={saving} fullWidth>
                    {t.sendInvoice}
                  </Button>
                </View>
              </View>
            )}
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
            className="bg-white rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
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
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="px-5 mb-3">
              <Text className="text-base font-semibold text-gray-900">{t.clientsLabel}</Text>
            </View>
            <View className="px-5 mb-3">
              <View className="flex-row items-center rounded-xl border border-gray-200 bg-white px-3">
                <Search size={16} color="#9CA3AF" />
                <TextInput
                  value={clientSearch}
                  onChangeText={setClientSearch}
                  placeholder={t.selectClient}
                  placeholderTextColor="#9CA3AF"
                  autoFocus
                  className="flex-1 py-2.5 pl-2 text-sm text-gray-900"
                />
              </View>
            </View>
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
              {filteredClients
                .filter((c) => !clientIds.includes(c.id))
                .map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setClientIds((prev) => [...prev, c.id]);
                      setClientPickerOpen(false);
                      setClientSearch('');
                    }}
                    className="flex-row items-center justify-between px-5 py-3.5 active:bg-gray-50"
                  >
                    <Text className="text-sm text-gray-900 flex-1" numberOfLines={1}>
                      {c.first_name} {c.last_name}
                    </Text>
                    <Check size={16} color="transparent" />
                  </Pressable>
                ))}
              {filteredClients.filter((c) => !clientIds.includes(c.id)).length === 0 ? (
                <View className="px-5 py-8 items-center">
                  <Text className="text-sm text-gray-400">—</Text>
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
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {title}
        </Text>
      </View>
      <View className="bg-white rounded-2xl border border-gray-100 p-4">
        {children}
      </View>
    </View>
  );
}
