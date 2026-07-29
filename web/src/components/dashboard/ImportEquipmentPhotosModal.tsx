'use client';

// "Import equipment photos" — mirrors the job photos step but for equipment.
// The equipment CSV's "Photos (file names)" column left pending names on each
// row (equipment.import_photo_names); here the user drops their photo dump,
// files are matched CLIENT-SIDE by name (shared/lib/importPhotos), and only the
// matches upload to equipment_photos. Unmatched files never leave the browser.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { resizeImage } from '@/components/jobs/JobPhotosSection';
import { EQUIPMENT_BUCKET, MAX_PHOTOS_PER_EQUIPMENT, equipmentPhotoPath } from '@amixos/shared/lib/equipment';
import { logImportRun } from '@amixos/shared/lib/importRunners';
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

export function ImportEquipmentPhotosModal({ open, businessId, onClose }: Props) {
  const supabase = createSupabaseClient();
  const { user } = useApp();
  const { locale } = useLang();
  const es = locale === 'es';
  const tr = (esStr: string, enStr: string) => (es ? esStr : enStr);

  // Equipment fed into the shared matcher as "jobs" (title = equipment name,
  // no external ref — match by the Photos-column names only).
  const [pending, setPending] = useState<PendingPhotoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [phase, setPhase] = useState<'pick' | 'review' | 'uploading' | 'done'>('pick');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [limitSkipped, setLimitSkipped] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    const pageSize = 1000;
    const rows: { id: string; name: string; import_photo_names: string[] | null }[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data } = await supabase
        .from('equipment')
        .select('id, name, import_photo_names')
        .eq('business_id', businessId)
        .not('import_photo_names', 'is', null)
        .range(from, from + pageSize - 1);
      if (!data?.length) break;
      rows.push(...(data as typeof rows));
      if (data.length < pageSize) break;
    }
    setPending(rows.map(r => ({
      id: r.id,
      title: r.name,
      externalRef: null,
      names: Array.isArray(r.import_photo_names) ? r.import_photo_names : [],
    })));
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    if (open) { setPicked([]); setPhase('pick'); setLimitSkipped(0); void loadPending(); }
  }, [open, loadPending]);

  const normSource = (n: string) => (n.split(/[\\/]/).pop() ?? n).trim().toLowerCase();

  const fetchExistingNames = async (equipmentIds: string[]) => {
    const set = new Set<string>();
    for (let i = 0; i < equipmentIds.length; i += 100) {
      const { data } = await supabase
        .from('equipment_photos')
        .select('equipment_id, source_name')
        .in('equipment_id', equipmentIds.slice(i, i + 100))
        .not('source_name', 'is', null);
      (data as { equipment_id: string; source_name: string }[] | null)?.forEach(r =>
        set.add(`${r.equipment_id}|${normSource(r.source_name)}`));
    }
    return set;
  };

  const clearPendingName = async (equipmentId: string, name: string) => {
    if (!name) return;
    const eq = pending.find(j => j.id === equipmentId);
    if (!eq) return;
    const remaining = removePendingName(eq.names, name);
    eq.names = remaining ?? [];
    await supabase.from('equipment').update({ import_photo_names: remaining }).eq('id', equipmentId);
  };

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const matcher = buildPhotoMatcher(pending);
    const base: Picked[] = files.map(file => ({ file, match: matcher.match(file.name), status: 'pending' as const }));
    const ids = Array.from(new Set(base.filter(p => p.match).map(p => p.match!.jobId)));
    const existing = await fetchExistingNames(ids);
    for (const p of base) {
      if (!p.match) continue;
      const key = `${p.match.jobId}|${normSource(p.file.name)}`;
      if (existing.has(key)) { p.status = 'skipped'; await clearPendingName(p.match.jobId, p.match.pendingName); }
      else existing.add(key);
    }
    setPicked(base);
    setPhase('review');
  };

  const matched = picked.filter(p => p.match);
  const unmatched = picked.filter(p => !p.match);
  const matchedIds = Array.from(new Set(matched.map(p => p.match!.jobId)));
  const failed = picked.filter(p => p.status === 'failed');
  const skipped = picked.filter(p => p.status === 'skipped');
  const uploadable = matched.filter(p => p.status === 'pending');

  const upload = async (onlyFailed = false) => {
    const queue = (onlyFailed ? failed : uploadable).filter(p => p.match);
    if (queue.length === 0) return;
    setPhase('uploading');
    setProgress({ done: 0, total: queue.length });

    const ids = Array.from(new Set(queue.map(p => p.match!.jobId)));
    const counts = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 5) {
      await Promise.all(ids.slice(i, i + 5).map(async id => {
        const { count } = await supabase.from('equipment_photos').select('id', { head: true, count: 'exact' }).eq('equipment_id', id);
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
      if (current >= MAX_PHOTOS_PER_EQUIPMENT) { next[idx] = { ...p, status: 'limit' }; skippedByLimit++; setProgress({ done: ++done, total: queue.length }); continue; }
      try {
        const blob = await resizeImage(p.file);
        const ext = (p.file.name.split('.').pop() ?? 'jpg').toLowerCase();
        const path = equipmentPhotoPath(businessId, m.jobId, `${crypto.randomUUID()}.${ext}`);
        const { error: upErr } = await supabase.storage.from(EQUIPMENT_BUCKET).upload(path, blob, { upsert: false, contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from('equipment_photos').insert({
          business_id: businessId,
          equipment_id: m.jobId,
          storage_path: path,
          sort_order: current,
          created_by: user?.id ?? null,
          source_name: p.file.name,
        });
        if (insErr) throw insErr;
        counts.set(m.jobId, current + 1);
        next[idx] = { ...p, status: 'uploaded' };
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
    const up = next.filter(x => x.status === 'uploaded').length;
    void logImportRun(supabase, businessId, 'equipment', tr(`${next.length} fotos de equipo`, `${next.length} equipment photos`), { success: up, skipped: next.length - up, failedRows: next.filter(x => x.status === 'failed') });
  };

  const uploadedCount = picked.filter(p => p.status === 'uploaded').length;
  const pendingNameCount = pending.reduce((s, j) => s + j.names.length, 0);

  return (
    <Modal open={open} onClose={phase === 'uploading' ? () => {} : onClose} title={tr('Importar fotos de equipo', 'Import equipment photos')} size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">{tr('Sube todas tus fotos; se emparejan con el equipo por el nombre de archivo de la columna "Fotos" y solo las coincidencias se guardan.', 'Drop all your photos; they match to equipment by the file names in the "Photos" column, and only matches are stored.')}</p>

        {phase === 'pick' ? (
          loading ? (
            <p className="text-sm text-faint py-6 text-center">…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted bg-amber-500/10 border border-amber-100 rounded-xl px-4 py-3">{tr('Ningún equipo tiene fotos pendientes. Agrega nombres de archivo en la columna "Fotos" al importar equipo.', 'No equipment has pending photos. Add file names in the "Photos" column when importing equipment.')}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">
                {tr(`${pendingNameCount} foto(s) pendientes en ${pending.filter(j => j.names.length > 0).length} equipo(s).`, `${pendingNameCount} pending photo(s) across ${pending.filter(j => j.names.length > 0).length} equipment.`)}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); void onFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))); }}
                className="flex flex-col items-center gap-2 py-10 rounded-2xl border-2 border-dashed border-border text-faint hover:border-primary hover:text-primary transition-colors"
              >
                <ImagePlus size={28} />
                <span className="text-sm font-semibold">{tr('Elegir fotos', 'Choose photos')}</span>
                <span className="text-xs">{tr('o arrástralas aquí', 'or drag them here')}</span>
              </button>
            </>
          )
        ) : null}

        {phase === 'review' || phase === 'uploading' || phase === 'done' ? (
          <>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              <span className="font-medium text-ink">{tr(`${matched.length} archivo(s) emparejados con ${matchedIds.length} equipo(s)`, `${matched.length} file(s) matched to ${matchedIds.length} equipment`)}</span>
            </div>

            {skipped.length > 0 ? <p className="text-xs text-muted">{tr(`${skipped.length} ya estaban subidas.`, `${skipped.length} were already uploaded.`)}</p> : null}

            {unmatched.length > 0 ? (
              <div className="bg-amber-500/10 border border-amber-100 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5"><AlertTriangle size={14} /> {tr(`${unmatched.length} sin coincidencia (se ignoran)`, `${unmatched.length} unmatched (skipped)`)}</p>
                <p className="text-xs text-amber-700 mt-1">{tr('El nombre de archivo no coincide con ningún equipo.', "The file name doesn't match any equipment.")}</p>
                <div className="mt-2 max-h-32 overflow-y-auto">
                  {unmatched.map((p, i) => <p key={i} className="text-xs font-mono text-amber-800 truncate">{p.file.name}</p>)}
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
                <p className="text-sm text-muted mb-2">{tr(`Subiendo ${progress.done} / ${progress.total}`, `Uploading ${progress.done} / ${progress.total}`)}</p>
                <div className="h-2 rounded-full bg-border-soft overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
              </div>
            ) : null}

            {phase === 'done' ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-emerald-600">{tr(`Se subieron ${uploadedCount} foto(s).`, `Uploaded ${uploadedCount} photo(s).`)}</p>
                {limitSkipped > 0 ? <p className="text-xs text-amber-600">{tr(`${limitSkipped} omitidas (máx ${MAX_PHOTOS_PER_EQUIPMENT} por equipo).`, `${limitSkipped} skipped (max ${MAX_PHOTOS_PER_EQUIPMENT} per equipment).`)}</p> : null}
                {failed.length > 0 ? <p className="text-xs text-red-500">{tr(`${failed.length} fallaron.`, `${failed.length} failed.`)}</p> : null}
              </div>
            ) : null}

            <div className="flex gap-3">
              {phase === 'review' ? (
                <>
                  <Button variant="secondary" onClick={() => { setPicked([]); setPhase('pick'); }} fullWidth>{tr('Limpiar', 'Clear')}</Button>
                  <Button onClick={() => void upload()} disabled={uploadable.length === 0} fullWidth>{tr(`Subir ${uploadable.length}`, `Upload ${uploadable.length}`)}</Button>
                </>
              ) : null}
              {phase === 'done' ? (
                <>
                  {failed.length > 0 ? <Button variant="secondary" onClick={() => void upload(true)} fullWidth>{tr('Reintentar', 'Retry')}</Button> : null}
                  <Button onClick={onClose} fullWidth>{tr('Cerrar', 'Close')}</Button>
                </>
              ) : null}
            </div>
          </>
        ) : null}

        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { void onFiles(Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'))); e.target.value = ''; }} />
      </div>
    </Modal>
  );
}
