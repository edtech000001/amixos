import { useCallback, useEffect, useState } from 'react';
import { logImportRun } from '@amixos/shared/lib/importRunners';
import { View, Text, Pressable, Modal as RNModal, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
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

// Step 4 of the import hub: bulk photo upload (see the web
// ImportPhotosModal for the full design notes). Files are matched to jobs
// CLIENT-SIDE against jobs.import_photo_names; only matches are uploaded —
// unmatched photos never leave the device.

interface Props {
  open: boolean;
  businessId: string;
  onClose: () => void;
}

interface Picked {
  uri: string;
  name: string;
  match: PhotoMatch | null;
  status: 'pending' | 'uploaded' | 'failed' | 'limit' | 'skipped';
}

export function ImportPhotosModal({ open, businessId, onClose }: Props) {
  const supabase = createSupabaseClient();
  const { user } = useApp();
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.settings.importHub.photos;

  const [pendingJobs, setPendingJobs] = useState<PendingPhotoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [phase, setPhase] = useState<'pick' | 'review' | 'uploading' | 'done'>('pick');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [limitSkipped, setLimitSkipped] = useState(0);

  const loadPending = useCallback(async () => {
    setLoading(true);
    // Paginated — a big import can leave >1000 jobs with pending photos.
    const pageSize = 1000;
    const rows: { id: string; title: string; external_ref: string | null; import_photo_names: string[] | null }[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data } = await supabase
        .from('jobs')
        .select('id, title, external_ref, import_photo_names')
        .eq('business_id', businessId)
        .not('import_photo_names', 'is', null)
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
   *  the whole dump (or re-running after an interrupted upload) skips these. */
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
   *  an interrupted upload can't leave uploaded photos still marked pending. */
  const clearPendingName = async (jobId: string, name: string) => {
    if (!name) return;
    const job = pendingJobs.find(j => j.id === jobId);
    if (!job) return;
    const remaining = removePendingName(job.names, name);
    job.names = remaining ?? [];
    await supabase.from('jobs').update({ import_photo_names: remaining }).eq('id', jobId);
  };

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 0, // no cap — the whole dump at once
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.length) return;
    const matcher = buildPhotoMatcher(pendingJobs);
    const base: Picked[] = result.assets.map(a => {
      const name = a.fileName ?? '';
      return { uri: a.uri, name, match: name ? matcher.match(name) : null, status: 'pending' as const };
    });
    const jobIds = Array.from(new Set(base.filter(p => p.match).map(p => p.match!.jobId)));
    const existing = await fetchExistingNames(jobIds);
    for (const p of base) {
      if (!p.match) continue;
      const key = `${p.match.jobId}|${normSource(p.name)}`;
      if (existing.has(key)) {
        p.status = 'skipped';
        // If its pending name survived (interrupted upload), clear it now.
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
        // Picker already recompressed to quality 0.6 (same as the job photo
        // flow) — read the file and push it up.
        const res = await fetch(p.uri);
        const blob = await res.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();
        const path = jobPhotoPath(businessId, m.jobId, jobPhotoFilename('jpg'));
        const { error: upErr } = await supabase.storage
          .from(JOB_PHOTOS_BUCKET)
          .upload(path, arrayBuffer, { upsert: false, contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from('job_photos').insert({
          business_id: businessId,
          job_id: m.jobId,
          storage_path: path,
          sort_order: current,
          created_by: user?.id ?? null,
          source_name: p.name || null,
        });
        if (insErr) throw insErr;
        counts.set(m.jobId, current + 1);
        next[idx] = { ...p, status: 'uploaded' };
        // Per-file (not batched) so an interrupted upload leaves no name
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
    <RNModal visible={open} transparent animationType="fade" onRequestClose={phase === 'uploading' ? () => {} : onClose}>
      <Pressable onPress={phase === 'uploading' ? undefined : onClose} className="flex-1 bg-black/40 justify-end">
        <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[85%]" onPress={() => {}}>
          <Text className="text-lg font-bold text-ink mb-2">{t.title}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text className="text-xs text-muted mb-4 leading-5">{t.intro}</Text>

            {phase === 'pick' ? (
              loading ? (
                <Text className="text-sm text-faint py-6 text-center">…</Text>
              ) : pendingNameCount === 0 ? (
                <View className="bg-amber-500/10 border border-amber-100 rounded-xl px-4 py-3">
                  <Text className="text-sm text-amber-800">{t.noPending}</Text>
                </View>
              ) : (
                <>
                  <Text className="text-sm font-medium text-ink mb-3">
                    {t.pendingSummary
                      .replace('{{names}}', String(pendingNameCount))
                      .replace('{{jobs}}', String(pendingJobs.filter(j => j.names.length > 0).length))}
                  </Text>
                  <Pressable
                    onPress={pickPhotos}
                    className="items-center gap-2 py-10 rounded-2xl border-2 border-dashed border-border active:bg-surface"
                  >
                    <ImagePlus size={28} color={c.faint} />
                    <Text className="text-sm font-semibold text-primary">{t.chooseBtn}</Text>
                  </Pressable>
                </>
              )
            ) : null}

            {phase !== 'pick' ? (
              <View className="gap-4">
                <View className="flex-row items-center gap-2">
                  <CheckCircle2 size={16} color={c.success} />
                  <Text className="text-sm font-medium text-ink flex-1">
                    {t.matchedSummary
                      .replace('{{files}}', String(matched.length))
                      .replace('{{jobs}}', String(matchedJobIds.length))}
                  </Text>
                </View>

                {skipped.length > 0 ? (
                  <Text className="text-xs text-muted">{t.alreadyMsg.replace('{{count}}', String(skipped.length))}</Text>
                ) : null}

                {unmatched.length > 0 ? (
                  <View className="bg-amber-500/10 border border-amber-100 rounded-xl px-4 py-3">
                    <View className="flex-row items-center gap-1.5">
                      <AlertTriangle size={14} color={c.warning} />
                      <Text className="text-sm font-semibold text-amber-800">
                        {t.unmatchedTitle.replace('{{count}}', String(unmatched.length))}
                      </Text>
                    </View>
                    <Text className="text-xs text-amber-700 mt-1">{t.unmatchedHint}</Text>
                    <View className="mt-2" style={{ maxHeight: 120 }}>
                      {unmatched.slice(0, 12).map((p, i) => (
                        <Text key={i} className="text-xs font-mono text-amber-800" numberOfLines={1}>
                          {p.name || '(sin nombre)'}
                        </Text>
                      ))}
                      {unmatched.length > 12 ? (
                        <Text className="text-xs text-amber-700">+{unmatched.length - 12}</Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {phase === 'uploading' ? (
                  <View>
                    <Text className="text-sm text-muted mb-2">
                      {t.uploading.replace('{{done}}', String(progress.done)).replace('{{total}}', String(progress.total))}
                    </Text>
                    <View className="h-2 rounded-full bg-border-soft overflow-hidden">
                      <View
                        className="h-full bg-primary"
                        style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                      />
                    </View>
                  </View>
                ) : null}

                {phase === 'done' ? (
                  <View className="gap-1.5">
                    <Text className="text-sm font-semibold text-emerald-600">
                      {t.doneMsg.replace('{{count}}', String(uploadedCount))}
                    </Text>
                    {limitSkipped > 0 ? (
                      <Text className="text-xs text-amber-600">
                        {t.limitSkipped.replace('{{count}}', String(limitSkipped)).replace('{{max}}', String(MAX_PHOTOS_PER_JOB))}
                      </Text>
                    ) : null}
                    {failed.length > 0 ? (
                      <Text className="text-xs text-red-500">{t.failedMsg.replace('{{count}}', String(failed.length))}</Text>
                    ) : null}
                  </View>
                ) : null}

                {phase === 'review' ? (
                  <View className="gap-2.5">
                    <Pressable
                      onPress={() => void upload()}
                      disabled={uploadable.length === 0}
                      className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50"
                    >
                      <Text className="text-sm font-semibold text-white">
                        {t.uploadBtn.replace('{{count}}', String(uploadable.length))}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setPicked([]); setPhase('pick'); }}
                      className="py-3.5 rounded-2xl border border-border items-center active:bg-surface"
                    >
                      <Text className="text-sm font-semibold text-muted">{t.clearBtn}</Text>
                    </Pressable>
                  </View>
                ) : null}

                {phase === 'done' ? (
                  <View className="gap-2.5">
                    {failed.length > 0 ? (
                      <Pressable
                        onPress={() => void upload(true)}
                        className="py-3.5 rounded-2xl border border-border items-center active:bg-surface"
                      >
                        <Text className="text-sm font-semibold text-muted">{t.retryBtn}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={onClose} className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90">
                      <Text className="text-sm font-semibold text-white">{full.common.buttons.close}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
