import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal as RNModal, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useElapsedTimer } from '@amixos/shared/lib/useElapsedTimer';
import { logImportRun } from '@amixos/shared/lib/importRunners';
import { EQUIPMENT_BUCKET, MAX_PHOTOS_PER_EQUIPMENT, equipmentPhotoPath } from '@amixos/shared/lib/equipment';
import {
  buildPhotoMatcher,
  removePendingName,
  type PendingPhotoJob,
  type PhotoMatch,
} from '@amixos/shared/lib/importPhotos';

// "Import equipment photos" — the mobile mirror of ImportEquipmentPhotosModal
// (web). Equipment CSV's "Photos (file names)" column left pending names on
// equipment.import_photo_names; here files are matched by name (reusing the
// job-photo matcher) and only matches upload to equipment_photos.

interface Props { open: boolean; businessId: string; onClose: () => void }
interface Picked { uri: string; name: string; match: PhotoMatch | null; status: 'pending' | 'uploaded' | 'failed' | 'limit' | 'skipped' }

export function ImportEquipmentPhotosModal({ open, businessId, onClose }: Props) {
  const supabase = createSupabaseClient();
  const { user } = useApp();
  const { locale } = useLang();
  const c = useThemeColors();
  const es = locale === 'es';
  const tr = (esStr: string, enStr: string) => (es ? esStr : enStr);

  const [pending, setPending] = useState<PendingPhotoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [phase, setPhase] = useState<'pick' | 'review' | 'uploading' | 'done'>('pick');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const { label: elapsedLabel } = useElapsedTimer(phase === 'uploading');
  const [limitSkipped, setLimitSkipped] = useState(0);

  const loadPending = useCallback(async () => {
    setLoading(true);
    const pageSize = 1000;
    const rows: { id: string; name: string; import_photo_names: string[] | null }[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data } = await supabase
        .from('equipment').select('id, name, import_photo_names')
        .eq('business_id', businessId).not('import_photo_names', 'is', null)
        .range(from, from + pageSize - 1);
      if (!data?.length) break;
      rows.push(...(data as typeof rows));
      if (data.length < pageSize) break;
    }
    setPending(rows.map(r => ({ id: r.id, title: r.name, externalRef: null, names: Array.isArray(r.import_photo_names) ? r.import_photo_names : [] })));
    setLoading(false);
  }, [businessId]);

  useEffect(() => { if (open) { setPicked([]); setPhase('pick'); setLimitSkipped(0); void loadPending(); } }, [open, loadPending]);

  const normSource = (n: string) => (n.split(/[\\/]/).pop() ?? n).trim().toLowerCase();

  const fetchExistingNames = async (ids: string[]) => {
    const set = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from('equipment_photos').select('equipment_id, source_name').in('equipment_id', ids.slice(i, i + 100)).not('source_name', 'is', null);
      (data as { equipment_id: string; source_name: string }[] | null)?.forEach(r => set.add(`${r.equipment_id}|${normSource(r.source_name)}`));
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

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, selectionLimit: 0, quality: 0.6 });
    if (result.canceled || !result.assets?.length) return;
    const matcher = buildPhotoMatcher(pending);
    const base: Picked[] = result.assets.map(a => { const name = a.fileName ?? ''; return { uri: a.uri, name, match: name ? matcher.match(name) : null, status: 'pending' as const }; });
    const ids = Array.from(new Set(base.filter(p => p.match).map(p => p.match!.jobId)));
    const existing = await fetchExistingNames(ids);
    for (const p of base) {
      if (!p.match) continue;
      const key = `${p.match.jobId}|${normSource(p.name)}`;
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
        const resp = await fetch(p.uri);
        const blob = await resp.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();
        const ext = (p.name.split('.').pop() || 'jpg').toLowerCase();
        // RN-safe uid (crypto.randomUUID isn't guaranteed on device).
        const uid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        const path = equipmentPhotoPath(businessId, m.jobId, `${uid}.${ext}`);
        const { error: upErr } = await supabase.storage.from(EQUIPMENT_BUCKET).upload(path, arrayBuffer, { upsert: false, contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from('equipment_photos').insert({ business_id: businessId, equipment_id: m.jobId, storage_path: path, sort_order: current, created_by: user?.id ?? null, source_name: p.name || null });
        if (insErr) throw insErr;
        counts.set(m.jobId, current + 1);
        next[idx] = { ...p, status: 'uploaded' };
        await clearPendingName(m.jobId, m.pendingName);
      } catch { next[idx] = { ...p, status: 'failed' }; }
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
    <RNModal visible={open} transparent animationType="fade" onRequestClose={phase === 'uploading' ? () => {} : onClose}>
      <Pressable onPress={phase === 'uploading' ? undefined : onClose} className="flex-1 bg-black/40 justify-end">
        <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[85%]" onPress={() => {}}>
          <Text className="text-lg font-bold text-ink mb-2">{tr('Importar fotos de equipo', 'Import equipment photos')}</Text>
          {phase === 'uploading' ? (
            <View className="flex-row items-center gap-3 mb-3">
              <View className="flex-1 h-2 rounded-full bg-border-soft overflow-hidden">
                <View className="h-full bg-primary" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </View>
              <Text className="text-xs font-semibold text-muted">{progress.done} / {progress.total} · {elapsedLabel}</Text>
            </View>
          ) : null}
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text className="text-xs text-muted mb-4 leading-5">{tr('Elige tus fotos; se emparejan con el equipo por el nombre de archivo de la columna "Fotos" y solo las coincidencias se guardan.', 'Pick your photos; they match to equipment by the file names in the "Photos" column, and only matches are stored.')}</Text>

            {phase === 'pick' ? (
              loading ? (
                <Text className="text-sm text-faint py-6 text-center">…</Text>
              ) : pendingNameCount === 0 ? (
                <View className="bg-amber-500/10 border border-amber-100 rounded-xl px-4 py-3">
                  <Text className="text-sm text-amber-800">{tr('Ningún equipo tiene fotos pendientes. Agrega nombres de archivo en la columna "Fotos" al importar equipo.', 'No equipment has pending photos. Add file names in the "Photos" column when importing equipment.')}</Text>
                </View>
              ) : (
                <>
                  <Text className="text-sm font-medium text-ink mb-3">{tr(`${pendingNameCount} foto(s) pendientes en ${pending.filter(j => j.names.length > 0).length} equipo(s).`, `${pendingNameCount} pending photo(s) across ${pending.filter(j => j.names.length > 0).length} equipment.`)}</Text>
                  <Pressable onPress={pickPhotos} className="items-center gap-2 py-10 rounded-2xl border-2 border-dashed border-border active:bg-surface">
                    <ImagePlus size={28} color={c.faint} />
                    <Text className="text-sm font-semibold text-primary">{tr('Elegir fotos', 'Choose photos')}</Text>
                  </Pressable>
                </>
              )
            ) : null}

            {phase !== 'pick' ? (
              <View className="gap-4">
                <View className="flex-row items-center gap-2">
                  <CheckCircle2 size={16} color={c.success} />
                  <Text className="text-sm font-medium text-ink flex-1">{tr(`${matched.length} archivo(s) emparejados con ${matchedIds.length} equipo(s)`, `${matched.length} file(s) matched to ${matchedIds.length} equipment`)}</Text>
                </View>

                {skipped.length > 0 ? <Text className="text-xs text-muted">{tr(`${skipped.length} ya estaban subidas.`, `${skipped.length} were already uploaded.`)}</Text> : null}

                {unmatched.length > 0 ? (
                  <View className="bg-amber-500/10 border border-amber-100 rounded-xl px-4 py-3">
                    <View className="flex-row items-center gap-1.5">
                      <AlertTriangle size={14} color={c.warning} />
                      <Text className="text-sm font-semibold text-amber-800">{tr(`${unmatched.length} sin coincidencia`, `${unmatched.length} unmatched`)}</Text>
                    </View>
                    <Text className="text-xs text-amber-700 mt-1">{tr('El nombre de archivo no coincide con ningún equipo.', "The file name doesn't match any equipment.")}</Text>
                    <View className="mt-2" style={{ maxHeight: 120 }}>
                      {unmatched.slice(0, 12).map((p, i) => <Text key={i} className="text-xs font-mono text-amber-800" numberOfLines={1}>{p.name || tr('(sin nombre)', '(no name)')}</Text>)}
                      {unmatched.length > 12 ? <Text className="text-xs text-amber-700">+{unmatched.length - 12}</Text> : null}
                    </View>
                  </View>
                ) : null}

                {phase === 'done' ? (
                  <View className="gap-1.5">
                    <Text className="text-sm font-semibold text-emerald-600">{tr(`Se subieron ${uploadedCount} foto(s).`, `Uploaded ${uploadedCount} photo(s).`)}</Text>
                    {limitSkipped > 0 ? <Text className="text-xs text-amber-600">{tr(`${limitSkipped} omitidas (máx ${MAX_PHOTOS_PER_EQUIPMENT} por equipo).`, `${limitSkipped} skipped (max ${MAX_PHOTOS_PER_EQUIPMENT} per equipment).`)}</Text> : null}
                    {failed.length > 0 ? <Text className="text-xs text-red-500">{tr(`${failed.length} fallaron.`, `${failed.length} failed.`)}</Text> : null}
                  </View>
                ) : null}

                {phase === 'review' ? (
                  <View className="gap-2.5">
                    <Pressable onPress={() => void upload()} disabled={uploadable.length === 0} className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
                      <Text className="text-sm font-semibold text-white">{tr(`Subir ${uploadable.length}`, `Upload ${uploadable.length}`)}</Text>
                    </Pressable>
                    <Pressable onPress={() => { setPicked([]); setPhase('pick'); }} className="py-3.5 rounded-2xl border border-border items-center active:bg-surface">
                      <Text className="text-sm font-semibold text-muted">{tr('Limpiar', 'Clear')}</Text>
                    </Pressable>
                  </View>
                ) : null}

                {phase === 'done' ? (
                  <View className="gap-2.5">
                    {failed.length > 0 ? (
                      <Pressable onPress={() => void upload(true)} className="py-3.5 rounded-2xl border border-border items-center active:bg-surface">
                        <Text className="text-sm font-semibold text-muted">{tr('Reintentar', 'Retry')}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={onClose} className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90">
                      <Text className="text-sm font-semibold text-white">{tr('Cerrar', 'Close')}</Text>
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
