import { type ReactNode, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Clock, MapPin, Play, CheckCircle2, CalendarDays, Briefcase, Timer, type LucideIcon } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { formatHours, type FieldHomeJob, type FieldHomeStats, type OpenTimesheet } from '../../lib/fieldHome';

type HoursView = 'active' | 'week' | 'month';

// Purpose-built home for the "field" role (crew). Presentational — the mobile
// wrapper owns data + writes via the shared fieldHome module, mirroring how
// DashboardHomeScreen is driven. Parity with web/src/components/dashboard/
// FieldHome.tsx.

export interface FieldHomeScreenProps {
  loading: boolean;
  businessName: string;
  businessSlot?: ReactNode;
  jobs: FieldHomeJob[];
  /** Jobs completed in the last 7 days (most recent first). */
  recentCompleted?: FieldHomeJob[];
  openTimesheet: OpenTimesheet | null;
  stats: FieldHomeStats | null;
  clockBusy: boolean;
  error: boolean;
  /** Whether the clock in/out card shows (clockInOut capability, opt-in). */
  showClock?: boolean;
  // True while an admin is viewing this member via "Ver como" — write actions
  // (clock, status advance) are hidden/disabled. Writes are also blocked at the
  // transport layer; this is the matching UX.
  readOnly?: boolean;
  onToggleClock: () => void;
  onJobPress: (id: string) => void;
  onAdvanceStatus: (jobId: string, next: string) => void;
}

const JOB_STATUS_PILL_BG: Record<string, string> = {
  scheduled: 'bg-blue-100',
  in_progress: 'bg-orange-100',
  accepted: 'bg-violet-100',
  completed: 'bg-emerald-100',
};
const JOB_STATUS_PILL_TEXT: Record<string, string> = {
  scheduled: 'text-blue-600',
  in_progress: 'text-orange-600',
  accepted: 'text-violet-600',
  completed: 'text-emerald-600',
};

export function FieldHomeScreen({
  loading,
  businessName,
  businessSlot,
  jobs,
  recentCompleted = [],
  openTimesheet,
  stats,
  clockBusy,
  error,
  showClock = false,
  readOnly = false,
  onToggleClock,
  onJobPress,
  onAdvanceStatus,
}: FieldHomeScreenProps) {
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard;
  const f = t.fieldHome;
  const [hoursView, setHoursView] = useState<HoursView>('active');

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface py-20">
        <View className="flex-row gap-1">
          {[0, 1, 2].map(i => <View key={i} className="w-2 h-2 rounded-full bg-primary" />)}
        </View>
      </View>
    );
  }

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat(t.dateLocale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  const fmtDate = (dateStr: string | null) => {
    if (!dateStr) return f.noDate;
    const date = new Date(`${dateStr}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return t.home.upcomingJobs.today;
    if (diff === 1) return t.home.upcomingJobs.tomorrow;
    return new Intl.DateTimeFormat(t.dateLocale, { day: 'numeric', month: 'short' }).format(date);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const todayJobs = jobs.filter(j => j.scheduledDate === todayStr);
  const upcomingJobs = jobs.filter(j => !j.scheduledDate || j.scheduledDate > todayStr);

  const JobCard = ({ job }: { job: FieldHomeJob }) => {
    const jc = useThemeColors();
    const statusKey = job.status as keyof typeof t.jobs.statuses;
    const address = [job.jobAddress, job.jobCity, job.jobState].filter(Boolean).join(', ');
    return (
      <View className="bg-card rounded-2xl border border-border-soft p-4">
        <Pressable onPress={() => onJobPress(job.id)} className="active:opacity-70">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-semibold text-ink flex-shrink" numberOfLines={1}>{job.title}</Text>
                {job.isLead ? (
                  <View className="bg-primary/10 px-2 py-0.5 rounded-full">
                    <Text className="text-[10px] font-semibold text-primary">{f.lead}</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>{job.clientName ?? f.noClient}</Text>
              {address ? (
                <View className="flex-row items-center gap-1 mt-1">
                  <MapPin size={12} color={jc.faint} />
                  <Text className="text-xs text-faint flex-1" numberOfLines={1}>{address}</Text>
                </View>
              ) : null}
            </View>
            <View className="items-end gap-1.5">
              <View className="bg-primary/10 px-2 py-1 rounded-lg">
                <Text className="text-[11px] font-semibold text-primary">{fmtDate(job.status === 'completed' ? (job.completedDate ?? job.scheduledDate) : job.scheduledDate)}</Text>
              </View>
              <View className={`px-2 py-0.5 rounded-full ${JOB_STATUS_PILL_BG[job.status] ?? 'bg-border-soft'}`}>
                <Text className={`text-[10px] font-semibold ${JOB_STATUS_PILL_TEXT[job.status] ?? 'text-muted'}`}>
                  {t.jobs.statuses[statusKey] ?? job.status}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
        {!readOnly && (job.status === 'scheduled' || job.status === 'accepted') ? (
          <Pressable
            onPress={() => onAdvanceStatus(job.id, 'in_progress')}
            className="mt-3 flex-row items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500/10 active:opacity-80"
          >
            <Play size={15} color={jc.warning} />
            <Text className="text-sm font-semibold text-orange-600">{f.start}</Text>
          </Pressable>
        ) : null}
        {!readOnly && job.status === 'in_progress' ? (
          <Pressable
            onPress={() => onAdvanceStatus(job.id, 'completed')}
            className="mt-3 flex-row items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 active:opacity-80"
          >
            <CheckCircle2 size={15} color={jc.success} />
            <Text className="text-sm font-semibold text-emerald-600">{f.complete}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 144 }}>
      <View className="mb-6">
        <Text className="text-2xl font-bold text-ink">{f.greeting}{!businessSlot && businessName ? ',' : ''}</Text>
        {businessSlot ? (
          <View className="mt-2 self-start">{businessSlot}</View>
        ) : businessName ? (
          <Text className="text-lg font-semibold text-ink mt-1">{businessName}</Text>
        ) : null}
      </View>

      {error ? (
        <View className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-100">
          <Text className="text-sm text-red-600">{f.clockError}</Text>
        </View>
      ) : null}

      {/* Clock in/out — opt-in per role. */}
      {showClock ? (
      <View className={`rounded-2xl p-5 mb-6 ${openTimesheet ? 'bg-emerald-600' : 'bg-card border border-border-soft'}`}>
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-row items-center gap-3 flex-1 min-w-0">
            <View className={`w-11 h-11 rounded-xl items-center justify-center ${openTimesheet ? 'bg-white/15' : 'bg-primary/10'}`}>
              <Clock size={20} color={openTimesheet ? '#FFFFFF' : c.primary} />
            </View>
            <Text className={`text-sm font-medium flex-1 ${openTimesheet ? 'text-white' : 'text-ink'}`} numberOfLines={2}>
              {openTimesheet ? f.clockedInSince.replace('{{time}}', fmtTime(openTimesheet.clockIn)) : f.notClockedIn}
            </Text>
          </View>
          <Pressable
            onPress={onToggleClock}
            disabled={clockBusy || readOnly}
            className={`px-4 py-2.5 rounded-xl active:opacity-80 ${clockBusy || readOnly ? 'opacity-50' : ''} ${openTimesheet ? 'bg-card' : 'bg-primary'}`}
          >
            {clockBusy ? (
              <ActivityIndicator size="small" color={openTimesheet ? '#047857' : '#FFFFFF'} />
            ) : (
              <Text className={`text-sm font-semibold ${openTimesheet ? 'text-emerald-700' : 'text-white'}`}>
                {openTimesheet ? f.clockOut : f.clockIn}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
      ) : null}

      {/* Summary stats — assigned + completed tiles, then a single hours tile
          that toggles between active (unpaid) / week / month. */}
      <View className="flex-row justify-between mb-3">
        {([
          { label: f.statAssigned, value: String(stats?.assignedActive ?? 0), icon: Briefcase, color: c.success, bg: 'bg-emerald-500/10' },
          { label: f.statCompleted, value: String(stats?.completedMonth ?? 0), icon: CheckCircle2, color: c.primary, bg: 'bg-primary/10' },
        ] as { label: string; value: string; icon: LucideIcon; color: string; bg: string }[]).map(({ label, value, icon: Icon, color, bg }) => (
          <View key={label} className="w-[48%] bg-card rounded-2xl border border-border-soft p-4">
            <View className={`w-9 h-9 rounded-xl ${bg} items-center justify-center mb-3`}>
              <Icon size={18} color={color} />
            </View>
            <Text className="text-xl font-bold text-ink">{value}</Text>
            <Text className="text-xs text-muted mt-0.5">{label}</Text>
          </View>
        ))}
      </View>

      {/* Hours tile with Active / Week / Month toggle. */}
      <View className="bg-card rounded-2xl border border-border-soft p-4 mb-3">
        <View className="flex-row items-start justify-between mb-3">
          <View className="w-9 h-9 rounded-xl bg-orange-500/10 items-center justify-center">
            <Timer size={18} color={c.warning} />
          </View>
          <View className="flex-row rounded-lg bg-border-soft p-0.5">
            {([
              { key: 'active', label: f.hoursToggleActive },
              { key: 'week', label: f.hoursToggleWeek },
              { key: 'month', label: f.hoursToggleMonth },
            ] as { key: HoursView; label: string }[]).map(({ key, label }) => (
              <Pressable
                key={key}
                onPress={() => setHoursView(key)}
                className={`px-2.5 py-1 rounded-md ${hoursView === key ? 'bg-card' : ''}`}
              >
                <Text className={`text-xs font-semibold ${hoursView === key ? 'text-ink' : 'text-muted'}`}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text className="text-xl font-bold text-ink">
          {formatHours(hoursView === 'active' ? (stats?.hoursActive ?? 0) : hoursView === 'week' ? (stats?.hoursWeek ?? 0) : (stats?.hoursMonth ?? 0))}
        </Text>
        <Text className="text-xs text-muted mt-0.5">
          {hoursView === 'active' ? f.statActiveHours : hoursView === 'week' ? f.statHoursWeek : f.statHoursMonth}
        </Text>
      </View>

      {/* Today */}
      <View className="flex-row items-center gap-2 mb-3">
        <CalendarDays size={16} color={c.primary} />
        <Text className="text-sm font-semibold text-ink">{f.todayTitle}</Text>
      </View>
      {todayJobs.length === 0 ? (
        <View className="bg-card rounded-2xl border border-border-soft py-10 items-center mb-6">
          <Briefcase size={36} color={c.faint} />
          <Text className="text-faint text-sm mt-3">{f.empty}</Text>
        </View>
      ) : (
        <View className="gap-3 mb-6">
          {todayJobs.map(job => <JobCard key={job.id} job={job} />)}
        </View>
      )}

      {/* Upcoming */}
      {upcomingJobs.length > 0 ? (
        <>
          <Text className="text-sm font-semibold text-ink mb-3">{f.upcomingTitle}</Text>
          <View className="gap-3">
            {upcomingJobs.map(job => <JobCard key={job.id} job={job} />)}
          </View>
        </>
      ) : null}

      {/* Recent projects completed — the last 7 days. */}
      {recentCompleted.length > 0 ? (
        <>
          <View className="flex-row items-center gap-2 mb-3 mt-6">
            <CheckCircle2 size={16} color={c.success} />
            <Text className="text-sm font-semibold text-ink">{f.recentCompletedTitle}</Text>
          </View>
          <View className="gap-3">
            {recentCompleted.map(job => <JobCard key={job.id} job={job} />)}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
