// Quick job preview shown when a job line is tapped on the invoice detail. Shows
// the same info as the job detail page (dates, hours, address, description,
// notes, custom fields, total) — read-only, no action buttons. "Go to job"
// opens the full editable page. Absolute backdrop BEHIND a plain-View card so
// the card scrolls (see CLAUDE.md).

import { useEffect, useState } from 'react';
import { SkeletonCard } from '../../ui/Skeleton';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal as RNModal } from 'react-native';
import { X, ArrowRight, Calendar, Clock } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { jobRefLabel } from '../../lib/jobRef';
import { formatDateLong, formatTime12h, formatNumberGrouped } from '../../lib/format';
import { localizeTemplates } from '../../lib/fieldTemplates';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

interface JobFieldTemplate { field_key: string; field_label: string; field_label_es?: string | null; field_label_en?: string | null; field_type: string }
interface JobPreview {
  id: string;
  business_id: string;
  title: string | null;
  external_ref: string | null;
  estimate_number: string | null;
  status: string;
  description: string | null;
  worker_notes: string | null;
  scheduled_date: string | null;
  end_date: string | null;
  time_start: string | null;
  time_end: string | null;
  total_hours: number | null;
  driver_hours: number | null;
  job_address: string | null;
  job_city: string | null;
  job_state: string | null;
  custom_fields: Record<string, string> | null;
  total_amount: number | null;
  clients: { first_name: string; last_name: string; company: string | null } | null;
}

export interface JobPreviewSheetProps {
  supabase: SupabaseLike;
  jobId: string | null;
  onClose: () => void;
  onOpenFull: (jobId: string) => void;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function JobPreviewSheet({ supabase, jobId, onClose, onOpenFull }: JobPreviewSheetProps) {
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.invoices.jobsSection;
  const tNew = full.dashboard.jobs.new;
  const tStatus = full.dashboard.jobs.statuses as Record<string, string>;
  const dateLoc = full.dashboard.dateLocale;
  const [job, setJob] = useState<JobPreview | null>(null);
  const [templates, setTemplates] = useState<JobFieldTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) { setJob(null); setTemplates([]); return; }
    setLoading(true);
    void (async () => {
      const { data: j } = await supabase.from('jobs')
        .select('*, clients(first_name, last_name, company)')
        .eq('id', jobId).single();
      setJob((j as JobPreview) ?? null);
      if (j?.business_id) {
        const { data: tpl } = await supabase.from('job_field_templates')
          .select('field_key, field_label, field_label_es, field_label_en, field_type')
          .eq('business_id', j.business_id).order('sort_order');
        setTemplates(localizeTemplates((tpl ?? []) as JobFieldTemplate[], locale));
      }
      setLoading(false);
    })();
  }, [jobId, supabase, locale]);

  const dates = job?.scheduled_date
    ? `${formatDateLong(job.scheduled_date, dateLoc)}${job.end_date && job.end_date !== job.scheduled_date ? ` — ${formatDateLong(job.end_date, dateLoc)}` : ''}`
    : null;
  const times = job && (job.time_start || job.time_end)
    ? `${formatTime12h(job.time_start)}${job.time_end ? ` — ${formatTime12h(job.time_end)}` : ''}`
    : null;
  const place = [job?.job_address, job?.job_city, job?.job_state].filter(Boolean).join(', ');
  const clientName = job?.clients ? `${job.clients.first_name} ${job.clients.last_name}`.trim() : null;

  const customValue = (tpl: JobFieldTemplate): string | null => {
    const raw = job?.custom_fields?.[tpl.field_key];
    if (raw === undefined || raw === null || raw === '') return null;
    return tpl.field_type === 'boolean' ? (raw === 'true' ? (dateLoc === 'es' ? 'Sí' : 'Yes') : 'No')
      : tpl.field_type === 'number' ? formatNumberGrouped(raw)
      : tpl.field_type === 'date' ? formatDateLong(raw, dateLoc)
      : raw;
  };

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View className="mb-3">
      <Text className="text-xs text-faint mb-0.5">{label}</Text>
      <Text className="text-sm text-ink">{value}</Text>
    </View>
  );

  return (
    <RNModal visible={!!jobId} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[88%]">
          <View className="flex-row items-start justify-between gap-3 mb-3">
            <View className="flex-1 min-w-0">
              {job ? <Text className="text-xs font-mono text-faint">{jobRefLabel({ estimateNumber: job.estimate_number, externalRef: job.external_ref, id: job.id })}</Text> : null}
              <Text className="text-lg font-bold text-ink">{job?.title ?? '—'}</Text>
              {clientName ? <Text className="text-sm font-semibold text-primary">{clientName}{job?.clients?.company ? ` · ${job.clients.company}` : ''}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} className="p-1 rounded-lg active:bg-border-soft"><X size={20} color={c.faint} /></Pressable>
          </View>

          {loading ? (
            <SkeletonCard lines={5} />
          ) : job ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <View className="flex-row items-center gap-2 flex-wrap mb-3">
                <View className="px-2 py-0.5 rounded-full bg-border-soft"><Text className="text-[11px] font-semibold text-muted">{tStatus[job.status] ?? job.status}</Text></View>
                {dates ? <View className="flex-row items-center gap-1"><Calendar size={12} color={c.faint} /><Text className="text-xs text-muted">{dates}</Text></View> : null}
                {times ? <View className="flex-row items-center gap-1"><Clock size={12} color={c.faint} /><Text className="text-xs text-muted">{times}</Text></View> : null}
              </View>

              {(job.total_hours ?? 0) > 0 ? <Row label={tNew.totalHoursLabel} value={`${formatNumberGrouped(job.total_hours)} h`} /> : null}
              {(job.driver_hours ?? 0) > 0 ? <Row label={tNew.driverHoursLabel} value={`${formatNumberGrouped(job.driver_hours)} h`} /> : null}
              {place ? <Row label={tNew.addressLabel} value={place} /> : null}

              <Text className="text-xs text-faint mb-0.5">{tNew.descriptionLabel}</Text>
              <Text className={`text-sm mb-3 ${job.description?.trim() ? 'text-ink' : 'text-faint'}`}>{job.description?.trim() || t.previewNoDescription}</Text>

              {job.worker_notes?.trim() ? <Row label={t.previewNotes} value={job.worker_notes} /> : null}

              {templates.map(tpl => {
                const v = customValue(tpl);
                return v === null ? null : <Row key={tpl.field_key} label={tpl.field_label} value={v} />;
              })}

              {(job.total_amount ?? 0) > 0 ? (
                <View className="flex-row justify-between pt-2 border-t border-border-soft mb-1">
                  <Text className="text-sm font-semibold text-muted">Total</Text>
                  <Text className="text-sm font-bold text-ink">{fmtMoney(job.total_amount ?? 0)}</Text>
                </View>
              ) : null}

              <Pressable onPress={() => onOpenFull(job.id)} className="mt-1 flex-row items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-primary active:opacity-90">
                <Text className="text-sm font-semibold text-white">{t.viewProject}</Text>
                <ArrowRight size={16} color="#fff" />
              </Pressable>
            </ScrollView>
          ) : (
            <Text className="text-sm text-faint py-8 text-center">{full.dashboard.jobs.notFound}</Text>
          )}
        </View>
      </View>
    </RNModal>
  );
}
