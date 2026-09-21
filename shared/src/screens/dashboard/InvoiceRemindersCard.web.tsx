// Payment-reminder log card on the invoice detail (web). Mirrors the native
// InvoiceRemindersCard.tsx: self-contained load/add/delete through the shared
// invoiceReminders lib, with the add form expanding inline in the card.

import { useEffect, useState } from 'react';
import { Bell, BellRing, Mail, MessageSquare, Phone, User, MoreHorizontal, Trash2 } from 'lucide-react';
import { useLang } from '../../i18n';
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

// Same props as the native card (kept local — importing './InvoiceRemindersCard'
// from here would resolve back to this .web file under the web bundler).
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
  /** Bump to force a reload — e.g. after a resend logs an email reminder. */
  refreshToken?: number;
}

const METHOD_ICON: Record<ReminderMethod, typeof Mail> = {
  email: Mail,
  text: MessageSquare,
  call: Phone,
  in_person: User,
  other: MoreHorizontal,
};

const COLLAPSED = 3;

export function InvoiceRemindersCard({ supabase, businessId, invoiceId, canEdit, nameById, onChanged, refreshToken }: InvoiceRemindersCardProps) {
  const { t: ui, locale } = useLang();
  const t = ui.dashboard.invoices.reminders;
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
  }, [invoiceId, refreshToken]);

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
      void load();
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
    <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${latest ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-500'}`}>
          {latest ? <BellRing size={18} /> : <Bell size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-faint font-medium">{t.title}</p>
          <p className="text-sm font-semibold text-ink">{summary}</p>
        </div>
      </div>

      {shown.length > 0 ? (
        <ul className="mt-4 pt-4 border-t border-border-soft space-y-3">
          {shown.map(r => {
            const Icon = METHOD_ICON[r.method];
            const by = r.createdBy && nameById?.[r.createdBy] ? t.byUser.replace('{{name}}', nameById[r.createdBy]) : null;
            return (
              <li key={r.id} className="group flex items-start gap-3">
                <Icon size={16} className="mt-0.5 shrink-0 text-muted" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink">
                    <span className="font-semibold">{t.methods[r.method]}</span>
                    {` · ${formatDateLong(r.remindedOn, dateLoc)}`}
                    {by ? <span className="text-xs text-faint">{` · ${by}`}</span> : null}
                  </p>
                  {r.note ? <p className="text-xs text-muted mt-0.5 whitespace-pre-wrap">{r.note}</p> : null}
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void remove(r)}
                    aria-label={t.deleteBtn}
                    className="p-1 rounded-lg text-faint hover:text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </li>
            );
          })}
          {reminders.length > COLLAPSED ? (
            <li>
              <button type="button" onClick={() => setShowAll(v => !v)} className="text-xs font-semibold text-primary hover:underline">
                {showAll ? t.showLess : t.showAll.replace('{{n}}', String(reminders.length))}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* Card sits in the detail's narrow left column — button + form stack. */}
      {canEdit && !formOpen ? (
        <button
          type="button"
          onClick={openForm}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/30 bg-primary/5 text-sm font-semibold text-primary hover:bg-primary/10"
        >
          <BellRing size={15} />
          {t.markBtn}
        </button>
      ) : null}

      {canEdit && formOpen ? (
        <div className="mt-4 pt-4 border-t border-border-soft">
          <p className="text-sm font-semibold text-ink mb-2">{t.methodLabel}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {REMINDER_METHODS.map(m => {
              const Icon = METHOD_ICON[m];
              const active = method === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                    active ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'
                  }`}
                >
                  <Icon size={14} />
                  {t.methods[m]}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 mb-3">
            <DatePicker label={t.dateLabel} value={date} onChange={setDate} max={todayLocalISO()} />
            <div>
              <label className="block text-sm font-semibold text-ink mb-2">{t.noteLabel}</label>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t.notePlaceholder}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {error ? <p className="text-xs text-red-500 mb-2">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted hover:bg-surface"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-primary text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {t.save}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
