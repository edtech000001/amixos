'use client';

// Step 4 of the import hub: bulk photo upload. The jobs CSV's "Fotos
import { logImportRun } from '@amixos/shared/lib/importRunners';
import { useElapsedTimer } from '@amixos/shared/lib/useElapsedTimer';
// (nombres de archivo)" column left pending file names on each imported job
// (jobs.import_photo_names); here the user drops their whole photo dump,
// files are matched to jobs CLIENT-SIDE (shared/lib/importPhotos), and only
// the matches are resized + uploaded through the normal job_photos flow.
// Unmatched files never leave the browser — zero storage wasted.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { RecentImports } from './RecentImports';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { resizeImage } from '@/components/jobs/JobPhotosSection';
import {
  JOB_PHOTOS_BUCKET,
  MAX_PHOTOS_PER_JOB,
  jobPhotoPath,
  jobPhotoFilename,
} from '@amixos/shared/lib/jobPhotos';
import {
  buildPhotoMatcher,
  removePendingName,
  type PendingPhotoJob,
  type PhotoMatch,
} from '@amixos/shared/lib/importPhotos';

interface Props {
  open: boolean;
  businessId: string;
  onClose: () => void;
}

interface Picked {
  file: File;
  match: PhotoMatch | null;
  status: 'pending' | 'uploaded' | 'failed' | 'limit' | 'skipped';
}

export function ImportPhotosModal({ open, businessId, onClose }: Props) {
  const supabase = createSupabaseClient();
  const { user } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.importHub.photos;

  const [pendingJobs, setPendingJobs] = useState<PendingPhotoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [phase, setPhase] = useState<'pick' | 'review' | 'uploading' | 'done'>('pick');
  const { label: elapsedLabel } = useElapsedTimer(phase === 'uploading');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [limitSkipped, setLimitSkipped] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    // Load jobs that can receive photos: those with pending CSV names, PLUS
    // any job carrying a Project ID (external_ref) so filenames like
    // "Proyecto-0a4f0ca7.Foto 1.jpg" still match by ref on a RE-upload (once
    // the pending names were cleared by the first upload) or when the jobs CSV
    // had no photos column at all. Paginated — a business can have >1000 jobs.
    const pageSize = 1000;
    const rows: { id: string; title: string; external_ref: string | null; import_photo_names: string[] | null }[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data } = await supabase
        .from('jobs')
        .select('id, title, external_ref, import_photo_names')
        .eq('business_id', businessId)
        .or('import_photo_names.not.is.null,external_ref.not.is.null')
        .range(from, from + pageSize - 1);
      if (!data?.length) break;
      rows.push(...(data as typeof rows));
      if (data.length < pageSize) break;
    }
    setPendingJobs(rows.map(r => ({
      id: r.id,
      title: r.title,
      externalRef: r.external_ref,
      names: Array.isArray(r.import_photo_names) ? r.import_photo_names : [],
    })));
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    if (open) {
      setPicked([]);
      setPhase('pick');
      setLimitSkipped(0);
      void loadPending();
    }
  }, [open, loadPending]);

  // Compare source names the same way the matcher does: bare name, lowercase.
  const normSource = (n: string) => (n.split(/[\\/]/).pop() ?? n).trim().toLowerCase();

  /** jobId|name pairs already uploaded by a previous import run — re-selecting
   *  the whole dump (or re-running after a mid-upload refresh) skips these. */
  const fetchExistingNames = async (jobIds: string[]) => {
    const set = new Set<string>();
    for (let i = 0; i < jobIds.length; i += 100) {
      const { data } = await supabase
        .from('job_photos')
        .select('job_id, source_name')
        .in('job_id', jobIds.slice(i, i + 100))
        .not('source_name', 'is', null);
      (data as { job_id: string; source_name: string }[] | null)?.forEach(r =>
        set.add(`${r.job_id}|${normSource(r.source_name)}`));
    }
    return set;
  };

  /** Clear one matched pending name off its job IMMEDIATELY (not batched), so
   *  a refresh mid-upload can't leave uploaded photos still marked pending. */
  const clearPendingName = async (jobId: string, name: string) => {
    if (!name) return;
    const job = pendingJobs.find(j => j.id === jobId);
    if (!job) return;
    const remaining = removePendingName(job.names, name);
    job.names = remaining ?? [];
    await supabase.from('jobs').update({ import_photo_names: remaining }).eq('id', jobId);
  };

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const matcher = buildPhotoMatcher(pendingJobs);
    const base: Picked[] = files.map(file => ({ file, match: matcher.match(file.name), status: 'pending' as const }));
    const jobIds = Array.from(new Set(base.filter(p => p.match).map(p => p.match!.jobId)));
    const existing = await fetchExistingNames(jobIds);
    for (const p of base) {
      if (!p.match) continue;
      const key = `${p.match.jobId}|${normSource(p.file.name)}`;
      if (existing.has(key)) {
        p.status = 'skipped';
        // If its pending name survived (refresh mid-upload), clear it now.
        await clearPendingName(p.match.jobId, p.match.pendingName);
      } else {
        existing.add(key); // same file twice in one selection → second skips
      }
    }
    setPicked(base);
    setPhase('review');
  };

  const matched = picked.filter(p => p.match);
  const unmatched = picked.filter(p => !p.match);
  const matchedJobIds = Array.from(new Set(matched.map(p => p.match!.jobId)));
  const failed = picked.filter(p => p.status === 'failed');
  const skipped = picked.filter(p => p.status === 'skipped');
  const uploadable = matched.filter(p => p.status === 'pending');

  const upload = async (onlyFailed = false) => {
    const queue = (onlyFailed ? failed : uploadable).filter(p => p.match);
    if (queue.length === 0) return;
    setPhase('uploading');
    setProgress({ done: 0, total: queue.length });

    // Existing photo counts per affected job → sort_order base + 50-photo cap.
    const jobIds = Array.from(new Set(queue.map(p => p.match!.jobId)));
    const counts = new Map<string, number>();
    for (let i = 0; i < jobIds.length; i += 5) {
      await Promise.all(jobIds.slice(i, i + 5).map(async id => {
        const { count } = await supabase
          .from('job_photos')
          .select('id', { head: true, count: 'exact' })
          .eq('job_id', id);
        counts.set(id, count ?? 0);
      }));
    }

    let skippedByLimit = 0;
    const next = [...picked];
    let done = 0;
    for (const p of queue) {
      const m = p.match!;
      const idx = next.indexOf(p);
      const current = counts.get(m.jobId) ?? 0;
      if (current >= MAX_PHOTOS_PER_JOB) {
        next[idx] = { ...p, status: 'limit' };
        skippedByLimit++;
        setProgress({ done: ++done, total: queue.length });
        continue;
      }
      try {
        const blob = await resizeImage(p.file);
        const path = jobPhotoPath(businessId, m.jobId, jobPhotoFilename('jpg'));
        const { error: upErr } = await supabase.storage
          .from(JOB_PHOTOS_BUCKET)
          .upload(path, blob, { upsert: false, contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from('job_photos').insert({
          business_id: businessId,
          job_id: m.jobId,
          storage_path: path,
          sort_order: current,
          created_by: user?.id ?? null,
          source_name: p.file.name,
        });
        if (insErr) throw insErr;
        counts.set(m.jobId, current + 1);
        next[idx] = { ...p, status: 'uploaded' };
        // Per-file (not batched) so a refresh mid-upload leaves no name
        // pending for a photo that already landed.
        await clearPendingName(m.jobId, m.pendingName);
      } catch {
        next[idx] = { ...p, status: 'failed' };
      }
      setPicked([...next]);
      setProgress({ done: ++done, total: queue.length });
    }

    setLimitSkipped(prev => prev + skippedByLimit);
    setPicked([...next]);
    setPhase('done');
    // Audit trail (migration 137): success = uploaded, skipped = the rest.
    // Read from `next` — the state var would be a stale closure here.
    {
      const up = next.filter(x => x.status === 'uploaded').length;
      void logImportRun(supabase, businessId, 'photos', `${next.length} fotos`, { success: up, skipped: next.length - up, failedRows: next.filter(x => x.status === 'failed') });
    }
  };

  const uploadedCount = picked.filter(p => p.status === 'uploaded').length;
  const pendingNameCount = pendingJobs.reduce((s, j) => s + j.names.length, 0);

  return (
    <Modal open={open} onClose={phase === 'uploading' ? () => {} : onClose} title={t.title} size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">{t.intro}</p>

        {phase === 'pick' ? (
          loading ? (
            <p className="text-sm text-faint py-6 text-center">…</p>
          ) : pendingJobs.length === 0 ? (
            <p className="text-sm text-muted bg-amber-500/10 border border-amber-100 rounded-xl px-4 py-3">{t.noPending}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">
                {pendingNameCount > 0
                  ? t.pendingSummary
                      .replace('{{names}}', String(pendingNameCount))
                      .replace('{{jobs}}', String(pendingJobs.filter(j => j.names.length > 0).length))
                  : t.pendingByRef.replace('{{jobs}}', String(pendingJobs.length))}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  onFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
                }}
                className="flex flex-col items-center gap-2 py-10 rounded-2xl border-2 border-dashed border-border text-faint hover:border-primary hover:text-primary transition-colors"
              >
                <ImagePlus size={28} />
                <span className="text-sm font-semibold">{t.chooseBtn}</span>
                <span className="text-xs">{t.dropHint}</span>
              </button>
              <RecentImports businessId={businessId} locale={locale} />
            </>
          )
        ) : null}

        {phase === 'review' || phase === 'uploading' || phase === 'done' ? (
          <>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              <span className="font-medium text-ink">
                {t.matchedSummary
                  .replace('{{files}}', String(matched.length))
                  .replace('{{jobs}}', String(matchedJobIds.length))}
              </span>
            </div>

            {skipped.length > 0 ? (
              <p className="text-xs text-muted">{t.alreadyMsg.replace('{{count}}', String(skipped.length))}</p>
            ) : null}

            {unmatched.length > 0 ? (
              <div className="bg-amber-500/10 border border-amber-100 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle size={14} /> {t.unmatchedTitle.replace('{{count}}', String(unmatched.length))}
                </p>
                <p className="text-xs text-amber-700 mt-1">{t.unmatchedHint}</p>
                <div className="mt-2 max-h-32 overflow-y-auto">
                  {unmatched.map((p, i) => (
                    <p key={i} className="text-xs font-mono text-amber-800 truncate">{p.file.name}</p>
                  ))}
                </div>
              </div>
            ) : null}

            {phase === 'review' ? (
              <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                {matched.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-mono text-muted truncate">{p.file.name}</span>
                    <span className="text-faint truncate shrink-0 max-w-[45%]">→ {p.match!.jobTitle}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {phase === 'uploading' ? (
              <div>
                <p className="text-sm text-muted mb-2">
                  {t.uploading.replace('{{done}}', String(progress.done)).replace('{{total}}', String(progress.total))} · {elapsedLabel}
                </p>
                <div className="h-2 rounded-full bg-border-soft overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ) : null}

            {phase === 'done' ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-emerald-600">
                  {t.doneMsg.replace('{{count}}', String(uploadedCount))}
                </p>
                {limitSkipped > 0 ? (
                  <p className="text-xs text-amber-600">
                    {t.limitSkipped.replace('{{count}}', String(limitSkipped)).replace('{{max}}', String(MAX_PHOTOS_PER_JOB))}
                  </p>
                ) : null}
                {failed.length > 0 ? (
                  <p className="text-xs text-red-500">{t.failedMsg.replace('{{count}}', String(failed.length))}</p>
                ) : null}
              </div>
            ) : null}

            <div className="flex gap-3">
              {phase === 'review' ? (
                <>
                  <Button variant="secondary" onClick={() => { setPicked([]); setPhase('pick'); }} fullWidth>
                    {t.clearBtn}
                  </Button>
                  <Button onClick={() => void upload()} disabled={uploadable.length === 0} fullWidth>
                    {t.uploadBtn.replace('{{count}}', String(uploadable.length))}
                  </Button>
                </>
              ) : null}
              {phase === 'done' ? (
                <>
                  {failed.length > 0 ? (
                    <Button variant="secondary" onClick={() => void upload(true)} fullWidth>
                      {t.retryBtn}
                    </Button>
                  ) : null}
                  <Button onClick={onClose} fullWidth>{full.common.buttons.close}</Button>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </Modal>
  );
}
