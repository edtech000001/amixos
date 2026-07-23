// Files module screen (mobile). Google-Drive-style nested folders: top-level
// folders (file_categories, carrying the Team/Office visibility default)
// contain arbitrarily-nested folders (file_folders); files live at any level.
// Navigate one level at a time; files can override their own visibility.
// One-hand conventions: FAB + bottom-sheet forms (fade), save at the bottom.

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, Alert, Linking,
  Modal as RNModal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {
  ChevronLeft, ChevronRight, FileText, Folder, FolderOpen, FolderPlus,
  FilePlus2, Link2, Trash2, Pencil, ExternalLink, Upload, Lock,
  Users as UsersIcon, Check, X, FolderInput, Plus,
} from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useLang } from '@/lib/i18n/LangProvider';
import { Input, Toggle, Button, Fab } from '@amixos/shared/ui';
import { can } from '@amixos/shared/lib/permissions';
import {
  fetchFilesTree, fileStoragePath, fileUid, fileMeta, fileIsCrewVisible,
  FILES_BUCKET, FILE_MAX_BYTES,
  type FileCategory, type FileFolder, type FileEntry, type FileEntryKind,
} from '@amixos/shared/lib/files';
import { signedUrl } from '@amixos/shared/lib/storageUrls';
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
  const [sheet, setSheet] = useState<Sheet>(null);
  const clearSelection = () => { setSelectedEntries(new Set()); setSelectedFolders(new Set()); };
  const selectionCount = selectedEntries.size + selectedFolders.size;
  // Selection UI (checkboxes) only appears once something is selected — entered
  // by long-pressing a row. Until then rows behave normally (tap = open/enter).
  const selectionMode = selectionCount > 0;

  const load = useCallback(async () => {
    if (!business) return;
    const tree = await fetchFilesTree(supabase, business.id);
    setCategories(tree.categories);
    setFolders(tree.folders);
    setEntries(tree.entries);
    setLoading(false);
    // Refresh storage usage alongside the tree (after uploads/deletes too).
    const { data } = await supabase.rpc('business_storage_bytes', { p_business_id: business.id });
    setUsedBytes(Number(data ?? 0));
    // Breakdown (jobs vs library vs equipment) — best-effort: the RPC is
    // migration 149; if it isn't run yet the meter just shows the total.
    const { data: bd } = await supabase.rpc('business_storage_breakdown', { p_business_id: business.id });
    if (bd && typeof bd === 'object') setBreakdown(bd as Record<string, number>);
  }, [business?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

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

  const goBack = () => {
    if (stack.length > 1) { setStack(s => s.slice(0, -1)); clearSelection(); }
    else router.back();
  };
  const enterCategory = (c: FileCategory) => setStack(s => [...s, { categoryId: c.id, folderId: null, label: c.name }]);
  const enterFolder = (f: FileFolder) => setStack(s => [...s, { categoryId: f.category_id, folderId: f.id, label: f.name }]);

  const toggleEntry = (id: string) =>
    setSelectedEntries(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleFolder = (id: string) =>
    setSelectedFolders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
      </View>

      {/* Breadcrumb (depth > 1). A plain flex-row View — NOT a horizontal
         ScrollView, which stretches vertically in a flex column and left a
         huge gap under the header. flex-wrap handles deep paths. */}
      {stack.length > 1 ? (
        <View className="flex-row flex-wrap items-center gap-1 px-4 py-2.5 border-b border-border-soft">
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
          <Pressable onPress={clearSelection} hitSlop={8}><X size={16} color={c.primary} /></Pressable>
          <Text className="text-sm font-medium text-primary flex-1">{t.selectedCount.replace('{{count}}', String(selectionCount))}</Text>
          <Pressable onPress={() => setSheet({ type: 'move' })} className="flex-row items-center gap-1.5 bg-primary px-3.5 py-1.5 rounded-full active:opacity-80">
            <FolderInput size={14} color="#FFFFFF" /><Text className="text-xs font-semibold text-white">{t.moveBtn}</Text>
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
          <View className="py-20 items-center"><ActivityIndicator color={c.primary} /></View>
        ) : isEmpty ? (
          <View className="py-16 items-center rounded-2xl border border-dashed border-border bg-surface">
            <FolderOpen size={30} color={c.faint} />
            <Text className="text-sm font-medium text-muted mt-3">{atHome ? t.empty : t.emptyFolder}</Text>
            {!canManage && atHome ? <Text className="text-xs text-faint mt-1 px-8 text-center">{t.emptyHint}</Text> : null}
          </View>
        ) : (
          <View className="gap-2">
            {/* Top-level folders (home) */}
            {atHome ? categories.map(c => (
              <FolderRow key={c.id} name={c.name} count={folderItemCount(c.id, null)}
                badge={c.crew_visible ? { label: t.crewBadge, team: true } : { label: t.officeOnlyBadge, team: false }}
                onOpen={() => enterCategory(c)} canManage={canManage}
                onEdit={() => setSheet({ type: 'folder', editing: c })}
                onDelete={() => confirmDelete(t.deleteFolderConfirm, async () => { await supabase.from('file_categories').delete().eq('id', c.id); })}
              />
            )) : null}

            {/* Subfolders — selectable, so they can be moved with files in bulk */}
            {childFolders.map(f => (
              <FolderRow key={f.id} name={f.name} count={folderItemCount(f.category_id, f.id)}
                onOpen={() => enterFolder(f)} canManage={canManage}
                selected={selectedFolders.has(f.id)} selectionMode={selectionMode}
                onToggleSelect={() => toggleFolder(f.id)}
                onEdit={() => setSheet({ type: 'folder', editing: f })}
                onDelete={() => confirmDelete(t.deleteFolderConfirm, async () => { await supabase.from('file_folders').delete().eq('id', f.id); })}
              />
            ))}

            {/* Files */}
            {childEntries.map(e => {
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
                  {!selectionMode ? (
                    <>
                      <Pressable onPress={() => openEntry(e)} hitSlop={6} className="p-1.5"><ExternalLink size={15} color={c.faint} /></Pressable>
                      {canManage ? (
                        <>
                          <Pressable onPress={() => setSheet({ type: 'file', editing: e })} hitSlop={6} className="p-1.5"><Pencil size={14} color={c.muted} /></Pressable>
                          <Pressable onPress={() => confirmDelete(t.deleteEntryConfirm, async () => { await supabase.from('file_entries').delete().eq('id', e.id); })} hitSlop={6} className="p-1.5"><Trash2 size={14} color={c.danger} /></Pressable>
                        </>
                      ) : null}
                    </>
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

function FolderRow({ name, count, badge, onOpen, canManage, onEdit, onDelete, selected, selectionMode, onToggleSelect }: {
  name: string; count?: number; badge?: { label: string; team: boolean }; onOpen: () => void;
  canManage: boolean; onEdit: () => void; onDelete: () => void;
  // Subfolders are selectable (long-press → checkbox) so they can be
  // bulk-moved with files. Top-level categories omit these.
  selected?: boolean; selectionMode?: boolean; onToggleSelect?: () => void;
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
        <View className="w-9 h-9 rounded-lg bg-primary/10 items-center justify-center">
          <Folder size={17} color={c.primary} />
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
      {!inSelect && canManage ? (
        <View className="flex-row items-center">
          <Pressable onPress={onEdit} hitSlop={6} className="p-1.5"><Pencil size={14} color={c.muted} /></Pressable>
          <Pressable onPress={onDelete} hitSlop={6} className="p-1.5"><Trash2 size={14} color={c.danger} /></Pressable>
        </View>
      ) : null}
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
  const c = useThemeColors();

  // Folder form state
  const folderEditing = sheet.type === 'folder' ? sheet.editing : null;
  const isCategory = folderEditing ? !('category_id' in folderEditing) : atHome;
  const [fname, setFname] = useState(folderEditing?.name ?? '');
  const [crewVisible, setCrewVisible] = useState(
    folderEditing && !('category_id' in folderEditing) ? (folderEditing as FileCategory).crew_visible : true,
  );

  // File form state
  const fileEditing = sheet.type === 'file' ? sheet.editing : null;
  const [kind, setKind] = useState<FileEntryKind>(fileEditing?.kind ?? 'file');
  const [title, setTitle] = useState(fileEditing?.title ?? '');
  const [url, setUrl] = useState(fileEditing?.url ?? '');
  const [vis, setVis] = useState<'inherit' | 'team' | 'office'>(
    fileEditing == null || fileEditing.crew_visible == null ? 'inherit' : fileEditing.crew_visible ? 'team' : 'office',
  );
  const [picked, setPicked] = useState<{ uri: string; name: string; size: number; mimeType: string | null } | null>(null);

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
      if (folderEditing) await supabase.from('file_categories').update({ name: fname.trim(), crew_visible: crewVisible }).eq('id', folderEditing.id);
      else await supabase.from('file_categories').insert({ business_id: businessId, name: fname.trim(), crew_visible: crewVisible, created_by: userId });
    } else {
      if (folderEditing) await supabase.from('file_folders').update({ name: fname.trim() }).eq('id', folderEditing.id);
      else await supabase.from('file_folders').insert({ business_id: businessId, category_id: categoryId, parent_folder_id: folderId, name: fname.trim(), created_by: userId });
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
        await supabase.from('file_entries').insert({
          business_id: businessId, category_id: categoryId, folder_id: folderId, title: title.trim() || picked.name,
          kind: 'file', storage_path: path, file_name: picked.name, file_size: picked.size, mime_type: picked.mimeType,
          crew_visible: crewVisibleValue, created_by: userId,
        });
      } else {
        await supabase.from('file_entries').insert({
          business_id: businessId, category_id: categoryId, folder_id: folderId, title: title.trim() || url.trim(),
          kind: 'link', url: url.trim(), crew_visible: crewVisibleValue, created_by: userId,
        });
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
      <Pressable onPress={onClose} className="flex-1 justify-end bg-black/40">
        <Pressable onPress={() => {}} className="bg-card rounded-t-3xl px-4 pb-8 pt-4">
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
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
