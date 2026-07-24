'use client';

import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import type { JobUpdateDraft } from '@amixos/shared/assistant/types';
import { useLang } from '@/i18n/LangProvider';

interface Props {
  draft: JobUpdateDraft;
  active: boolean;
  createdJobId?: string;
  onConfirm: () => void;
  confirming: boolean;
}

// Preview of a reschedule/edit to an EXISTING job — shows old → new for each
// changed field. Confirming applies the change.
export function JobUpdateCard({ draft, active, createdJobId, onConfirm, confirming }: Props) {
  const { t: full } = useLang();
  const t = full.dashboard.assistant;
  const stale = !active && !createdJobId;

  const timeStr = (allDay?: boolean, s?: string | null, e?: string | null) =>
    allDay ? t.allDayLabel : [s, e].filter(Boolean).join(' – ') || '—';

  const rows: { label: string; from: string; to: string }[] = [];
  if (draft.scheduled_date !== undefined) {
    rows.push({ label: t.dateLabel, from: draft.before.scheduled_date || '—', to: draft.scheduled_date || '—' });
  }
  if (draft.all_day !== undefined || draft.time_start !== undefined || draft.time_end !== undefined) {
    const nextAllDay = draft.all_day !== undefined ? draft.all_day : false;
    rows.push({
      label: t.timeLabel,
      from: timeStr(draft.before.all_day, draft.before.time_start, draft.before.time_end),
      to: timeStr(nextAllDay, draft.time_start ?? draft.before.time_start, draft.time_end ?? draft.before.time_end),
    });
  }
  const crewChanged = draft.crew !== undefined;

  return (
    <div className={`mt-2 rounded-2xl border border-primary/20 bg-primary/5 p-4 ${stale ? 'opacity-60' : ''}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-primary">{t.updateTitle}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{draft.title}</p>

      <div className="mt-3 space-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center gap-2 text-sm">
            <span className="shrink-0 font-medium text-muted">{r.label}:</span>
            <span className="text-faint line-through">{r.from}</span>
            <ArrowRight size={13} className="shrink-0 text-muted" />
            <span className="font-medium text-ink">{r.to}</span>
          </div>
        ))}
        {crewChanged && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">{t.crewLabel}:</span>
            {draft.before.crew?.length ? (
              <span className="text-faint line-through">{draft.before.crew.join(', ')}</span>
            ) : null}
            <span className="flex flex-wrap gap-1">
              {(draft.crew ?? []).map((m, i) => (
                <span key={`${m.worker_name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border-soft bg-card px-2 py-0.5 text-xs font-medium text-ink">
                  {m.worker_name}
                  {m.is_lead && <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">{t.leadBadge}</span>}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      {draft.warnings.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {draft.warnings.map((w, i) => <p key={i} className="text-xs text-amber-700">{w}</p>)}
        </div>
      )}

      {createdJobId ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
          <span className="font-medium text-green-700">{t.updated}</span>
          <Link href={`/dashboard/trabajos/${createdJobId}`} className="ml-auto font-medium text-primary hover:underline">
            {t.viewJob}
          </Link>
        </div>
      ) : active ? (
        <button type="button" onClick={onConfirm} disabled={confirming}
          className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
          {confirming ? t.confirming : t.confirm}
        </button>
      ) : null}
    </div>
  );
}
