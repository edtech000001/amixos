import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ArrowRight } from 'lucide-react-native';
import type { JobUpdateDraft } from '@amixos/shared/assistant/types';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';

interface Props {
  draft: JobUpdateDraft;
  active: boolean;
  createdJobId?: string;
  confirming: boolean;
  onConfirm: () => void;
  onNavigate: () => void;
}

// Preview of a reschedule/edit to an EXISTING job — old → new per changed
// field. Nothing changes until Confirmar (POST /assistant/confirm).
export function JobUpdateCard({ draft, active, createdJobId, confirming, onConfirm, onNavigate }: Props) {
  const { t: full } = useLang();
  const a = full.dashboard.assistant;
  const router = useRouter();
  const c = useThemeColors();
  const stale = !active && !createdJobId;

  const timeStr = (allDay?: boolean, s?: string | null, e?: string | null) =>
    allDay ? a.allDayLabel : [s, e].filter(Boolean).join(' – ') || '—';

  const rows: { label: string; from: string; to: string }[] = [];
  if (draft.scheduled_date !== undefined) {
    rows.push({ label: a.dateLabel, from: draft.before.scheduled_date || '—', to: draft.scheduled_date || '—' });
  }
  if (draft.all_day !== undefined || draft.time_start !== undefined || draft.time_end !== undefined) {
    const nextAllDay = draft.all_day !== undefined ? draft.all_day : false;
    rows.push({
      label: a.timeLabel,
      from: timeStr(draft.before.all_day, draft.before.time_start, draft.before.time_end),
      to: timeStr(nextAllDay, draft.time_start ?? draft.before.time_start, draft.time_end ?? draft.before.time_end),
    });
  }
  const crewChanged = draft.crew !== undefined;

  return (
    <View className={`rounded-2xl border border-primary/20 bg-primary/5 p-4 mt-2 ${stale ? 'opacity-60' : ''}`}>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-primary">{a.updateTitle}</Text>
      <Text className="text-base font-bold text-ink mt-0.5">{draft.title}</Text>

      <View className="mt-2 gap-1.5">
        {rows.map(r => (
          <View key={r.label} className="flex-row items-center flex-wrap">
            <Text className="text-xs font-semibold text-muted w-16">{r.label}</Text>
            <Text className="text-sm text-faint line-through">{r.from}</Text>
            <ArrowRight size={13} color={c.muted} style={{ marginHorizontal: 6 }} />
            <Text className="text-sm font-semibold text-ink">{r.to}</Text>
          </View>
        ))}
        {crewChanged ? (
          <View className="mt-1">
            <Text className="text-xs font-semibold text-muted">{a.crewLabel}</Text>
            {draft.before.crew?.length ? (
              <Text className="text-sm text-faint line-through mt-0.5">{draft.before.crew.join(', ')}</Text>
            ) : null}
            <View className="flex-row flex-wrap gap-1.5 mt-1">
              {(draft.crew ?? []).map((m, i) => (
                <View key={`${m.worker_name}-${i}`} className="rounded-full bg-primary/10 px-2.5 py-1">
                  <Text className="text-xs font-semibold text-primary">
                    {m.worker_name}{m.is_lead ? ` · ${a.leadBadge}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {draft.warnings.map((w, i) => (
        <Text key={i} className="text-xs text-amber-600 mt-2">{w}</Text>
      ))}

      {active ? (
        <Pressable
          onPress={onConfirm}
          disabled={confirming}
          className={`mt-3 py-3 rounded-2xl bg-primary items-center ${confirming ? 'opacity-60' : 'active:opacity-90'}`}
        >
          <Text className="text-sm font-bold text-white">{confirming ? a.confirming : a.confirm}</Text>
        </Pressable>
      ) : null}

      {createdJobId ? (
        <View className="mt-3 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Check size={16} color={c.success} />
            <Text className="text-sm font-semibold text-emerald-600 ml-1.5">{a.updated}</Text>
          </View>
          <Pressable hitSlop={8} onPress={() => { onNavigate(); router.push(`/dashboard/trabajos/${createdJobId}`); }}>
            <Text className="text-sm font-semibold text-primary">{a.viewJob}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
