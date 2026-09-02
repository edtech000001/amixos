// Files module screen (mobile). Google-Drive-style nested folders: top-level
// folders (file_categories, carrying the Team/Office visibility default)
// contain arbitrarily-nested folders (file_folders); files live at any level.
// Navigate one level at a time; files can override their own visibility.
// One-hand conventions: FAB + bottom-sheet forms (fade), save at the bottom.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadCachedThenFresh, writeCacheAndStamp } from '@amixos/shared/lib/swrCache';
import { useDataFingerprint } from '@amixos/shared/lib/dataFingerprint';
import { SkeletonList } from '@amixos/shared/ui/Skeleton';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, Alert, Linking,
  Modal as RNModal, KeyboardAvoidingView, Platform, Image, Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { hasClipboardImage, readClipboardImageToFile } from '@/lib/clipboardPhoto';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {
  ChevronLeft, ChevronRight, CornerUpLeft, FileText, Folder, FolderOpen, FolderPlus,
  FilePlus2, Link2, Trash2, Pencil, ExternalLink, Upload, Lock,
  Users as UsersIcon, Check, X, FolderInput, Plus, LayoutGrid, List as ListIcon, RotateCw,
  ImagePlus, Camera, ClipboardPaste,
} from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useApp } from '@/lib/AppContext';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useLang } from '@/lib/i18n/LangProvider';
import { Input, Toggle, Button, Fab } from '@amixos/shared/ui';
import { can } from '@amixos/shared/lib/permissions';
import {
  fetchFilesTree, fileStoragePath, fileUid, fileMeta, fileIsCrewVisible,
  type FilesTree,
  FILES_BUCKET, FILE_MAX_BYTES, requestThumbnail, backfillThumbnails, coverStoragePath,
  coverTransform, rotateCover, isDefaultCoverTransform, type CoverTransform,
  type FileCategory, type FileFolder, type FileEntry, type FileEntryKind,
} from '@amixos/shared/lib/files';
import { signedUrl } from '@amixos/shared/lib/storageUrls';
import { kvGet, kvSet } from '@amixos/shared/lib/kvStore';

/**
 * Fire-and-forget thumbnail request. Swallows every failure on purpose: the
 * API may be unreachable (offline, or not yet deployed) and that must never
 * surface as an upload error.
 */
async function queueThumbnail(entryId: string): Promise<void> {
  try {
    const base = getApiBaseUrl();
    if (!base) return;
    const jwt = await getJwt();
    if (!jwt) return;
    await requestThumbnail(base, jwt, entryId);
  } catch {
    /* thumbnails are best-effort */
  }
}

/** Device-level display preference. Same key as web, so the two stay
 *  independent per device but consistent in naming. */
const FILES_VIEW_KEY = 'amixos_files_view_mode';
import { storageLimitBytes, storagePercent, formatBytes, wouldExceedStorage } from '@amixos/shared/lib/storageLimits';

interface Crumb { categoryId: string | null; folderId: string | null; label: string }

type Sheet =
  | { type: 'actions' }
  | { type: 'folder'; editing: FileCategory | FileFolder | null }
  | { type: 'file'; editing: FileEntry | null }
  | { type: 'move' }
  | null;

export default function ArchivosScreen() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  // List vs grid, remembered per device. Starts as 'list' and swaps in the
  // stored value once read, so the first paint is never the wrong layout for
  // long.
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  // Grid cards are half the content width. FramedCover needs a real pixel width
  // to compute the cover scale, so it is derived once rather than guessed:
  // screen minus the list's px-6 padding, minus the px-1 gutter on each card.
  const cardWidth = Math.floor((Dimensions.get('window').width - 48) / 2) - 8;
  useEffect(() => {
    void kvGet(FILES_VIEW_KEY).then(v => { if (v === 'grid' || v === 'list') setViewMode(v); });
  }, []);
  const toggleViewMode = () => {
    setViewMode(prev => {
      const next = prev === 'grid' ? 'list' : 'grid';
      void kvSet(FILES_VIEW_KEY, next);
      return next;
    });
  };
  const { business, user, currentRole } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.files;
  const tc = full.common;
  const c = useThemeColors();
  const es = locale === 'es';
  const canManage = can.manageFiles(currentRole);

  // Storage usage meter (mirrors web). Limit comes from the plan; null = unlimited.
  const subInfo = business ? {
    plan: business.plan,
    subscription_status: business.subscription_status,
    trial_ends_at: business.trial_ends_at,
    current_period_end: business.current_period_end,
  } : null;
  const limitBytes = subInfo ? storageLimitBytes(subInfo) : null;
  const [usedBytes, setUsedBytes] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<Record<string, number> | null>(null);

  // Blocks an upload that would push the business over its plan's storage limit
  // (mirrors web). Refetches usage fresh so the check is accurate.
  const checkStorageExceeded = useCallback(async (fileBytes: number): Promise<boolean> => {
    if (!business || !subInfo) return false;
    const { data } = await supabase.rpc('business_storage_bytes', { p_business_id: business.id });
    return wouldExceedStorage(subInfo, Number(data ?? 0), fileBytes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const [categories, setCategories] = useState<FileCategory[]>([]);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stack, setStack] = useState<Crumb[]>([{ categoryId: null, folderId: null, label: '' }]);
  // Selection spans BOTH files and folders so a single Move button relocates
  // everything chosen at once.
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  // Top-level folders live in a different table, so they need their own set.
  // They are selectable purely so they remain editable: edit/delete moved into
  // the selection bar, and without this a category would have no edit path.
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<Sheet>(null);
  const clearSelection = () => {
    setSelectedEntries(new Set());
    setSelectedFolders(new Set());
    setSelectedCategories(new Set());
  };
  const selectionCount = selectedEntries.size + selectedFolders.size + selectedCategories.size;
  // Selection UI (checkboxes) only appears once something is selected — entered
  // by long-pressing a row. Until then rows behave normally (tap = open/enter).
  const selectionMode = selectionCount > 0;

  // The library changes rarely, so it's cache-first: the saved tree paints
  // immediately and the query only re-runs when data_fingerprint reports a
  // change to entries, folders or categories (migration 208). That matters
  // most here — this screen reloads on every focus, which used to mean a full
  // tree fetch each time the user came back to it.
  const cacheKey = business ? `files_tree_${business.id}` : null;
  const fingerprint = useDataFingerprint(supabase, business?.id, ['files']);

  const applyTree = useCallback((tree: FilesTree) => {
    setCategories(tree.categories);
    setFolders(tree.folders);
    setEntries(tree.entries);
    setLoading(false);
  }, []);

  // Storage meter — always refreshed, because it lives in component state and
  // a cache hit would otherwise render 0 bytes.
  const loadUsage = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase.rpc('business_storage_bytes', { p_business_id: business.id });
    setUsedBytes(Number(data ?? 0));
    // Breakdown (jobs vs library vs equipment) — best-effort: the RPC is
    // migration 149; if it isn't run yet the meter just shows the total.
    const { data: bd } = await supabase.rpc('business_storage_breakdown', { p_business_id: business.id });
    if (bd && typeof bd === 'object') setBreakdown(bd as Record<string, number>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  // Full refetch — what every mutation calls. Re-stamps so the next open is
  // instant. Stamp read BEFORE the fetch (see writeCacheAndStamp).
  const load = useCallback(async () => {
    if (!business) return;
    const stamp = fingerprint ? await fingerprint().catch(() => null) : null;
    const tree = await fetchFilesTree(supabase, business.id);
    applyTree(tree);
    if (cacheKey) void writeCacheAndStamp(cacheKey, tree, stamp);
    void loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, fingerprint, cacheKey, applyTree, loadUsage]);

  useFocusEffect(
    useCallback(() => {
      if (!business) return;
      let cancelled = false;
      const businessId = business.id;
      void loadCachedThenFresh<FilesTree>({
        cacheKey,
        fingerprint,
        fetcher: () => fetchFilesTree(supabase, businessId),
        cancelled: () => cancelled,
        apply: applyTree,
      }).catch(() => setLoading(false));
      void loadUsage();
      return () => { cancelled = true; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [business?.id, cacheKey, fingerprint, applyTree, loadUsage]),
  );

  // Drain the thumbnail backlog while the grid is open — exactly when previews
  // matter and when the user is already looking at the result. Avoids a
  // "generate previews" button nobody would know to press; files uploaded
  // before thumbnails existed fill in over a visit or two.
  //
  // Bounded per mount so it can never become an open-ended loop: batches of 10,
  // at most MAX_SWEEPS of them, stopping early once the queue is empty. The API
  // is idempotent, so two people browsing at once just no-op each other.
  const sweptRef = useRef(false);
  useEffect(() => {
    if (viewMode !== 'grid' || !business || sweptRef.current) return;
    const apiBase = getApiBaseUrl();
    if (!apiBase) return;
    if (!entries.some(e => e.kind === 'file' && !e.thumbnail_path)) return;
    sweptRef.current = true;

    let cancelled = false;
    void (async () => {
      const MAX_SWEEPS = 6;
      const jwt = await getJwt();
      if (!jwt) return;
      for (let i = 0; i < MAX_SWEEPS && !cancelled; i++) {
        const res = await backfillThumbnails(apiBase, jwt, business.id, 10);
        if (!res) return;                 // API unreachable — try again next visit
        if (res.ready > 0) await load();  // show what just landed
        if (res.remaining === 0) return;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, business?.id, entries.length]);

  const here = stack[stack.length - 1];
  const atHome = here.categoryId === null;
  const category = categories.find(c => c.id === here.categoryId) ?? null;
  const childFolders = atHome ? [] : folders.filter(f => f.category_id === here.categoryId && f.parent_folder_id === here.folderId);
  const childEntries = atHome ? [] : entries.filter(e => e.category_id === here.categoryId && e.folder_id === here.folderId);
  const isEmpty = atHome ? categories.length === 0 : (childFolders.length === 0 && childEntries.length === 0);
  // Direct items in a folder = its subfolders + its files (one level, like
  // Drive/Finder). Computed from the already-loaded full tree.
  const folderItemCount = (categoryId: string, folderId: string | null) =>
    folders.filter(f => f.category_id === categoryId && f.parent_folder_id === folderId).length +
    entries.filter(e => e.category_id === categoryId && e.folder_id === folderId).length;

  // Header arrow = leave the module (always). Folder navigation has its own
  // up-arrow in the breadcrumb bar — mixing both into one button meant several
  // taps to exit from a deep folder, and 'back' changing meaning per depth.
  const goBack = () => router.navigate('/dashboard/mas' as never);
  const folderUp = () => { setStack(s => s.slice(0, -1)); clearSelection(); };
  const enterCategory = (c: FileCategory) => setStack(s => [...s, { categoryId: c.id, folderId: null, label: c.name }]);
  const enterFolder = (f: FileFolder) => setStack(s => [...s, { categoryId: f.category_id, folderId: f.id, label: f.name }]);

  const toggleEntry = (id: string) =>
    setSelectedEntries(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleFolder = (id: string) =>
    setSelectedFolders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCategory = (id: string) =>
    setSelectedCategories(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /** Edit the one selected item. Offered only at a count of exactly 1 —
   *  "edit" has no meaning for a set. */
  const editSelected = () => {
    if (selectionCount !== 1) return;
    const catId = Array.from(selectedCategories)[0];
    if (catId) {
      const cat = categories.find(x => x.id === catId);
      if (cat) setSheet({ type: 'folder', editing: cat });
    } else {
      const folderId = Array.from(selectedFolders)[0];
      if (folderId) {
        const f = folders.find(x => x.id === folderId);
        if (f) setSheet({ type: 'folder', editing: f });
      } else {
        const e = entries.find(x => x.id === Array.from(selectedEntries)[0]);
        if (e) setSheet({ type: 'file', editing: e });
      }
    }
    clearSelection();
  };

  /** Delete everything selected, whatever the mix — one confirmation for the
   *  whole set rather than one per item. */
  const deleteSelected = () => {
    if (selectionCount === 0) return;
    const anyFolder = selectedFolders.size > 0 || selectedCategories.size > 0;
    // A folder cascades to its contents, so it earns the harsher wording even
    // when files are also in the selection.
    confirmDelete(anyFolder ? t.deleteFolderConfirm : t.deleteEntryConfirm, async () => {
      if (selectedEntries.size) await supabase.from('file_entries').delete().in('id', Array.from(selectedEntries));
      if (selectedFolders.size) await supabase.from('file_folders').delete().in('id', Array.from(selectedFolders));
      if (selectedCategories.size) await supabase.from('file_categories').delete().in('id', Array.from(selectedCategories));
      clearSelection();
    });
  };

  const openEntry = (e: FileEntry) => {
    if (e.kind === 'link') {
      if (e.url) Linking.openURL(e.url).catch(() => {});
      return;
    }
    if (!e.storage_path) return;
    // Private bucket: mint a short-lived signed URL on demand, then open it.
    void signedUrl(supabase, e.storage_path).then((href) => {
      if (href) Linking.openURL(href).catch(() => {});
    });
  };
  const confirmDelete = (message: string, run: () => Promise<void>) =>
    Alert.alert('', message, [
      { text: tc.buttons.cancel, style: 'cancel' },
      { text: tc.buttons.delete, style: 'destructive', onPress: () => { void run().then(load); } },
    ]);
  // All folder ids in a subtree (the folder + everything nested below it).
  const folderSubtreeIds = (folderId: string): string[] => {
    const out = new Set<string>([folderId]);
    let frontier = [folderId];
    while (frontier.length) {
      const next = folders.filter(f => f.parent_folder_id && frontier.includes(f.parent_folder_id) && !out.has(f.id));
      next.forEach(f => out.add(f.id));
      frontier = next.map(f => f.id);
    }
    return Array.from(out);
  };

  // Move the whole selection (files + folders) into one destination.
  const moveSelection = async (target: { categoryId: string; folderId: string | null }) => {
    if (selectionCount === 0) return;
    // Files: straight repoint.
    if (selectedEntries.size) {
      await supabase.from('file_entries')
        .update({ category_id: target.categoryId, folder_id: target.folderId })
        .in('id', Array.from(selectedEntries));
    }
    // Folders: move only the top-level selected ones. A selected folder nested
    // under another selected folder rides along with its ancestor — moving it
    // separately would yank it out of place. Cross-category moves cascade the
    // denormalized category_id over each moved subtree (RLS resolves visibility
    // via a single category join, so it must stay accurate).
    const ancestorSelected = (f: FileFolder) => {
      let pid = f.parent_folder_id;
      while (pid) {
        if (selectedFolders.has(pid)) return true;
        pid = folders.find(x => x.id === pid)?.parent_folder_id ?? null;
      }
      return false;
    };
    const topLevel = folders.filter(f => selectedFolders.has(f.id) && !ancestorSelected(f));
    for (const folder of topLevel) {
      await supabase.from('file_folders')
        .update({ category_id: target.categoryId, parent_folder_id: target.folderId })
        .eq('id', folder.id);
      if (target.categoryId !== folder.category_id) {
        const ids = folderSubtreeIds(folder.id);
        await supabase.from('file_folders').update({ category_id: target.categoryId }).in('id', ids);
        await supabase.from('file_entries').update({ category_id: target.categoryId }).in('folder_id', ids);
      }
    }
    setSheet(null);
    clearSelection();
    void load();
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* App bar */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable onPress={goBack} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text className="ml-1 text-lg font-semibold text-ink flex-1" numberOfLines={1}>
          {atHome ? t.title : here.label}
        </Text>
        {/* Outside any canManage gate: read-only members browse these folders
            too and want thumbnails just as much. */}
        <Pressable
          onPress={toggleViewMode}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={viewMode === 'grid' ? t.listView : t.gridView}
          className="p-2 rounded-lg active:bg-border-soft"
        >
          {viewMode === 'grid' ? <ListIcon size={19} color={c.muted} /> : <LayoutGrid size={19} color={c.muted} />}
        </Pressable>
      </View>

      {/* Breadcrumb (depth > 1). A plain flex-row View — NOT a horizontal
         ScrollView, which stretches vertically in a flex column and left a
         huge gap under the header. flex-wrap handles deep paths. */}
      {stack.length > 1 ? (
        <View className="flex-row flex-wrap items-center gap-1 px-4 py-2.5 border-b border-border-soft">
          <Pressable onPress={folderUp} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.goUpBtn} className="mr-1.5 p-1.5 rounded-lg bg-border-soft active:bg-border">
            <CornerUpLeft size={14} color={c.muted} />
          </Pressable>
          {stack.map((crumb, i) => (
            <Pressable key={i} onPress={() => { setStack(s => s.slice(0, i + 1)); clearSelection(); }} className="flex-row items-center gap-1">
              {i > 0 ? <ChevronRight size={12} color={c.faint} /> : null}
              <Text className={`text-xs ${i === stack.length - 1 ? 'text-ink font-semibold' : 'text-primary'}`}>
                {i === 0 ? t.title : crumb.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Selection bar (files + folders) */}
      {canManage && selectionCount > 0 ? (
        <View className="flex-row items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/20">
          <Pressable onPress={clearSelection} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.clearSelectionBtn}><X size={16} color={c.primary} /></Pressable>
          <Text className="text-sm font-medium text-primary flex-1" numberOfLines={1}>{t.selectedCount.replace('{{count}}', String(selectionCount))}</Text>
          {/* Edit only at exactly one — "edit" has no meaning for a set. */}
          {selectionCount === 1 ? (
            <Pressable onPress={editSelected} hitSlop={6} className="p-2 rounded-lg active:bg-primary/10">
              <Pencil size={16} color={c.primary} />
            </Pressable>
          ) : null}
          {/* Move relocates within the folder tree, which a top-level folder
              has no place in — so it is offered only when the selection is
              actually movable. */}
          {selectedCategories.size === 0 && !atHome ? (
            <Pressable onPress={() => setSheet({ type: 'move' })} hitSlop={6} className="p-2 rounded-lg active:bg-primary/10">
              <FolderInput size={16} color={c.primary} />
            </Pressable>
          ) : null}
          <Pressable onPress={deleteSelected} hitSlop={6} className="p-2 rounded-lg active:bg-red-500/10">
            <Trash2 size={16} color={c.danger} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView className="flex-1" contentContainerClassName="px-6 pt-5 pb-32">
        {/* Storage usage meter (mirrors web) — only at the top-level files view. */}
        {atHome && business ? (
          limitBytes === null ? (
            <Text className="text-xs text-faint mb-4">{es ? 'Almacenamiento ilimitado' : 'Unlimited storage'}</Text>
          ) : (() => {
            const used = usedBytes ?? 0;
            const pct = storagePercent(used, limitBytes);
            const full100 = used >= limitBytes;
            const barColor = full100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary';
            return (
              <View className="rounded-xl border border-border-soft bg-card px-4 py-3 mb-4">
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-sm font-medium text-ink">{es ? 'Almacenamiento' : 'Storage'}</Text>
                  <Text className="text-xs text-muted">
                    {formatBytes(used)} {es ? 'de' : 'of'} {formatBytes(limitBytes)}
                  </Text>
                </View>
                <View className="h-1.5 w-full rounded-full bg-border-soft overflow-hidden">
                  <View className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </View>
                {/* What's eating the space: job photos+documents vs this
                   library vs equipment (needs migration 149). */}
                {breakdown ? (
                  <Text className="text-xs text-faint mt-1.5">
                    {([
                      // This screen's own library always shows (even at 0 —
                      // link entries take no storage); the rest only when >0.
                      [es ? 'Manuales y documentos' : 'Manuals & documents', Number(breakdown.files ?? 0), true],
                      [es ? 'Trabajos (fotos y documentos)' : 'Jobs (photos & documents)', Number(breakdown.jobs ?? 0), false],
                      [es ? 'Equipos' : 'Equipment', Number(breakdown.equipment ?? 0), false],
                      [es ? 'Otros' : 'Other', Number(breakdown.other ?? 0), false],
                    ] as [string, number, boolean][])
                      .filter(([, v, always]) => always || v > 0)
                      .map(([label, v]) => `${label}: ${formatBytes(v)}`)
                      .join(' · ')}
                  </Text>
                ) : null}
                {full100 ? (
                  <Text className="text-xs text-red-500 mt-1.5">
                    {es ? 'Almacenamiento lleno · mejora tu plan' : 'Storage full · upgrade your plan'}
                  </Text>
                ) : null}
              </View>
            );
          })()
        ) : null}
        {atHome ? <Text className="text-sm text-muted mb-5">{t.subtitle}</Text> : null}

        {loading ? (
          <SkeletonList rows={8} />
        ) : isEmpty ? (
          <View className="py-16 items-center rounded-2xl border border-dashed border-border bg-surface">
            <FolderOpen size={30} color={c.faint} />
            <Text className="text-sm font-medium text-muted mt-3">{atHome ? t.empty : t.emptyFolder}</Text>
            {!canManage && atHome ? <Text className="text-xs text-faint mt-1 px-8 text-center">{t.emptyHint}</Text> : null}
          </View>
        ) : (
          <View className="gap-2">
            {/* Grid mode tiles folders too. A folder-only view that looked
                identical in both modes made the toggle read as broken. */}
            {viewMode === 'grid' ? (
              <View className="flex-row flex-wrap -mx-1">
                {(atHome ? categories : []).map(cat => (
                  <View key={cat.id} className="w-1/2 px-1 pb-2">
                    <FolderTile
                      name={cat.name}
                      count={folderItemCount(cat.id, null)}
                      onOpen={() => enterCategory(cat)}
                      canManage={canManage}
                      coverPath={cat.cover_path} coverTf={cat.cover_transform}
                      selected={selectedCategories.has(cat.id)}
                      selectionMode={selectionMode}
                      onToggleSelect={() => toggleCategory(cat.id)}
                    />
                  </View>
                ))}
                {childFolders.map(f => (
                  <View key={f.id} className="w-1/2 px-1 pb-2">
                    <FolderTile
                      name={f.name}
                      count={folderItemCount(f.category_id, f.id)}
                      onOpen={() => enterFolder(f)}
                      canManage={canManage}
                      selected={selectedFolders.has(f.id)}
                      selectionMode={selectionMode}
                      onToggleSelect={() => toggleFolder(f.id)}
                      coverPath={f.cover_path} coverTf={f.cover_transform}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            {/* Top-level folders (home) */}
            {viewMode !== 'grid' && atHome ? categories.map(c => (
              <FolderRow key={c.id} name={c.name} count={folderItemCount(c.id, null)}
                badge={c.crew_visible ? { label: t.crewBadge, team: true } : { label: t.officeOnlyBadge, team: false }}
                onOpen={() => enterCategory(c)} canManage={canManage} coverPath={c.cover_path} coverTf={c.cover_transform}
                selected={selectedCategories.has(c.id)} selectionMode={selectionMode}
                onToggleSelect={() => toggleCategory(c.id)}
              />
            )) : null}

            {/* Subfolders — selectable, so they can be moved with files in bulk */}
            {viewMode === 'grid' ? null : childFolders.map(f => (
              <FolderRow key={f.id} name={f.name} count={folderItemCount(f.category_id, f.id)}
                onOpen={() => enterFolder(f)} canManage={canManage}
                selected={selectedFolders.has(f.id)} selectionMode={selectionMode}
                onToggleSelect={() => toggleFolder(f.id)} coverPath={f.cover_path} coverTf={f.cover_transform}
              />
            ))}

            {/* Files. */}
            {viewMode === 'grid' ? (
              <View className="flex-row flex-wrap -mx-1">
                {childEntries.map(e => {
                  const officeOnly = !!category && !fileIsCrewVisible(e, category.crew_visible);
                  const picked = selectedEntries.has(e.id);
                  return (
                    <View key={e.id} className="w-1/2 px-1 pb-2">
                      <Pressable
                        onPress={() => (canManage && selectionMode ? toggleEntry(e.id) : openEntry(e))}
                        onLongPress={canManage ? () => toggleEntry(e.id) : undefined}
                        delayLongPress={250}
                        className={`rounded-xl border overflow-hidden ${picked ? 'border-primary bg-primary/5' : 'border-border-soft bg-card'}`}
                      >
                        <View className="w-full border-b border-border-soft overflow-hidden">
                          <FileThumb entry={e} size={150} width={cardWidth} />
                        </View>
                        <View className="px-2.5 py-2">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-xs font-medium text-ink flex-shrink" numberOfLines={1}>{e.title}</Text>
                            {officeOnly ? <Lock size={10} color={c.warning} /> : null}
                          </View>
                          <Text className="text-[11px] text-faint" numberOfLines={1}>{fileMeta(e, t.linkBadge)}</Text>
                        </View>
                        {canManage && selectionMode ? (
                          <View className={`absolute top-2 left-2 w-5 h-5 rounded border items-center justify-center ${picked ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                            {picked ? <Check size={12} color="#FFFFFF" /> : null}
                          </View>
                        ) : null}

                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {viewMode === 'grid' ? null : childEntries.map(e => {
              const officeOnly = !!category && !fileIsCrewVisible(e, category.crew_visible);
              return (
                <View key={e.id} className={`flex-row items-center gap-3 px-3 py-2.5 rounded-xl border ${selectedEntries.has(e.id) ? 'border-primary bg-primary/5' : 'border-border-soft'}`}>
                  {canManage && selectionMode ? (
                    <Pressable onPress={() => toggleEntry(e.id)} hitSlop={8}
                      className={`w-5 h-5 rounded border items-center justify-center ${selectedEntries.has(e.id) ? 'bg-primary border-primary' : 'border-border'}`}>
                      {selectedEntries.has(e.id) ? <Check size={12} color="#FFFFFF" /> : null}
                    </Pressable>
                  ) : null}
                  <View className="w-8 h-8 rounded-lg bg-surface items-center justify-center">
                    {e.kind === 'link' ? <Link2 size={15} color={c.muted} /> : <FileText size={15} color={c.muted} />}
                  </View>
                  <Pressable
                    onPress={() => (canManage && selectionMode ? toggleEntry(e.id) : openEntry(e))}
                    onLongPress={canManage ? () => toggleEntry(e.id) : undefined}
                    delayLongPress={250}
                    className="flex-1"
                  >
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-sm font-medium text-ink flex-shrink" numberOfLines={1}>{e.title}</Text>
                      {officeOnly ? <Lock size={11} color={c.warning} /> : null}
                    </View>
                    <Text className="text-xs text-faint">{fileMeta(e, t.linkBadge)}</Text>
                  </Pressable>
                  {/* Open stays inline; edit and delete moved to the
                      selection bar (long-press). */}
                  {!selectionMode ? (
                    <Pressable onPress={() => openEntry(e)} hitSlop={6} className="p-1.5"><ExternalLink size={15} color={c.faint} /></Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {canManage ? (
        <Fab onPress={() => setSheet({ type: 'actions' })} icon={<Plus size={26} color="#FFFFFF" />} />
      ) : null}

      {sheet ? (
        <FileSheets
          sheet={sheet}
          atHome={atHome}
          categoryId={here.categoryId}
          folderId={here.folderId}
          categories={categories}
          folders={folders}
          selectedCount={selectionCount}
          selectedFolderIds={selectedFolders}
          businessId={business!.id}
          userId={user?.id ?? null}
          onClose={() => setSheet(null)}
          onPick={(next) => setSheet(next)}
          onMove={moveSelection}
          onSaved={() => { setSheet(null); void load(); }}
          onCheckStorage={checkStorageExceeded}
        />
      ) : null}
    </SafeAreaView>
  );
}

function FolderRow({ name, count, badge, onOpen, canManage, selected, selectionMode, onToggleSelect, coverPath, coverTf }: {
  name: string; count?: number; badge?: { label: string; team: boolean }; onOpen: () => void;
  canManage: boolean;
  // Everything selectable now, top-level folders included: edit and delete
  // live in the selection bar, so a category with no checkbox would have no
  // way to be edited at all.
  selected?: boolean; selectionMode?: boolean; onToggleSelect?: () => void;
  /** Hand-picked folder picture (migration 214); null falls back to the icon. */
  coverPath?: string | null;
  /** Its framing (migration 216). */
  coverTf?: unknown;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.files;
  const c = useThemeColors();
  const countLabel = count == null
    ? null
    : count === 0 ? t.itemsEmpty : count === 1 ? t.itemsOne : t.itemsMany.replace('{{count}}', String(count));
  const selectable = canManage && !!onToggleSelect;
  const inSelect = selectable && !!selectionMode;
  return (
    <View className={`flex-row items-center gap-3 px-3 py-3 rounded-xl border ${selected ? 'border-primary bg-primary/5' : 'border-border-soft'}`}>
      {inSelect ? (
        <Pressable onPress={onToggleSelect} hitSlop={8}
          className={`w-5 h-5 rounded border items-center justify-center ${selected ? 'bg-primary border-primary' : 'border-border'}`}>
          {selected ? <Check size={12} color="#FFFFFF" /> : null}
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => (inSelect ? onToggleSelect!() : onOpen())}
        onLongPress={selectable ? onToggleSelect : undefined}
        delayLongPress={250}
        className="flex-row items-center gap-3 flex-1"
      >
        <View className="w-9 h-9 rounded-lg bg-primary/10 items-center justify-center overflow-hidden">
          {coverPath ? <CoverImage path={coverPath} transform={coverTf} size={36} /> : <Folder size={17} color={c.primary} />}
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="font-medium text-ink flex-shrink" numberOfLines={1}>{name}</Text>
            {badge ? (
              <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${badge.team ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                {badge.team ? <UsersIcon size={9} color={c.success} /> : <Lock size={9} color={c.warning} />}
                <Text className={`text-[10px] font-semibold ${badge.team ? 'text-emerald-700' : 'text-amber-700'}`}>{badge.label}</Text>
              </View>
            ) : null}
          </View>
          {countLabel ? <Text className="text-xs text-faint mt-0.5">{countLabel}</Text> : null}
        </View>
      </Pressable>
      {/* Edit and delete live in the selection bar now (long-press), so a row
          carries navigation only. */}
      {!inSelect ? <ChevronRight size={16} color={c.faint} /> : null}
    </View>
  );
}

// All bottom sheets for the screen (actions chooser, folder form, file form,
// move picker). animationType="fade" keeps the backdrop steady.
function FileSheets({
  sheet, atHome, categoryId, folderId, categories, folders, selectedCount, selectedFolderIds,
  businessId, userId, onClose, onPick, onMove, onSaved, onCheckStorage,
}: {
  sheet: NonNullable<Sheet>;
  atHome: boolean; categoryId: string | null; folderId: string | null;
  categories: FileCategory[]; folders: FileFolder[]; selectedCount: number;
  // Selected folders (+ their subtrees) are excluded from the destination
  // picker so you can't move a folder into itself or one of its children.
  selectedFolderIds: Set<string>;
  businessId: string; userId: string | null;
  onClose: () => void; onPick: (s: Sheet) => void;
  onMove: (target: { categoryId: string; folderId: string | null }) => void;
  onSaved: () => void;
  /** Returns true if uploading `fileBytes` would exceed the storage limit. */
  onCheckStorage: (fileBytes: number) => Promise<boolean>;
}) {
  const { t: full, locale } = useLang();
  const es = locale === 'es';
  const t = full.dashboard.files;
  const tc = full.common;
  // Reuse the job-photos labels rather than duplicating "Take photo" etc —
  // the chooser is deliberately the same one users already know.
  const tPhotos = full.dashboard.jobs.detail.photos;
  const c = useThemeColors();

  // Folder form state
  const folderEditing = sheet.type === 'folder' ? sheet.editing : null;
  const isCategory = folderEditing ? !('category_id' in folderEditing) : atHome;
  const [fname, setFname] = useState(folderEditing?.name ?? '');
  const [crewVisible, setCrewVisible] = useState(
    folderEditing && !('category_id' in folderEditing) ? (folderEditing as FileCategory).crew_visible : true,
  );
  // Folder picture (migration 214). Always hand-picked — a folder has no
  // contents to render a preview from.
  const [fCoverUri, setFCoverUri] = useState<string | null>(null);
  const [fCoverRemoved, setFCoverRemoved] = useState(false);
  const [fCoverSigned, setFCoverSigned] = useState<string | null>(null);
  const existingFolderCover = folderEditing?.cover_path ?? null;
  const [fCoverTf, setFCoverTf] = useState<CoverTransform>(() => coverTransform(folderEditing?.cover_transform, 'photo'));

  useEffect(() => {
    let cancelled = false;
    if (!existingFolderCover) { setFCoverSigned(null); return; }
    void signedUrl(supabase, existingFolderCover).then(u => { if (!cancelled) setFCoverSigned(u); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingFolderCover]);



  /** Resolve the cover column for a row that now definitely exists. Uploading
   *  after the insert means a cancelled save leaves no orphan in the bucket. */
  const applyFolderCover = async (table: 'file_categories' | 'file_folders', id: string) => {
    // Null rather than a row of no-op numbers, so "unadjusted" is one value.
    const tf = isDefaultCoverTransform(fCoverTf, 'photo') ? null : fCoverTf;
    if (fCoverRemoved && !fCoverUri) {
      await supabase.from(table).update({ cover_path: null, cover_transform: null }).eq('id', id);
      return;
    }
    if (!fCoverUri) {
      // Re-framing an existing picture writes only the transform — no upload.
      if (existingFolderCover) await supabase.from(table).update({ cover_transform: tf }).eq('id', id);
      return;
    }
    try {
      const resp = await fetch(fCoverUri);
      const bytes = await resp.arrayBuffer();
      const path = coverStoragePath(businessId, id, 'jpg');
      const { error } = await supabase.storage.from(FILES_BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (error) return; // best-effort: never fail a save over a picture
      await supabase.from(table).update({ cover_path: path, cover_transform: tf }).eq('id', id);
    } catch {
      /* cover is best-effort */
    }
  };

  // File form state
  const fileEditing = sheet.type === 'file' ? sheet.editing : null;
  const [kind, setKind] = useState<FileEntryKind>(fileEditing?.kind ?? 'file');
  const [title, setTitle] = useState(fileEditing?.title ?? '');
  const [url, setUrl] = useState(fileEditing?.url ?? '');
  const [vis, setVis] = useState<'inherit' | 'team' | 'office'>(
    fileEditing == null || fileEditing.crew_visible == null ? 'inherit' : fileEditing.crew_visible ? 'team' : 'office',
  );
  const [picked, setPicked] = useState<{ uri: string; name: string; size: number; mimeType: string | null } | null>(null);
  // Hand-picked cover (migration 213). Links never get one automatically —
  // rendering the page a URL points at would mean the server fetching
  // arbitrary user-supplied addresses — so the user supplies the image. Held
  // as a uri and uploaded only once the row exists, so a cancelled save
  // leaves no orphan in the bucket.
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [coverSignedUrl, setCoverSignedUrl] = useState<string | null>(null);
  const existingCover = fileEditing?.thumbnail_path ?? null;
  const [coverTf, setCoverTf] = useState<CoverTransform>(() => coverTransform(fileEditing?.cover_transform, 'document'));

  useEffect(() => {
    let cancelled = false;
    if (!existingCover) { setCoverSignedUrl(null); return; }
    void signedUrl(supabase, existingCover).then(u => { if (!cancelled) setCoverSignedUrl(u); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingCover]);

  // Which cover the picker is choosing for: the file entry or the folder.
  // One picker serves both so there is a single overlay to render.
  const [coverPickerFor, setCoverPickerFor] = useState<null | 'entry' | 'folder'>(null);
  const [canPasteCover, setCanPasteCover] = useState(false);

  /** Open the chooser, checking the clipboard first so the Paste row only
   *  appears when there is actually an image to paste — same as job photos. */
  const openCoverPicker = (target: 'entry' | 'folder') => {
    setCanPasteCover(false);
    void hasClipboardImage().then(setCanPasteCover);
    setCoverPickerFor(target);
  };

  const applyPickedCover = (uri: string) => {
    if (coverPickerFor === 'folder') { setFCoverUri(uri); setFCoverRemoved(false); }
    else { setCoverUri(uri); setCoverRemoved(false); }
    setCoverPickerFor(null);
  };

  const pickCoverFrom = async (source: 'camera' | 'library' | 'paste') => {
    if (source === 'paste') {
      const uri = await readClipboardImageToFile();
      if (uri) applyPickedCover(uri);
      else setCoverPickerFor(null);
      return;
    }
    // Downscaled at pick time rather than after upload: there is no canvas
    // here, and a full-resolution phone photo would be re-fetched on every
    // grid view forever.
    const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 } as const;
    const res = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]?.uri) { setCoverPickerFor(null); return; }
    applyPickedCover(res.assets[0].uri);
  };

  /** Upload the picked image and point the row at it. Best-effort: a cover
   *  failure must not fail a save whose file/link already went through. */
  const applyCover = async (entryId: string) => {
    const tf = isDefaultCoverTransform(coverTf, 'document') ? null : coverTf;
    if (coverRemoved && !coverUri) {
      // Null the status too, so a PDF becomes eligible for auto-generation again.
      await supabase.from('file_entries')
        .update({ thumbnail_path: null, thumbnail_status: null, thumbnail_manual: false, cover_transform: null })
        .eq('id', entryId);
      return;
    }
    if (!coverUri) {
      // Re-framing an existing cover (or a generated thumbnail) writes only the
      // transform — no upload, and a generated one stays generated.
      if (existingCover) await supabase.from('file_entries').update({ cover_transform: tf }).eq('id', entryId);
      return;
    }
    try {
      const resp = await fetch(coverUri);
      const bytes = await resp.arrayBuffer();
      const path = coverStoragePath(businessId, entryId, 'jpg');
      const { error: upErr } = await supabase.storage.from(FILES_BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (upErr) return;
      await supabase.from('file_entries')
        .update({ thumbnail_path: path, thumbnail_status: 'ready', thumbnail_manual: true, cover_transform: tf })
        .eq('id', entryId);
    } catch {
      /* cover is best-effort */
    }
  };

  // Move picker state
  // Open the move picker AT the current location (so the sibling folders —
  // e.g. Valley — show first), not at the root. The "up" control climbs out
  // toward Archivos if the user wants to move the item elsewhere.
  const [crumb, setCrumb] = useState<{ categoryId: string | null; folderId: string | null; label: string }>(() => {
    if (folderId) {
      return { categoryId, folderId, label: folders.find(f => f.id === folderId)?.name ?? '' };
    }
    if (categoryId) {
      return { categoryId, folderId: null, label: categories.find(c => c.id === categoryId)?.name ?? '' };
    }
    return { categoryId: null, folderId: null, label: '' };
  });
  const goUpInMove = () => {
    if (crumb.folderId) {
      const f = folders.find(x => x.id === crumb.folderId);
      if (f?.parent_folder_id) {
        const p = folders.find(x => x.id === f.parent_folder_id);
        setCrumb({ categoryId: crumb.categoryId, folderId: f.parent_folder_id, label: p?.name ?? '' });
      } else {
        const c = categories.find(x => x.id === crumb.categoryId);
        setCrumb({ categoryId: crumb.categoryId, folderId: null, label: c?.name ?? '' });
      }
    } else {
      setCrumb({ categoryId: null, folderId: null, label: '' });
    }
  };

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const supabase = createSupabaseClient();
  const crewVisibleValue = vis === 'inherit' ? null : vis === 'team';

  const pickFile = async () => {
    setError('');
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled) return;
    const f = res.assets[0];
    if (f.size != null && f.size > FILE_MAX_BYTES) { setError(t.tooBig); return; }
    setPicked({ uri: f.uri, name: f.name, size: f.size ?? 0, mimeType: f.mimeType ?? null });
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const saveFolder = async () => {
    if (!fname.trim()) return;
    setSaving(true);
    if (isCategory) {
      if (folderEditing) {
        await supabase.from('file_categories').update({ name: fname.trim(), crew_visible: crewVisible }).eq('id', folderEditing.id);
        await applyFolderCover('file_categories', folderEditing.id);
      } else {
        const { data } = await supabase.from('file_categories')
          .insert({ business_id: businessId, name: fname.trim(), crew_visible: crewVisible, created_by: userId })
          .select('id').single();
        if (data?.id) await applyFolderCover('file_categories', data.id);
      }
    } else {
      if (folderEditing) {
        await supabase.from('file_folders').update({ name: fname.trim() }).eq('id', folderEditing.id);
        await applyFolderCover('file_folders', folderEditing.id);
      } else {
        const { data } = await supabase.from('file_folders')
          .insert({ business_id: businessId, category_id: categoryId, parent_folder_id: folderId, name: fname.trim(), created_by: userId })
          .select('id').single();
        if (data?.id) await applyFolderCover('file_folders', data.id);
      }
    }
    onSaved();
  };

  const saveFile = async () => {
    setError('');
    setSaving(true);
    try {
      if (fileEditing) {
        await supabase.from('file_entries').update({
          title: title.trim() || fileEditing.title,
          url: fileEditing.kind === 'link' ? (url.trim() || fileEditing.url) : fileEditing.url,
          crew_visible: crewVisibleValue,
        }).eq('id', fileEditing.id);
        await applyCover(fileEditing.id);
        onSaved();
        return;
      }
      if (kind === 'file' && !picked) { setError(t.chooseFile); setSaving(false); return; }
      if (kind === 'link' && !url.trim()) { setError(t.linkUrlLabel); setSaving(false); return; }
      if (kind === 'file' && picked) {
        if (await onCheckStorage(picked.size ?? 0)) {
          setError(es ? 'No hay suficiente almacenamiento. Mejora tu plan para subir más.' : 'Not enough storage. Upgrade your plan to upload more.');
          setSaving(false);
          return;
        }
        const path = fileStoragePath(businessId, fileUid(), picked.name);
        const blob = await fetch(picked.uri).then(r => r.blob());
        const arrayBuffer = await new Response(blob).arrayBuffer();
        const { error: upErr } = await supabase.storage.from(FILES_BUCKET).upload(path, arrayBuffer, { contentType: picked.mimeType ?? undefined, upsert: false });
        if (upErr) throw new Error(upErr.message);
        const { data: created } = await supabase.from('file_entries').insert({
          business_id: businessId, category_id: categoryId, folder_id: folderId, title: title.trim() || picked.name,
          kind: 'file', storage_path: path, file_name: picked.name, file_size: picked.size, mime_type: picked.mimeType,
          crew_visible: crewVisibleValue, created_by: userId,
        }).select('id').single();
        // Kick off the first-page render without making the upload wait on it
        // or fail with it — the file is already saved; a thumbnail is a bonus.
        if (created?.id) {
          await applyCover(created.id);
          // Skip the render when the user supplied their own cover — it would
          // be discarded anyway (generateFor returns early on a set path).
          if (!coverUri) void queueThumbnail(created.id);
        }
      } else {
        const { data: createdLink } = await supabase.from('file_entries').insert({
          business_id: businessId, category_id: categoryId, folder_id: folderId, title: title.trim() || url.trim(),
          kind: 'link', url: url.trim(), crew_visible: crewVisibleValue, created_by: userId,
        }).select('id').single();
        if (createdLink?.id) await applyCover(createdLink.id);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const VIS: Array<{ key: 'inherit' | 'team' | 'office'; label: string }> = [
    { key: 'inherit', label: t.visInherit },
    { key: 'team', label: t.crewBadge },
    { key: 'office', label: t.officeOnlyBadge },
  ];

  const moveAtHome = crumb.categoryId === null;
  // Exclude every selected folder + its whole subtree from the destination
  // picker so you can't drop a folder into itself or one of its children.
  const excludedFolderIds = useMemo(() => {
    const out = new Set<string>();
    const seeds = Array.from(selectedFolderIds);
    let frontier = seeds;
    seeds.forEach(id => out.add(id));
    while (frontier.length) {
      const next = folders.filter(f => f.parent_folder_id && frontier.includes(f.parent_folder_id) && !out.has(f.id));
      next.forEach(f => out.add(f.id));
      frontier = next.map(f => f.id);
    }
    return out;
  }, [selectedFolderIds, folders]);
  const moveSubFolders = moveAtHome
    ? []
    : folders.filter(f =>
        f.category_id === crumb.categoryId &&
        f.parent_folder_id === crumb.folderId &&
        !excludedFolderIds.has(f.id),
      );
  // Move the whole selection (files + folders) to the chosen destination.
  const onDoMove = (target: { categoryId: string; folderId: string | null }) => onMove(target);

  return (
    <RNModal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* KeyboardAvoidingView so the folder-name field isn't buried under the
          keyboard — the sheet sits at the bottom, which is exactly where the
          keyboard opens. Backdrop is an absolute FIRST child and the card a
          plain sibling, per the sheet contract in CLAUDE.md; nesting the card
          inside the backdrop Pressable (with a no-op onPress to swallow taps)
          is what breaks ScrollView dragging in these sheets. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <Pressable
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
        />
        <View className="bg-card rounded-t-3xl px-4 pb-8 pt-4">
          <View className="items-center mb-3"><View className="w-10 h-1 bg-border rounded-full" /></View>

          {/* Actions chooser */}
          {sheet.type === 'actions' ? (
            <View className="gap-1 pb-2">
              <Pressable onPress={() => onPick({ type: 'folder', editing: null })} className="flex-row items-center gap-3 px-3 py-4 rounded-2xl active:bg-surface">
                <FolderPlus size={20} color={c.primary} />
                <Text className="text-base font-semibold text-ink">{t.newFolder}</Text>
              </Pressable>
              {!atHome ? (
                <Pressable onPress={() => onPick({ type: 'file', editing: null })} className="flex-row items-center gap-3 px-3 py-4 rounded-2xl active:bg-surface">
                  <FilePlus2 size={20} color={c.primary} />
                  <Text className="text-base font-semibold text-ink">{t.addEntry}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Folder form */}
          {sheet.type === 'folder' ? (
            <View className="gap-4">
              <Text className="text-lg font-bold text-ink px-1">{folderEditing ? tc.buttons.edit : t.newFolder}</Text>
              <Input label={t.folderNameLabel} placeholder={t.folderNamePlaceholder} value={fname} onChangeText={setFname} />
              {/* Folder picture. Always hand-picked — a folder has no contents
                  to render a preview from. */}
              <View>
                <Text className="text-sm font-medium text-ink mb-1.5">{t.coverLabel}</Text>
                {/* One tile — the image with a corner remove, or a dashed
                    add target. Tapping opens the camera/library/paste chooser,
                    same as job photos. */}
                {fCoverUri || (fCoverSigned && !fCoverRemoved) ? (
                  <View className="flex-row items-start gap-3">
                    <CoverEditor
                      uri={(fCoverUri ?? fCoverSigned) as string}
                      transform={fCoverTf}
                      onChange={setFCoverTf}
                      width={104}
                      height={104}
                      kind="photo"
                      rotateLabel="90°"
                      removeLabel={t.coverRemove}
                      onRemove={() => { setFCoverUri(null); setFCoverRemoved(true); }}
                    />
                    <Pressable
                      onPress={() => openCoverPicker('folder')}
                      className="px-3 py-2 rounded-xl border border-border bg-card active:opacity-80"
                    >
                      <Text className="text-xs font-semibold text-ink">{t.coverChange}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => openCoverPicker('folder')}
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-border items-center justify-center active:opacity-70"
                  >
                    <ImagePlus size={22} color={c.faint} />
                    <Text className="text-[11px] font-medium text-faint mt-1.5">{t.coverAdd}</Text>
                  </Pressable>
                )}
                <Text className="text-xs text-faint mt-2">{t.folderCoverNote}</Text>
              </View>

              {isCategory ? (
                <View className="flex-row items-center justify-between rounded-2xl border border-border px-4 py-3">
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-medium text-ink">{t.crewVisibleLabel}</Text>
                    <Text className="text-xs text-faint">{t.crewVisibleHint}</Text>
                  </View>
                  <Toggle value={crewVisible} onValueChange={setCrewVisible} />
                </View>
              ) : null}
              <Button onPress={saveFolder} loading={saving} fullWidth>{tc.buttons.save}</Button>
            </View>
          ) : null}

          {/* File form */}
          {sheet.type === 'file' ? (
            <View className="gap-4">
              <Text className="text-lg font-bold text-ink px-1">{fileEditing ? tc.buttons.edit : t.addEntry}</Text>
              {!fileEditing ? (
                <View className="flex-row p-1 rounded-2xl bg-border-soft">
                  {(['file', 'link'] as const).map(k => (
                    <Pressable key={k} onPress={() => setKind(k)} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${kind === k ? 'bg-card' : ''}`}>
                      {k === 'file' ? <Upload size={14} color={kind === k ? c.primary : c.muted} /> : <Link2 size={14} color={kind === k ? c.primary : c.muted} />}
                      <Text className={`text-sm font-semibold ${kind === k ? 'text-primary' : 'text-muted'}`}>{k === 'file' ? t.kindFile : t.kindLink}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Input label={t.entryTitleLabel} placeholder={t.entryTitlePlaceholder} value={title} onChangeText={setTitle} />

              {/* Cover image. Offered for links AND files: a link never gets
                  one automatically, and a file's generated page 1 is sometimes
                  not the page worth showing. */}
              <View>
                <Text className="text-sm font-medium text-ink mb-1.5">{t.coverLabel}</Text>
                {/* 3:4 tile — a document cover is portrait. Tapping opens the
                    camera/library/paste chooser, same as job photos. */}
                {coverUri || (coverSignedUrl && !coverRemoved) ? (
                  <View className="flex-row items-start gap-3">
                    <CoverEditor
                      uri={(coverUri ?? coverSignedUrl) as string}
                      transform={coverTf}
                      onChange={setCoverTf}
                      width={104}
                      height={139}
                      kind="document"
                      rotateLabel="90°"
                      removeLabel={t.coverRemove}
                      onRemove={() => { setCoverUri(null); setCoverRemoved(true); }}
                    />
                    <Pressable
                      onPress={() => openCoverPicker('entry')}
                      className="px-3 py-2 rounded-xl border border-border bg-card active:opacity-80"
                    >
                      <Text className="text-xs font-semibold text-ink">{t.coverChange}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => openCoverPicker('entry')}
                    className="w-24 rounded-xl border-2 border-dashed border-border items-center justify-center active:opacity-70"
                    style={{ height: 128 }}
                  >
                    <ImagePlus size={22} color={c.faint} />
                    <Text className="text-[11px] font-medium text-faint mt-1.5">{t.coverAdd}</Text>
                  </Pressable>
                )}
                <Text className="text-xs text-faint mt-2">
                  {(fileEditing?.kind ?? kind) === 'link' ? t.coverLinkNote : t.coverFileNote}
                </Text>
              </View>
              {!fileEditing && kind === 'file' ? (
                <Pressable onPress={pickFile} className="flex-row items-center gap-3 px-4 py-3.5 rounded-2xl border border-dashed border-border">
                  <Upload size={18} color={c.faint} />
                  <Text className="text-sm text-muted flex-1" numberOfLines={1}>{picked ? picked.name : t.chooseFile}</Text>
                </Pressable>
              ) : (fileEditing?.kind === 'link' || (!fileEditing && kind === 'link')) ? (
                <Input label={t.linkUrlLabel} placeholder={t.linkUrlPlaceholder} value={url} onChangeText={setUrl} autoCapitalize="none" />
              ) : null}

              {/* Per-file visibility override */}
              <View>
                <Text className="text-sm font-medium text-ink mb-1.5">{t.visibilityLabel}</Text>
                <View className="flex-row p-1 rounded-2xl bg-border-soft">
                  {VIS.map(v => (
                    <Pressable key={v.key} onPress={() => setVis(v.key)} className={`flex-1 rounded-xl py-2 items-center ${vis === v.key ? 'bg-card' : ''}`}>
                      <Text className={`text-xs font-semibold ${vis === v.key ? 'text-primary' : 'text-muted'}`}>{v.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
              <Button onPress={saveFile} loading={saving} fullWidth>{saving && kind === 'file' && !fileEditing ? t.uploading : tc.buttons.save}</Button>
            </View>
          ) : null}

          {/* Move picker — tap a folder to drop the item straight into it;
             use the › chevron to open a folder and pick a nested destination.
             The bottom button moves into the current breadcrumb level. */}
          {sheet.type === 'move' ? (
            <View className="gap-3">
              <Text className="text-lg font-bold text-ink px-1">
                {t.moveTitle}
              </Text>
              <Text className="text-xs text-faint px-1 -mt-1">{t.moveHint}</Text>
              {/* Current location + an up control to climb out of the folder. */}
              <View className="flex-row items-center gap-2">
                {!moveAtHome ? (
                  <Pressable onPress={goUpInMove} hitSlop={6} className="w-8 h-8 rounded-lg bg-border-soft items-center justify-center active:bg-border">
                    <ChevronLeft size={16} color={c.muted} />
                  </Pressable>
                ) : null}
                <Folder size={15} color={c.primary} />
                <Text className="text-sm font-semibold text-ink flex-1" numberOfLines={1}>
                  {moveAtHome ? t.title : crumb.label}
                </Text>
              </View>
              <ScrollView className="max-h-72" contentContainerClassName="gap-1.5">
                {moveAtHome
                  ? categories.map(cat => (
                      <View key={cat.id} className="flex-row items-center rounded-xl border border-border-soft">
                        <Pressable onPress={() => onDoMove({ categoryId: cat.id, folderId: null })} className="flex-row items-center gap-2 px-3 py-3 flex-1">
                          <Folder size={15} color={c.primary} /><Text className="text-sm text-ink flex-1" numberOfLines={1}>{cat.name}</Text>
                        </Pressable>
                        <Pressable onPress={() => setCrumb({ categoryId: cat.id, folderId: null, label: cat.name })} hitSlop={6} className="px-3 py-3 border-l border-border-soft">
                          <ChevronRight size={16} color={c.faint} />
                        </Pressable>
                      </View>
                    ))
                  : moveSubFolders.map(f => (
                      <View key={f.id} className="flex-row items-center rounded-xl border border-border-soft">
                        <Pressable onPress={() => onDoMove({ categoryId: f.category_id, folderId: f.id })} className="flex-row items-center gap-2 px-3 py-3 flex-1">
                          <Folder size={15} color={c.primary} /><Text className="text-sm text-ink flex-1" numberOfLines={1}>{f.name}</Text>
                        </Pressable>
                        <Pressable onPress={() => setCrumb({ categoryId: f.category_id, folderId: f.id, label: f.name })} hitSlop={6} className="px-3 py-3 border-l border-border-soft">
                          <ChevronRight size={16} color={c.faint} />
                        </Pressable>
                      </View>
                    ))}
                {!moveAtHome && moveSubFolders.length === 0 ? <Text className="text-xs text-faint px-1 py-2">{t.emptyFolder}</Text> : null}
              </ScrollView>
              <Button
                onPress={() => crumb.categoryId && onDoMove({ categoryId: crumb.categoryId, folderId: crumb.folderId })}
                disabled={moveAtHome}
                fullWidth
              >
                {`${t.moveHere} (${selectedCount})`}
              </Button>
            </View>
          ) : null}
        </View>

        {/* Cover source chooser. An in-sheet absolute overlay, NOT a second
            RNModal — iOS silently refuses to present one while another is
            visible, so the button would just look dead (see CLAUDE.md).
            Paste only appears when the clipboard actually holds an image,
            matching the job-photos picker. */}
        {coverPickerFor ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}>
            <Pressable
              onPress={() => setCoverPickerFor(null)}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
            />
            <View className="bg-card rounded-t-3xl px-4 pb-8 pt-4">
              <View className="items-center mb-3"><View className="w-10 h-1 bg-border rounded-full" /></View>
              <View className="bg-surface rounded-2xl overflow-hidden">
                <Pressable
                  onPress={() => { void pickCoverFrom('camera'); }}
                  className="flex-row items-center gap-4 px-5 py-5 active:bg-border-soft border-b border-border-soft"
                >
                  <Camera size={24} color={c.primary} />
                  <Text className="text-lg font-semibold text-ink">{tPhotos.takePhoto}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { void pickCoverFrom('library'); }}
                  className={`flex-row items-center gap-4 px-5 py-5 active:bg-border-soft${canPasteCover ? ' border-b border-border-soft' : ''}`}
                >
                  <ImagePlus size={24} color={c.primary} />
                  <Text className="text-lg font-semibold text-ink">{tPhotos.chooseFromLibrary}</Text>
                </Pressable>
                {canPasteCover ? (
                  <Pressable
                    onPress={() => { void pickCoverFrom('paste'); }}
                    className="flex-row items-center gap-4 px-5 py-5 active:bg-border-soft"
                  >
                    <ClipboardPaste size={24} color={c.primary} />
                    <Text className="text-lg font-semibold text-ink">{tPhotos.pastePhoto}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                onPress={() => setCoverPickerFor(null)}
                className="mt-3 items-center py-4 rounded-2xl bg-border-soft active:bg-border"
              >
                <Text className="text-lg font-semibold text-ink">{tc.buttons.cancel}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </RNModal>
  );
}


/**
 * Cover preview you can drag to re-frame and rotate. The image is never
 * modified — the framing is stored beside it (migration 216) and applied at
 * render, so it stays adjustable and the original is kept.
 *
 * Dragging moves the FOCAL POINT, inverted, so the gesture reads the right way
 * round: drag downward and what was below comes into view.
 */
function CoverEditor({ uri, transform, onChange, width, height, kind, onRemove, rotateLabel, removeLabel }: {
  uri: string;
  transform: CoverTransform;
  onChange: (t: CoverTransform) => void;
  width: number;
  height: number;
  kind: 'document' | 'photo';
  onRemove: () => void;
  rotateLabel: string;
  removeLabel: string;
}) {
  const c = useThemeColors();
  const move = (lx: number, ly: number) => {
    const x = 1 - Math.min(1, Math.max(0, lx / width));
    const y = 1 - Math.min(1, Math.max(0, ly / height));
    onChange({ ...transform, x, y });
  };
  return (
    <View>
      <View
        style={{ width, height, borderRadius: 12, overflow: 'hidden' }}
        // Responder rather than Pressable: we want the continuous drag, and a
        // Pressable would only report the final tap.
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => move(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        onResponderMove={(e) => move(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      >
        <FramedCover uri={uri} transform={transform} width={width} height={height} kind={kind} />
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityLabel={removeLabel}
          className="absolute top-1 right-1 w-6 h-6 rounded-full items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <X size={13} color="#FFFFFF" />
        </Pressable>
      </View>
      <Pressable
        onPress={() => onChange(rotateCover(transform))}
        className="flex-row items-center gap-1.5 mt-1.5 px-2.5 py-1.5 rounded-lg border border-border self-start active:opacity-70"
      >
        <RotateCw size={13} color={c.muted} />
        <Text className="text-xs font-semibold text-muted">{rotateLabel}</Text>
      </Pressable>
    </View>
  );
}

/**
 * A cover image framed inside a fixed box (migration 216).
 *
 * React Native has no object-position, so the maths is explicit: measure the
 * image, scale it to cover the box, then offset by the focal point. Rotation is
 * applied to an inner Image whose dimensions are the unrotated ones — rotating
 * about the centre then lands it exactly on the outer box.
 *
 * Until the size resolves it falls back to plain `cover`, so the picture always
 * appears immediately and only nudges into its framing a moment later.
 */
function FramedCover({ uri, transform, width, height, kind }: {
  uri: string;
  transform: unknown;
  width: number;
  height: number;
  kind: 'document' | 'photo';
}) {
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDim(null);
    Image.getSize(uri, (w, h) => { if (!cancelled) setDim({ w, h }); }, () => {});
    return () => { cancelled = true; };
  }, [uri]);

  const t = coverTransform(transform, kind);
  if (!dim || dim.w <= 0 || dim.h <= 0) {
    return <Image source={{ uri }} style={{ width, height }} resizeMode="cover" />;
  }

  const swap = t.rot === 90 || t.rot === 270;
  // Footprint the rotated image occupies, before scaling.
  const sw = swap ? dim.h : dim.w;
  const sh = swap ? dim.w : dim.h;
  const scale = Math.max(width / sw, height / sh);   // cover, never letterbox
  const dw = sw * scale;
  const dh = sh * scale;

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          left: -(dw - width) * t.x,
          top: -(dh - height) * t.y,
          width: dw,
          height: dh,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={{ uri }}
          style={{
            width: dim.w * scale,
            height: dim.h * scale,
            transform: [{ rotate: `${t.rot}deg` }],
          }}
          resizeMode="stretch"
        />
      </View>
    </View>
  );
}

/** A stored image resolved to a signed URL. Used for folder covers, which are
 *  always hand-picked — a folder has no contents to render a preview from. */
function CoverImage({ path, transform, size = 44 }: {
  path: string;
  /** Raw cover_transform from the row (migration 216). */
  transform?: unknown;
  /** Box edge in px — FramedCover needs real numbers to do the cover maths. */
  size?: number;
}) {
  const supabase = createSupabaseClient();
  const c = useThemeColors();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    void signedUrl(supabase, path).then(u => { if (!cancelled) setSrc(u); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  if (!src) return <Folder size={Math.min(44, size)} color={c.primary} />;
  return <FramedCover uri={src} transform={transform} width={size} height={size} kind="photo" />;
}

/** Folder as a grid tile. Same footprint as a file card so the two line up in
 *  one grid — a folder-only view has to visibly change when you flip the
 *  toggle, or the control reads as broken. */
function FolderTile({ name, count, onOpen, selected, selectionMode, onToggleSelect, canManage, coverPath, coverTf }: {
  name: string; count: number; onOpen: () => void;
  selected?: boolean; selectionMode?: boolean; onToggleSelect?: () => void; canManage: boolean;
  /** Hand-picked folder picture (migration 214); null falls back to the icon. */
  coverPath?: string | null;
  /** Its framing (migration 216). */
  coverTf?: unknown;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.files;
  const c = useThemeColors();
  const countLabel = count === 0 ? t.itemsEmpty : count === 1 ? t.itemsOne : t.itemsMany.replace('{{count}}', String(count));
  return (
    <Pressable
      onPress={() => (canManage && selectionMode && onToggleSelect ? onToggleSelect() : onOpen())}
      onLongPress={canManage && onToggleSelect ? onToggleSelect : undefined}
      delayLongPress={250}
      className={`rounded-xl border overflow-hidden ${selected ? 'border-primary bg-primary/5' : 'border-border-soft bg-card'}`}
    >
      <View style={{ height: 150 }} className="w-full items-center justify-center overflow-hidden bg-primary/5 border-b border-border-soft">
        {coverPath ? <CoverImage path={coverPath} transform={coverTf} size={150} /> : <Folder size={44} color={c.primary} />}
      </View>
      <View className="px-2.5 py-2">
        <Text className="text-xs font-medium text-ink" numberOfLines={1}>{name}</Text>
        <Text className="text-[11px] text-faint" numberOfLines={1}>{countLabel}</Text>
      </View>
      {canManage && selectionMode ? (
        <View className={`absolute top-2 left-2 w-5 h-5 rounded border items-center justify-center ${selected ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
          {selected ? <Check size={12} color="#FFFFFF" /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Cached first-page preview. `thumbnail_path` is produced once by the API
 * (migration 212) and stored in the private bucket, so this only resolves a
 * signed URL — no PDF is ever rendered on the phone.
 *
 * Falls back to the type icon when there is no preview: a link, a format that
 * cannot be rasterized, or a render that has not run yet.
 */
function FileThumb({ entry, size, width }: { entry: FileEntry; size: number; width: number }) {
  const supabase = createSupabaseClient();
  const c = useThemeColors();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    if (!entry.thumbnail_path) return;
    void signedUrl(supabase, entry.thumbnail_path).then(u => { if (!cancelled) setSrc(u); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.thumbnail_path]);

  if (src) {
    // Framing comes from the row (migration 216); a document defaults to the
    // top edge, since a cover page's masthead is the useful part.
    return <FramedCover uri={src} transform={entry.cover_transform} width={width} height={size} kind="document" />;
  }
  return (
    <View style={{ height: size }} className="w-full items-center justify-center bg-surface">
      {entry.kind === 'link' ? <Link2 size={24} color={c.faint} /> : <FileText size={24} color={c.faint} />}
    </View>
  );
}
