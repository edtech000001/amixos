// Payment-reminder log card on the invoice detail (mobile). Self-contained:
// loads, adds and deletes its own rows through the shared invoiceReminders
// lib. The add form expands INLINE (not a bottom sheet) because its date
// picker opens its own RN Modal on iOS, and iOS refuses to present a second
// modal over a sheet (see CLAUDE.md).

import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Bell, BellRing, Mail, MessageSquare, Phone, User, MoreHorizontal, Trash2 } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { DatePicker } from '../../ui/DatePicker';
import { confirm } from '../../ui/confirmBus';
import { formatDateLong, daysSince, todayLocalISO } from '../../lib/format';
import {
  REMINDER_METHODS,
  fetchInvoiceReminders,
  addInvoiceReminder,
  deleteInvoiceReminder,
  type InvoiceReminder,
  type ReminderMethod,
} from '../../lib/invoiceReminders';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface InvoiceRemindersCardProps {
  supabase: SupabaseLike;
  businessId: string;
  invoiceId: string;
  /** invoices.edit — gates logging / deleting reminders. */
  canEdit: boolean;
  /** user id → display name, for "by Ana". */
  nameById?: Record<string, string>;
  /** Called after a reminder is added or removed (e.g. to refresh caches). */
  onChanged?: () => void;
}

const METHOD_ICON: Record<ReminderMethod, typeof Mail> = {
  email: Mail,
  text: MessageSquare,
  call: Phone,
  in_person: User,
  other: MoreHorizontal,
};

// Collapsed history shows the latest few; the rest behind "show all".
const COLLAPSED = 3;

export function InvoiceRemindersCard({ supabase, businessId, invoiceId, canEdit, nameById, onChanged }: InvoiceRemindersCardProps) {
  const { t: ui, locale } = useLang();
  const t = ui.dashboard.invoices.reminders;
  const c = useThemeColors();
  const dateLoc = locale === 'en' ? 'en-US' : 'es-MX';

  const [reminders, setReminders] = useState<InvoiceReminder[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Table missing (migration 228 not run yet) or no read access → hide the card.
  const [unavailable, setUnavailable] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [method, setMethod] = useState<ReminderMethod>('call');
  const [date, setDate] = useState(todayLocalISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setReminders(await fetchInvoiceReminders(supabase, invoiceId));
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    setLoaded(false);
    setFormOpen(false);
    setShowAll(false);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const openForm = () => {
    setMethod('call');
    setDate(todayLocalISO());
    setNote('');
    setError(null);
    setFormOpen(true);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await addInvoiceReminder(supabase, { businessId, invoiceId, remindedOn: date || todayLocalISO(), method, note });
      setFormOpen(false);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: InvoiceReminder) => {
    const ok = await confirm({ message: t.deleteConfirm, confirmText: t.deleteBtn, cancelText: t.cancel, destructive: true });
    if (!ok) return;
    setReminders(prev => prev.filter(x => x.id !== r.id));
    try {
      await deleteInvoiceReminder(supabase, r.id);
      onChanged?.();
    } catch {
      void load(); // put it back if the delete didn't stick
    }
  };

  if (unavailable || !loaded) return null;

  const latest = reminders[0];
  const summary = latest
    ? (() => {
        const n = daysSince(latest.remindedOn);
        return (n === 0 ? t.summaryToday : t.summary.replace('{{n}}', String(n)))
          .replace('{{count}}', String(reminders.length));
      })()
    : t.none;
  const shown = showAll ? reminders : reminders.slice(0, COLLAPSED);

  return (
    <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4">
      <View className="flex-row items-center gap-3">
        <View className={`w-10 h-10 rounded-xl items-center justify-center ${latest ? 'bg-primary/10' : 'bg-amber-500/10'}`}>
          {latest ? <BellRing size={18} color={c.primary} /> : <Bell size={18} color="#f59e0b" />}
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-xs text-faint font-medium">{t.title}</Text>
          <Text className="text-sm font-semibold text-ink">{summary}</Text>
        </View>
      </View>

      {shown.length > 0 ? (
        <View className="mt-3 pt-3 border-t border-border-soft gap-3">
          {shown.map(r => {
            const Icon = METHOD_ICON[r.method];
            const by = r.createdBy && nameById?.[r.createdBy] ? t.byUser.replace('{{name}}', nameById[r.createdBy]) : null;
            return (
              <View key={r.id} className="flex-row items-start gap-3">
                <View className="mt-0.5">
                  <Icon size={16} color={c.muted} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-sm text-ink">
                    <Text className="font-semibold">{t.methods[r.method]}</Text>
                    {` · ${formatDateLong(r.remindedOn, dateLoc)}`}
                  </Text>
                  {by ? <Text className="text-xs text-faint">{by}</Text> : null}
                  {r.note ? <Text className="text-xs text-muted mt-0.5">{r.note}</Text> : null}
                </View>
                {canEdit ? (
                  <Pressable onPress={() => void remove(r)} hitSlop={8} className="p-1 rounded-lg active:bg-red-500/10" accessibilityLabel={t.deleteBtn}>
                    <Trash2 size={15} color={c.faint} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          {reminders.length > COLLAPSED ? (
            <Pressable onPress={() => setShowAll(v => !v)} hitSlop={6}>
              <Text className="text-xs font-semibold text-primary">
                {showAll ? t.showLess : t.showAll.replace('{{n}}', String(reminders.length))}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {canEdit && !formOpen ? (
        <Pressable
          onPress={openForm}
          className="mt-3 flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-primary/30 bg-primary/5 active:opacity-80"
        >
          <BellRing size={16} color={c.primary} />
          <Text className="text-sm font-semibold text-primary">{t.markBtn}</Text>
        </Pressable>
      ) : null}

      {canEdit && formOpen ? (
        <View className="mt-3 pt-3 border-t border-border-soft">
          <Text className="text-sm font-semibold text-ink mb-2">{t.methodLabel}</Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {REMINDER_METHODS.map(m => {
              const Icon = METHOD_ICON[m];
              const active = method === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMethod(m)}
                  className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${active ? 'bg-primary/10 border-primary' : 'bg-card border-border'}`}
                >
                  <Icon size={14} color={active ? c.primary : c.muted} />
                  <Text className={`text-xs font-semibold ${active ? 'text-primary' : 'text-muted'}`}>{t.methods[m]}</Text>
                </Pressable>
              );
            })}
          </View>

          <DatePicker label={t.dateLabel} value={date} onChange={setDate} max={todayLocalISO()} containerClassName="mb-3" />

          <Text className="text-sm font-semibold text-ink mb-1">{t.noteLabel}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t.notePlaceholder}
            placeholderTextColor={c.faint}
            multiline
            className="mb-3 rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink min-h-[64px]"
          />

          {error ? <Text className="text-xs text-red-500 mb-2">{error}</Text> : null}

          <View className="flex-row gap-2">
            <Pressable onPress={() => setFormOpen(false)} className="flex-1 py-3 rounded-2xl items-center border border-border active:bg-surface">
              <Text className="text-sm font-semibold text-muted">{t.cancel}</Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              disabled={saving}
              className={`flex-1 py-3 rounded-2xl items-center flex-row justify-center gap-2 ${saving ? 'bg-primary/50' : 'bg-primary active:opacity-90'}`}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text className="text-sm font-semibold text-white">{t.save}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
