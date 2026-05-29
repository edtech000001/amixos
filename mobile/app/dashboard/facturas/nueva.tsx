import { useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { Button, Input, Select, DatePicker } from '@amixos/shared/ui';
import type { InvoiceLang } from '@amixos/shared';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
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

const genInvoiceNumber = () => {
  const now = new Date();
  return `FAC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
};

const todayISO = () => new Date().toISOString().split('T')[0];

export default function NuevaFacturaRoute() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.invoices.new;
  const tc = full.common;

  const editId = edit ?? null;
  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  const [invoiceNumber, setInvoiceNumber] = useState(genInvoiceNumber());
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [language, setLanguage] = useState<InvoiceLang>('es');
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load clients + optionally the invoice being edited.
  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    (async () => {
      const { data: cl } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .eq('business_id', business.id)
        .order('first_name');
      if (cancelled) return;
      setClients((cl ?? []) as Client[]);

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

  const save = async (status: 'draft' | 'sent') => {
    if (!business) return;
    const validLines = lines.filter((l) => l.description.trim());
    if (validLines.length === 0) {
      setError(t.errorAtLeastOne);
      return;
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
          onPress={goBack}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="ml-2 flex-1">
          <Text className="text-lg font-bold text-gray-900">{heading}</Text>
          <Text className="text-xs text-gray-400">{subtitle}</Text>
        </View>
        <Pressable
          onPress={() => save(editId ? 'draft' : 'sent')}
          disabled={saving}
          hitSlop={8}
          className={`px-3.5 py-1.5 rounded-full ${saving ? 'bg-primary/50' : 'bg-primary active:opacity-80'}`}
        >
          <Text className="text-sm font-semibold text-white">
            {saving ? '…' : tc.buttons.save}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerClassName="px-5 pt-5 pb-32"
          keyboardShouldPersistTaps="handled"
        >
          {/* General info */}
          <Section title={t.generalInfo}>
            <Input
              label={t.invoiceNumberLabel}
              value={invoiceNumber}
              onChangeText={setInvoiceNumber}
            />

            <View className="flex flex-col gap-2 mt-3">
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

            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                <DatePicker label={t.issueDateLabel} value={issueDate} onChange={setIssueDate} />
              </View>
              <View className="flex-1">
                <DatePicker label={t.dueDateLabel} value={dueDate} onChange={setDueDate} />
              </View>
            </View>

            <View className="mt-3">
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

          {/* Notes */}
          <Section title={t.notesLabel} icon={<FileText size={14} color="#4F46E5" />}>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t.notesPlaceholder}
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[80px]"
              style={{ textAlignVertical: 'top' }}
            />
          </Section>

          {error ? (
            <View className="mt-4 rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Sticky footer */}
        <View
          className="border-t border-gray-100 bg-white px-5 pt-3"
          style={{ paddingBottom: Platform.OS === 'ios' ? 24 : 16 }}
        >
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
      </KeyboardAvoidingView>

      {/* Client picker modal */}
      <RNModal
        visible={clientPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setClientPickerOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            onPress={() => setClientPickerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <View
            className="bg-white rounded-t-3xl pt-3 pb-8"
            style={{ height: '85%' }}
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
