import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import type { JobDraft } from '@amixos/shared/assistant/types';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';

interface Props {
  draft: JobDraft;
  /** True only for the draft the server still considers pending — shows the
   *  Confirmar button. Older drafts in the transcript render dimmed. */
  active: boolean;
  /** Set once this draft was confirmed — shows the created + view-job row. */
  createdJobId?: string;
  confirming: boolean;
  onConfirm: () => void;
  /** Close the sheet before navigating to the created job. */
  onNavigate: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center flex-wrap mt-2">
      <Text className="text-xs font-semibold text-muted w-16">{label}</Text>
      {children}
    </View>
  );
}

// Preview card for a job the assistant proposes. Nothing is created until
// the user presses Confirmar (JobDraft → POST /assistant/confirm).
export function JobDraftCard({ draft, active, createdJobId, confirming, onConfirm, onNavigate }: Props) {
  const { t: full } = useLang();
  const a = full.dashboard.assistant;
  const router = useRouter();
  const c = useThemeColors();
  const stale = !active && !createdJobId;
  const customEntries = Object.entries(draft.custom_fields ?? {}).filter(([, v]) => !!v);
  const notes = draft.worker_notes || draft.internal_notes;

  return (
    <View className={`rounded-2xl border border-primary/20 bg-primary/5 p-4 mt-2 ${stale ? 'opacity-60' : ''}`}>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-primary">{a.draftTitle}</Text>
      <Text className="text-base font-bold text-ink mt-0.5">{draft.title}</Text>

      {draft.client_name ? (
        <Row label={a.clientLabel}>
          <Text className="text-sm text-ink">{draft.client_name}</Text>
          {!draft.client_resolved && (
            <View className="ml-2 rounded-full bg-amber-100 px-2 py-0.5">
              <Text className="text-[11px] font-semibold text-amber-700">{a.unresolvedClient}</Text>
            </View>
          )}
        </Row>
      ) : null}

      {draft.scheduled_date ? (
        <Row label={a.dateLabel}>
          <Text className="text-sm text-ink">{draft.scheduled_date}</Text>
        </Row>
      ) : null}

      {draft.total_hours != null ? (
        <Row label={a.hoursLabel}>
          <Text className="text-sm text-ink">{draft.total_hours}</Text>
        </Row>
      ) : null}

      {draft.crew.length ? (
        <View className="mt-2">
          <Text className="text-xs font-semibold text-muted">{a.crewLabel}</Text>
          <View className="flex-row flex-wrap gap-1.5 mt-1">
            {draft.crew.map((m, i) => (
              <View key={`${m.worker_name}-${i}`} className="rounded-full bg-primary/10 px-2.5 py-1">
                <Text className="text-xs font-semibold text-primary">
                  {m.worker_name}
                  {m.is_lead ? ` · ${a.leadBadge}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {draft.driver_employee_ids.length ? (
        <Row label={a.driverLabel}>
          <Text className="text-sm text-ink">
            {`${draft.driver_employee_ids.length} · ${draft.driver_hours ?? 0} h`}
          </Text>
        </Row>
      ) : null}

      {customEntries.length ? (
        <View className="mt-2">
          {customEntries.map(([key, value]) => (
            <Text key={key} className="text-sm text-ink mt-0.5">
              {key}: {value}
            </Text>
          ))}
        </View>
      ) : null}

      {notes ? (
        <View className="mt-2">
          <Text className="text-xs font-semibold text-muted">{a.notesLabel}</Text>
          {draft.worker_notes ? <Text className="text-sm text-ink mt-0.5">{draft.worker_notes}</Text> : null}
          {draft.internal_notes ? <Text className="text-sm text-ink mt-0.5">{draft.internal_notes}</Text> : null}
        </View>
      ) : null}

      {draft.warnings.map((w, i) => (
        <Text key={i} className="text-xs text-amber-600 mt-2">
          {w}
        </Text>
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
            <Text className="text-sm font-semibold text-emerald-600 ml-1.5">{a.created}</Text>
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => {
              onNavigate();
              router.push(`/dashboard/trabajos/${createdJobId}`);
            }}
          >
            <Text className="text-sm font-semibold text-primary">{a.viewJob}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
