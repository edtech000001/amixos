// Communication timeline for a client — newest first. Records of every
// call / text / email (logged via the "confirm outcome after" quick-action
// flow) plus manual entries (in-person, WhatsApp, note). Add / edit / delete
// when the caller passes canWrite.
//
// Universal component: built on the shared/ui primitives (Modal, Select,
// Input, DatePicker, Button) + react-native View/Text, so it renders on
// both mobile (Expo) and web (react-native-web) with identical behavior.
// See migration 048 + shared/lib/clientCommunications.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SkeletonRow } from '../../ui/Skeleton';
import { View, Text, Pressable, Alert } from 'react-native';
import {
  Phone, MessageSquare, Mail, Users, MessageCircle, FileText,
  Plus, Pencil, Trash2,
} from 'lucide-react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { formatRelativeLong, formatDateTimeLong } from '../../lib/format';
import { Modal, Input, Button, DatePicker } from '../../ui';
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

const ICONS: Record<CommType, typeof Phone> = {
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

// Which outcomes apply to each type (note/in_person have none).
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
  const c = useThemeColors();
  const t = full.dashboard.clients.detail.commLog;

  const [entries, setEntries] = useState<ClientCommunicationEntry[] | null>(null);

  // Type filter chips at the top of the timeline. All types start enabled, so
  // by default the full log shows; tapping a chip hides that type. Not
  // persisted — every open starts with everything enabled.
  const [typeFilter, setTypeFilter] = useState<Set<CommType>>(() => new Set(ALL_TYPES));
  const toggleType = (ty: CommType) =>
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(ty)) next.delete(ty);
      else next.add(ty);
      return next;
    });

  // Form modal state.
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

  // Reset outcome if it's no longer valid for the chosen type.
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
    const doDelete = async () => {
      await deleteClientCommunication(supabase, e.id);
      await load();
    };
    Alert.alert('', t.form.confirmDelete, [
      { text: t.form.cancel, style: 'cancel' },
      { text: t.form.delete, style: 'destructive', onPress: doDelete },
    ]);
  };

  const typeOptions = useMemo(
    () => ALL_TYPES.map(ty => ({ value: ty, label: t.types[ty] })),
    [t],
  );
  const outcomeOptions = useMemo(() => {
    const valid = outcomesFor(fType);
    return [
      { value: '', label: t.form.outcomeNone },
      ...valid.map(o => ({ value: o, label: t.outcomes[o] })),
    ];
  }, [fType, t]);
  const contactOptions = useMemo(
    () => [
      { value: '', label: t.form.contactNone },
      ...contacts.map(c => ({ value: c.id, label: c.name })),
    ],
    [contacts, t],
  );

  // Only show a filter chip for types that actually appear in this client's
  // log (no point offering "Email" if they've never emailed). Keep ALL_TYPES
  // order for a stable layout.
  const presentTypes = useMemo(
    () => (entries ? ALL_TYPES.filter(ty => entries.some(e => e.type === ty)) : []),
    [entries],
  );
  const visibleEntries = useMemo(
    () => (entries ?? []).filter(e => typeFilter.has(e.type)),
    [entries, typeFilter],
  );

  return (
    <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-xs font-semibold text-muted uppercase tracking-wide">
          {t.heading}
        </Text>
        {canWrite ? (
          <Pressable
            onPress={openAdd}
            className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg active:bg-border-soft"
            accessibilityLabel={t.add}
          >
            <Plus size={15} color={c.primary} />
            <Text className="text-sm font-medium text-primary">{t.add}</Text>
          </Pressable>
        ) : null}
      </View>

      {entries === null ? (
        <View>
          {[0, 1, 2].map(i => <SkeletonRow key={i} />)}
        </View>
      ) : entries.length === 0 ? (
        <View className="py-6 items-center">
          <Text className="text-sm text-faint">{t.empty}</Text>
        </View>
      ) : (
        <>
          {/* Type filter chips — only when more than one type is present. */}
          {presentTypes.length > 1 ? (
            <View className="flex-row flex-wrap gap-2 mb-4">
              {presentTypes.map(ty => {
                const Icon = ICONS[ty];
                const color = COLORS[ty];
                const active = typeFilter.has(ty);
                return (
                  <Pressable
                    key={ty}
                    onPress={() => toggleType(ty)}
                    className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                      active ? 'border-transparent' : 'border-border bg-card active:bg-surface'
                    }`}
                    style={active ? { backgroundColor: `${color}1A` } : undefined}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t.types[ty]}
                  >
                    <Icon size={13} color={active ? color : c.faint} />
                    <Text className="text-xs font-medium" style={{ color: active ? color : c.faint }}>
                      {t.types[ty]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {visibleEntries.length === 0 ? (
            <View className="py-6 items-center">
              <Text className="text-sm text-faint">{t.emptyFiltered}</Text>
            </View>
          ) : (
            <View className="gap-3">
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
            </View>
          )}
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t.form.editTitle : t.form.addTitle}
        size="sm"
      >
        <View className="gap-4">
          {/* Inline pills instead of Select (a Select opens a nested RNModal,
             which renders empty inside this form modal on iOS). */}
          <PillGroup
            label={t.form.typeLabel}
            value={fType}
            options={typeOptions}
            onChange={v => onTypeChange(v as CommType)}
          />
          {outcomesFor(fType).length > 0 ? (
            <PillGroup
              label={t.form.outcomeLabel}
              value={fOutcome}
              options={outcomeOptions}
              onChange={v => setFOutcome(v as CommOutcome | '')}
            />
          ) : null}
          <PillGroup
            label={t.form.directionLabel}
            value={fDirection}
            options={[
              { value: 'outbound', label: t.form.directionOutbound },
              { value: 'inbound', label: t.form.directionInbound },
            ]}
            onChange={v => setFDirection(v as CommDirection)}
          />
          {contacts.length > 0 ? (
            <PillGroup
              label={t.form.contactLabel}
              value={fContact}
              options={contactOptions}
              onChange={setFContact}
            />
          ) : null}
          <DatePicker
            label={t.form.dateLabel}
            mode="datetime-local"
            value={fOccurred}
            onChange={setFOccurred}
          />
          <Input
            label={t.form.noteLabel}
            value={fNote}
            onChangeText={setFNote}
            placeholder={t.form.notePlaceholder}
            multiline
            numberOfLines={3}
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
          <View className="flex-row gap-3 mt-1">
            <Button variant="secondary" className="flex-1" onPress={() => setFormOpen(false)}>
              {t.form.cancel}
            </Button>
            <Button className="flex-1" loading={saving} onPress={save}>
              {t.form.save}
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Inline single-select via wrapping pills — avoids the nested-RNModal picker
// (Select) which renders empty inside the form modal on iOS.
function PillGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-ink">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map(o => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value || '__none__'}
              onPress={() => onChange(o.value)}
              className={`px-3.5 py-2 rounded-xl border ${
                active ? 'bg-primary border-primary' : 'bg-card border-border active:bg-surface'
              }`}
            >
              <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-ink'}`}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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
  const c = useThemeColors();
  const Icon = ICONS[entry.type] ?? FileText;
  const color = COLORS[entry.type] ?? '#6B7280';
  const label = t.types[entry.type] ?? entry.type;
  const outcome = entry.outcome ? t.outcomes[entry.outcome] : null;
  const contactName = entry.client_contacts?.name ?? null;
  const rel = formatRelativeLong(entry.occurred_at, t.rel);

  // Meta line: outcome · with {contact}
  const metaParts: string[] = [];
  if (outcome) metaParts.push(outcome);
  if (contactName) metaParts.push(t.withContact.replace('{{name}}', contactName));
  const meta = metaParts.join(' · ');

  return (
    <View className="flex-row items-start gap-3">
      <View
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: `${color}1A` }}
      >
        <Icon size={16} color={color} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-sm font-semibold text-ink">{label}</Text>
          <Text className="text-xs text-faint" accessibilityLabel={formatDateTimeLong(entry.occurred_at, locale)}>
            {rel}
          </Text>
        </View>
        {meta ? <Text className="text-xs text-muted mt-0.5">{meta}</Text> : null}
        {entry.note ? <Text className="text-sm text-muted mt-0.5">{entry.note}</Text> : null}
      </View>
      {canWrite ? (
        <View className="flex-row gap-1">
          <Pressable onPress={onEdit} className="p-1.5 rounded-lg active:bg-border-soft" accessibilityLabel={t.form.edit}>
            <Pencil size={14} color={c.faint} />
          </Pressable>
          <Pressable onPress={onDelete} className="p-1.5 rounded-lg active:bg-red-500/10" accessibilityLabel={t.form.delete}>
            <Trash2 size={14} color={c.danger} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
