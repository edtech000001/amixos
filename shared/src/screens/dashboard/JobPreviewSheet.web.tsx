'use client';

// Quick job preview shown when a job line is tapped on the invoice detail. Shows
// the same info as the job detail page (dates, hours, address, description,
// notes, custom fields, total) — read-only, no action buttons — so it can be
// scanned fast. "Go to job" opens the full editable page.

import { useEffect, useState } from 'react';
import { X, ArrowRight, Calendar, Clock } from 'lucide-react';
import { useLang } from '../../i18n';
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

  if (!jobId) return null;

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
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{value}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {job ? <p className="text-xs font-mono text-gray-400">{jobRefLabel({ estimateNumber: job.estimate_number, externalRef: job.external_ref, id: job.id })}</p> : null}
            <p className="text-lg font-bold text-gray-900">{job?.title ?? '—'}</p>
            {clientName ? <p className="text-sm font-semibold text-primary">{clientName}{job?.clients?.company ? ` · ${job.clients.company}` : ''}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0"><X size={18} className="text-gray-400" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div></div>
        ) : job ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">{tStatus[job.status] ?? job.status}</span>
              {dates ? <span className="flex items-center gap-1 text-xs text-gray-500"><Calendar size={12} /> {dates}</span> : null}
              {times ? <span className="flex items-center gap-1 text-xs text-gray-500"><Clock size={12} /> {times}</span> : null}
            </div>

            {(job.total_hours ?? 0) > 0 ? <Row label={tNew.totalHoursLabel} value={`${formatNumberGrouped(job.total_hours)} h`} /> : null}
            {(job.driver_hours ?? 0) > 0 ? <Row label={tNew.driverHoursLabel} value={`${formatNumberGrouped(job.driver_hours)} h`} /> : null}
            {place ? <Row label={tNew.addressLabel} value={place} /> : null}

            <div>
              <p className="text-xs text-gray-400 mb-0.5">{tNew.descriptionLabel}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.description?.trim() || <span className="text-gray-400">{t.previewNoDescription}</span>}</p>
            </div>

            {job.worker_notes?.trim() ? <Row label={t.previewNotes} value={job.worker_notes} /> : null}

            {templates.map(tpl => {
              const v = customValue(tpl);
              return v === null ? null : <Row key={tpl.field_key} label={tpl.field_label} value={v} />;
            })}

            {(job.total_amount ?? 0) > 0 ? (
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span className="text-sm font-semibold text-gray-500">Total</span>
                <span className="text-sm font-bold text-gray-900">{fmtMoney(job.total_amount ?? 0)}</span>
              </div>
            ) : null}

            <button type="button" onClick={() => onOpenFull(job.id)}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-primary text-white font-semibold hover:opacity-90">
              {t.viewProject} <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-8 text-center">{full.dashboard.jobs.notFound}</p>
        )}
      </div>
    </div>
  );
}
