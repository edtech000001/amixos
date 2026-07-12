// Web (DOM) variant of CommunicationLog — see CommunicationLog.tsx for the
// native version. The shared RN + NativeWind component renders unstyled on web
// (classNames don't apply through react-native-web in the Next.js build), so
// this pure-DOM port mirrors its behavior with plain HTML + Tailwind. Same
// props + logic; only the rendering differs. webpack resolves `.web.tsx` first.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Phone, MessageSquare, Mail, Users, MessageCircle, FileText,
  Plus, Pencil, Trash2, type LucideIcon,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLang } from '../../i18n';
import { formatRelativeLong, formatDateTimeLong } from '../../lib/format';
import { confirm } from '../../ui/confirmBus';
import {
  fetchClientCommunications,
  logClientCommunication,
  updateClientCommunication,
  deleteClientCommunication,
  type ClientCommunicationEntry,
  type CommType,
  type CommOutcome,
  type CommDirection,
} from '../../lib/clientCommunications';

interface ContactOption {
  id: string;
  name: string;
}

interface Props {
  supabase: SupabaseClient;
  businessId: string;
  clientId: string;
  /** Show add/edit/delete affordances. Default true. */
  canWrite?: boolean;
  createdBy?: string | null;
  /** Contact people for the attribution picker (optional). */
  contacts?: ContactOption[];
  /** Bump to force a refetch — e.g. after a quick-action prompt logs a row. */
  reloadToken?: number;
}

const ICONS: Record<CommType, LucideIcon> = {
  call: Phone,
  sms: MessageSquare,
  email: Mail,
  in_person: Users,
  whatsapp: MessageCircle,
  note: FileText,
};

const COLORS: Record<CommType, string> = {
  call: '#0891B2',
  sms: '#059669',
  email: '#7C3AED',
  in_person: '#D97706',
  whatsapp: '#16A34A',
  note: '#6B7280',
};

const ALL_TYPES: CommType[] = ['call', 'sms', 'email', 'in_person', 'whatsapp', 'note'];

function outcomesFor(type: CommType): CommOutcome[] {
  switch (type) {
    case 'call': return ['connected', 'no_answer', 'left_voicemail'];
    case 'sms':
    case 'email':
    case 'whatsapp': return ['sent'];
    default: return [];
  }
}

// ISO timestamp → "YYYY-MM-DDTHH:MM" local string for the datetime-local input.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type CommLogT = ReturnType<typeof useLang>['t']['dashboard']['clients']['detail']['commLog'];

const fieldLabel = 'block text-xs font-medium text-gray-600 mb-1';
const fieldInput =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40';

export function CommunicationLog({
  supabase,
  businessId,
  clientId,
  canWrite = true,
  createdBy,
  contacts = [],
  reloadToken = 0,
}: Props) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.clients.detail.commLog;

  const [entries, setEntries] = useState<ClientCommunicationEntry[] | null>(null);

  // Type filter chips at the top of the timeline. All types start enabled, so
  // by default the full log shows; clicking a chip hides that type. Not
  // persisted — every open starts with everything enabled.
  const [typeFilter, setTypeFilter] = useState<Set<CommType>>(() => new Set(ALL_TYPES));
  const toggleType = (ty: CommType) =>
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(ty)) next.delete(ty);
      else next.add(ty);
      return next;
    });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientCommunicationEntry | null>(null);
  const [fType, setFType] = useState<CommType>('call');
  const [fOutcome, setFOutcome] = useState<CommOutcome | ''>('');
  const [fDirection, setFDirection] = useState<CommDirection>('outbound');
  const [fOccurred, setFOccurred] = useState('');
  const [fNote, setFNote] = useState('');
  const [fContact, setFContact] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const rows = await fetchClientCommunications(supabase, clientId);
    setEntries(rows);
  }, [supabase, clientId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchClientCommunications(supabase, clientId);
      if (!cancelled) setEntries(rows);
    })();
    return () => { cancelled = true; };
  }, [supabase, clientId, reloadToken]);

  const openAdd = () => {
    setEditing(null);
    setFType('call');
    setFOutcome('');
    setFDirection('outbound');
    setFOccurred(toLocalInput(new Date().toISOString()));
    setFNote('');
    setFContact('');
    setFormOpen(true);
  };

  const openEdit = (e: ClientCommunicationEntry) => {
    setEditing(e);
    setFType(e.type);
    setFOutcome(e.outcome ?? '');
    setFDirection(e.direction);
    setFOccurred(toLocalInput(e.occurred_at));
    setFNote(e.note ?? '');
    setFContact(e.client_contact_id ?? '');
    setFormOpen(true);
  };

  const onTypeChange = (next: CommType) => {
    setFType(next);
    const valid = outcomesFor(next);
    if (fOutcome && !valid.includes(fOutcome as CommOutcome)) setFOutcome('');
  };

  const save = async () => {
    setSaving(true);
    const occurredAt = fOccurred ? new Date(fOccurred).toISOString() : undefined;
    const outcome = (fOutcome || null) as CommOutcome | null;
    const contactId = fContact || null;
    if (editing) {
      await updateClientCommunication(supabase, editing.id, {
        type: fType,
        direction: fDirection,
        outcome,
        note: fNote.trim() || null,
        clientContactId: contactId,
        occurredAt,
      });
    } else {
      await logClientCommunication(supabase, {
        businessId,
        clientId,
        type: fType,
        direction: fDirection,
        outcome,
        note: fNote.trim() || null,
        clientContactId: contactId,
        occurredAt,
        createdBy,
      });
    }
    setSaving(false);
    setFormOpen(false);
    await load();
  };

  const remove = (e: ClientCommunicationEntry) => {
    void confirm({ message: t.form.confirmDelete, destructive: true }).then(async ok => {
      if (!ok) return;
      await deleteClientCommunication(supabase, e.id);
      await load();
    });
  };

  const outcomeChoices = useMemo(() => outcomesFor(fType), [fType]);

  // Only offer a filter chip for types that appear in this client's log, in
  // ALL_TYPES order for a stable layout.
  const presentTypes = useMemo(
    () => (entries ? ALL_TYPES.filter(ty => entries.some(e => e.type === ty)) : []),
    [entries],
  );
  const visibleEntries = useMemo(
    () => (entries ?? []).filter(e => typeFilter.has(e.type)),
    [entries, typeFilter],
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.heading}</h2>
        {canWrite ? (
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label={t.add}
          >
            <Plus size={15} className="text-primary" />
            <span className="text-sm font-medium text-primary">{t.add}</span>
          </button>
        ) : null}
      </div>

      {entries === null ? (
        <div className="py-8 flex justify-center">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="py-6 flex justify-center">
          <span className="text-sm text-gray-400">{t.empty}</span>
        </div>
      ) : (
        <>
          {/* Type filter chips — only when more than one type is present. */}
          {presentTypes.length > 1 ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {presentTypes.map(ty => {
                const Icon = ICONS[ty];
                const color = COLORS[ty];
                const active = typeFilter.has(ty);
                return (
                  <button
                    key={ty}
                    type="button"
                    onClick={() => toggleType(ty)}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                      active ? 'border-transparent' : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'
                    }`}
                    style={active ? { backgroundColor: `${color}1A`, color } : undefined}
                  >
                    <Icon size={13} style={{ color: active ? color : '#9CA3AF' }} />
                    {t.types[ty]}
                  </button>
                );
              })}
            </div>
          ) : null}

          {visibleEntries.length === 0 ? (
            <div className="py-6 flex justify-center">
              <span className="text-sm text-gray-400">{t.emptyFiltered}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleEntries.map(e => (
                <CommRow
                  key={e.id}
                  entry={e}
                  t={t}
                  locale={locale}
                  canWrite={canWrite}
                  onEdit={() => openEdit(e)}
                  onDelete={() => remove(e)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setFormOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto"
            onClick={ev => ev.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 mb-4">
              {editing ? t.form.editTitle : t.form.addTitle}
            </h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className={fieldLabel}>{t.form.typeLabel}</label>
                <select className={fieldInput} value={fType} onChange={e => onTypeChange(e.target.value as CommType)}>
                  {ALL_TYPES.map(ty => <option key={ty} value={ty}>{t.types[ty]}</option>)}
                </select>
              </div>

              {outcomeChoices.length > 0 ? (
                <div>
                  <label className={fieldLabel}>{t.form.outcomeLabel}</label>
                  <select className={fieldInput} value={fOutcome} onChange={e => setFOutcome(e.target.value as CommOutcome | '')}>
                    <option value="">{t.form.outcomeNone}</option>
                    {outcomeChoices.map(o => <option key={o} value={o}>{t.outcomes[o]}</option>)}
                  </select>
                </div>
              ) : null}

              <div>
                <label className={fieldLabel}>{t.form.directionLabel}</label>
                <select className={fieldInput} value={fDirection} onChange={e => setFDirection(e.target.value as CommDirection)}>
                  <option value="outbound">{t.form.directionOutbound}</option>
                  <option value="inbound">{t.form.directionInbound}</option>
                </select>
              </div>

              {contacts.length > 0 ? (
                <div>
                  <label className={fieldLabel}>{t.form.contactLabel}</label>
                  <select className={fieldInput} value={fContact} onChange={e => setFContact(e.target.value)}>
                    <option value="">{t.form.contactNone}</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : null}

              <div>
                <label className={fieldLabel}>{t.form.dateLabel}</label>
                <input type="datetime-local" className={fieldInput} value={fOccurred} onChange={e => setFOccurred(e.target.value)} />
              </div>

              <div>
                <label className={fieldLabel}>{t.form.noteLabel}</label>
                <textarea
                  className={`${fieldInput} min-h-[72px] resize-y`}
                  value={fNote}
                  onChange={e => setFNote(e.target.value)}
                  placeholder={t.form.notePlaceholder}
                  rows={3}
                />
              </div>

              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="flex-1 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold py-2.5 text-sm hover:bg-gray-50 transition-colors"
                >
                  {t.form.cancel}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-primary text-white font-semibold py-2.5 text-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {saving ? '…' : t.form.save}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CommRow({
  entry,
  t,
  locale,
  canWrite,
  onEdit,
  onDelete,
}: {
  entry: ClientCommunicationEntry;
  t: CommLogT;
  locale: string;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = ICONS[entry.type] ?? FileText;
  const color = COLORS[entry.type] ?? '#6B7280';
  const label = t.types[entry.type] ?? entry.type;
  const outcome = entry.outcome ? t.outcomes[entry.outcome] : null;
  const contactName = entry.client_contacts?.name ?? null;
  const rel = formatRelativeLong(entry.occurred_at, t.rel);

  const metaParts: string[] = [];
  if (outcome) metaParts.push(outcome);
  if (contactName) metaParts.push(t.withContact.replace('{{name}}', contactName));
  const meta = metaParts.join(' · ');

  return (
    <div className="flex items-start gap-3">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}1A` }}
      >
        <Icon size={16} color={color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <span className="text-xs text-gray-400 shrink-0" title={formatDateTimeLong(entry.occurred_at, locale)}>
            {rel}
          </span>
        </div>
        {meta ? <p className="text-xs text-gray-500 mt-0.5">{meta}</p> : null}
        {entry.note ? <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{entry.note}</p> : null}
      </div>
      {canWrite ? (
        <div className="flex gap-1 shrink-0">
          <button type="button" onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" aria-label={t.form.edit}>
            <Pencil size={14} className="text-gray-400" />
          </button>
          <button type="button" onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" aria-label={t.form.delete}>
            <Trash2 size={14} className="text-red-500" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
