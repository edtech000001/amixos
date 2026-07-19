'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import type { JobDraft } from '@amixos/shared/assistant/types';
import { useLang } from '@/i18n/LangProvider';

interface JobDraftCardProps {
  draft: JobDraft;
  /** True when this draft is still the pending one (confirmable). */
  active: boolean;
  /** Set once this bubble's draft was confirmed into a job. */
  createdJobId?: string;
  onConfirm: () => void;
  confirming: boolean;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="shrink-0 font-medium text-muted">{label}:</span>
      <span className="min-w-0 text-ink">{children}</span>
    </div>
  );
}

/**
 * Presentational preview of a JobDraft attached to an assistant bubble.
 * Stale drafts (superseded by a newer pending draft) render dimmed with no
 * button; confirmed ones show the created state + link to the job.
 */
export function JobDraftCard({ draft, active, createdJobId, onConfirm, confirming }: JobDraftCardProps) {
  const { t: full } = useLang();
  const t = full.dashboard.assistant;
  const stale = !active && !createdJobId;

  const customEntries = Object.entries(draft.custom_fields ?? {}).filter(
    ([, v]) => v !== undefined && v !== null && `${v}`.trim() !== '',
  );
  const notes = [draft.worker_notes, draft.internal_notes].filter(
    (n): n is string => !!n && n.trim() !== '',
  );

  return (
    <div
      className={`mt-2 rounded-2xl border border-primary/20 bg-primary/5 p-4 ${stale ? 'opacity-60' : ''}`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-primary">{t.draftTitle}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{draft.title}</p>

      <div className="mt-3 space-y-1.5">
        {draft.client_name && (
          <Row label={t.clientLabel}>
            {draft.client_name}
            {!draft.client_resolved && (
              <span className="ml-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 align-middle">
                {t.unresolvedClient}
              </span>
            )}
          </Row>
        )}
        {draft.scheduled_date && <Row label={t.dateLabel}>{draft.scheduled_date}</Row>}
        {draft.total_hours != null && <Row label={t.hoursLabel}>{draft.total_hours}</Row>}
        {draft.crew.length > 0 && (
          <Row label={t.crewLabel}>
            <span className="flex flex-wrap gap-1">
              {draft.crew.map((m, i) => (
                <span
                  key={`${m.worker_name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-medium text-ink border border-border-soft"
                >
                  {m.worker_name}
                  {m.is_lead && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">
                      {t.leadBadge}
                    </span>
                  )}
                </span>
              ))}
            </span>
          </Row>
        )}
        {draft.driver_employee_ids.length > 0 && (
          <Row label={t.driverLabel}>
            {draft.driver_employee_ids.length}
            {draft.driver_hours != null ? ` · ${draft.driver_hours} hrs` : ''}
          </Row>
        )}
        {customEntries.map(([key, value]) => (
          <Row key={key} label={key}>
            {value}
          </Row>
        ))}
        {notes.map((n, i) => (
          <Row key={`note-${i}`} label={t.notesLabel}>
            {n}
          </Row>
        ))}
      </div>

      {draft.warnings.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {draft.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">
              {w}
            </p>
          ))}
        </div>
      )}

      {createdJobId ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
          <span className="font-medium text-green-700">{t.created}</span>
          <Link
            href={`/dashboard/trabajos/${createdJobId}`}
            className="ml-auto font-medium text-primary hover:underline"
          >
            {t.viewJob}
          </Link>
        </div>
      ) : active ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {confirming ? t.confirming : t.confirm}
        </button>
      ) : null}
    </div>
  );
}
