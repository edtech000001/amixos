'use client';

// Files module — web. Google-Drive-style nested folders. Top-level folders
// (file_categories, which carry the Team/Office visibility default) contain
// arbitrarily-nested folders (file_folders); files live at any level. Navigate
// one level at a time with a breadcrumb. Files can override their own
// visibility. Lazy-loaded from /dashboard/modulos/files.

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCachedThenFresh, writeCacheAndStamp } from '@amixos/shared/lib/swrCache';
import { useDataFingerprint } from '@amixos/shared/lib/dataFingerprint';
import { SkeletonList } from '@amixos/shared/ui/Skeleton';
import {
  FolderOpen, FolderPlus, FilePlus2, Folder, ChevronRight, ChevronLeft, FileText, Link2,
  LayoutGrid, List as ListIcon, ImagePlus, ListChecks,
  Trash2, Pencil, ExternalLink, Upload, Lock, Users, Check, FolderInput, X, Home,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { can } from '@amixos/shared/lib/permissions';
import { confirm } from '@amixos/shared/ui/confirmBus';
import {
  fetchFilesTree, fileStoragePath, fileUid, fileMeta, fileIsCrewVisible,
  type FilesTree,
  FILES_BUCKET, FILE_MAX_BYTES, requestThumbnail, backfillThumbnails,
  coverStoragePath, downscaleImage,
  type FileCategory, type FileFolder, type FileEntry, type FileEntryKind,
} from '@amixos/shared/lib/files';
import { signedUrl } from '@amixos/shared/lib/storageUrls';
import { kvGet, kvSet } from '@amixos/shared/lib/kvStore';
import { usePasteImage } from '@/lib/usePasteImage';
import { PasteHint } from '@/components/ui/PasteHint';

/**
 * Fire-and-forget thumbnail request. Resolves the caller's JWT and the API base
 * URL, then asks the service to render page 1. Deliberately swallows every
 * failure: the API may not be reachable (offline, not deployed) and that must
 * not surface as an upload error.
 */
async function queueThumbnail(supabase: ReturnType<typeof createSupabaseClient>, entryId: string): Promise<void> {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (!base) return;
    const { data } = await supabase.auth.getSession();
    const jwt = data.session?.access_token;
    if (!jwt) return;
    await requestThumbnail(base, jwt, entryId);
  } catch {
    /* thumbnails are best-effort */
  }
}

/** Device-level display preference, shared by web and mobile. */
const FILES_VIEW_KEY = 'amixos_files_view_mode';
import {
  storageLimitBytes, wouldExceedStorage, storagePercent, formatBytes,
} from '@amixos/shared/lib/storageLimits';
import type { SubscriptionInfo } from '@amixos/shared/lib/subscription';
import { Tooltip } from '@amixos/shared/ui/Tooltip';

// A breadcrumb crumb identifies a location: categoryId null = home (list of
// top-level folders); folderId null = at a top-level folder's root.
interface Crumb { categoryId: string | null; folderId: string | null; label: string }

export default function FilesModule() {
  const supabase = createSupabaseClient();
  // List vs grid, remembered per device (a display preference, not data).
  // Starts as 'list' and swaps in the stored value once read.
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
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
  const es = locale === 'es';
  const canManage = can.manageFiles(currentRole);

  const subInfo: SubscriptionInfo | null = business ? {
    plan: business.plan,
    subscription_status: business.subscription_status,
    trial_ends_at: business.trial_ends_at,
    current_period_end: business.current_period_end,
  } : null;
  const limitBytes = subInfo ? storageLimitBytes(subInfo) : null;
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  const [breakdown, setBreakdown] = useState<Record<string, number> | null>(null);
  const loadUsage = async () => {
    if (!business) return;
    const { data } = await supabase.rpc('business_storage_bytes', { p_business_id: business.id });
    setUsedBytes(Number(data ?? 0));
    // Breakdown (jobs vs library vs equipment) — best-effort: the RPC is
    // migration 149; if it isn't run yet the meter just shows the total.
    const { data: bd } = await supabase.rpc('business_storage_breakdown', { p_business_id: business.id });
    if (bd && typeof bd === 'object') setBreakdown(bd as Record<string, number>);
  };

  const [categories, setCategories] = useState<FileCategory[]>([]);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stack, setStack] = useState<Crumb[]>([{ categoryId: null, folderId: null, label: '' }]);
  // Selection spans files AND folders so one Move button relocates everything.
  // Checkboxes only appear once something is selected (entered via long-press).
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  // Top-level folders live in a different table, so they need their own set.
  // They are selectable purely so they remain editable: edit/delete moved into
  // the selection bar, and without this a category would have no edit path.
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  const [folderModal, setFolderModal] = useState<{ editing: FileCategory | FileFolder | null } | null>(null);
  const [fileModal, setFileModal] = useState<{ editing: FileEntry | null } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  // The library changes rarely, so it's cache-first: the saved tree paints
  // immediately and the query only re-runs when data_fingerprint reports a
  // change to entries, folders or categories (migration 208).
  const cacheKey = business ? `files_tree_${business.id}` : null;
  const fingerprint = useDataFingerprint(supabase, business?.id, ['files']);

  const applyTree = (tree: FilesTree) => {
    setCategories(tree.categories);
    setFolders(tree.folders);
    setEntries(tree.entries);
    setLoading(false);
  };

  // Full refetch — what every mutation calls. Re-stamps so the next open is
  // instant. Stamp read BEFORE the fetch (see writeCacheAndStamp).
  const load = async () => {
    if (!business) return;
    const stamp = fingerprint ? await fingerprint().catch(() => null) : null;
    const tree = await fetchFilesTree(supabase, business.id);
    applyTree(tree);
    if (cacheKey) void writeCacheAndStamp(cacheKey, tree, stamp);
    void loadUsage();
  };

  useEffect(() => {
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
    // Always refreshed: the meter is component state, so a cache hit would
    // otherwise render 0 bytes until the next write.
    void loadUsage();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  // Drain the thumbnail backlog while the grid is open — which is exactly when
  // previews matter and when the user is already looking at the result. Avoids
  // a "generate previews" button nobody would know to press, and files
  // uploaded before thumbnails existed fill in over a visit or two.
  //
  // Bounded per mount so this can never become an open-ended loop: batches of
  // 10, at most MAX_SWEEPS of them, stopping early once the queue is empty. The
  // API is idempotent, so two people browsing at once just no-op each other.
  const sweptRef = useRef(false);
  useEffect(() => {
    if (viewMode !== 'grid' || !business || sweptRef.current) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL;
    if (!apiBase) return;
    if (!entries.some(e => e.kind === 'file' && !e.thumbnail_path)) return;
    sweptRef.current = true;

    let cancelled = false;
    void (async () => {
      const MAX_SWEEPS = 6;
      const { data } = await supabase.auth.getSession();
      const jwt = data.session?.access_token;
      if (!jwt) return;
      for (let i = 0; i < MAX_SWEEPS && !cancelled; i++) {
        const res = await backfillThumbnails(apiBase, jwt, business.id, 10);
        if (!res) return;            // API unreachable — leave icons, try next visit
        if (res.ready > 0) await load(); // show what just landed
        if (res.remaining === 0) return;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, business?.id, entries.length]);

  const here = stack[stack.length - 1];
  const atHome = here.categoryId === null;
  const category = useMemo(() => categories.find(c => c.id === here.categoryId) ?? null, [categories, here.categoryId]);

  // Folder cards to show at this level: top-level folders at home, else
  // subfolders of the current folder within the current category.
  const childFolders = useMemo(() => {
    if (atHome) return [];
    return folders.filter(f => f.category_id === here.categoryId && f.parent_folder_id === here.folderId);
  }, [folders, atHome, here.categoryId, here.folderId]);

  const childEntries = useMemo(() => {
    if (atHome) return [];
    return entries.filter(e => e.category_id === here.categoryId && e.folder_id === here.folderId);
  }, [entries, atHome, here.categoryId, here.folderId]);

  // Web enters selection mode explicitly via the "Mover" button (long-press
  // isn't discoverable with a mouse). It also turns on if something is selected
  // by other means.
  const [selectMode, setSelectMode] = useState(false);
  const clearSelection = () => {
    setSelectedEntries(new Set());
    setSelectedFolders(new Set());
    setSelectedCategories(new Set());
    setSelectMode(false);
  };
  const selectionCount = selectedEntries.size + selectedFolders.size + selectedCategories.size;
  const selectionMode = selectMode || selectionCount > 0;
  const toggleCategory = (id: string) => setSelectedCategories(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Move relocates within the folder tree, which a top-level folder has no
  // place in — so it is offered only when the selection is movable.
  const canMoveSelection = selectedCategories.size === 0 && !atHome && selectionCount > 0;

  /** Edit the one selected item. Enabled only at a count of exactly 1 — "edit"
   *  has no meaning for a multi-selection. */
  const editSelected = () => {
    if (selectionCount !== 1) return;
    const catId = Array.from(selectedCategories)[0];
    if (catId) {
      const c = categories.find(x => x.id === catId);
      if (c) setFolderModal({ editing: c });
    } else {
      const folderId = Array.from(selectedFolders)[0];
      if (folderId) {
        const f = folders.find(x => x.id === folderId);
        if (f) setFolderModal({ editing: f });
      } else {
        const entryId = Array.from(selectedEntries)[0];
        const e = entries.find(x => x.id === entryId);
        if (e) setFileModal({ editing: e });
      }
    }
    clearSelection();
  };

  /** Delete everything selected, whatever the mix. One confirmation for the
   *  whole set rather than one per item. */
  const deleteSelected = async () => {
    if (selectionCount === 0) return;
    const anyFolder = selectedFolders.size > 0 || selectedCategories.size > 0;
    // Deleting a folder cascades to its contents, so it warrants the harsher
    // wording even when files are in the mix.
    if (!(await confirm({ message: anyFolder ? t.deleteFolderConfirm : t.deleteEntryConfirm, destructive: true }))) return;
    if (selectedEntries.size) {
      await supabase.from('file_entries').delete().in('id', Array.from(selectedEntries));
    }
    if (selectedFolders.size) {
      await supabase.from('file_folders').delete().in('id', Array.from(selectedFolders));
    }
    if (selectedCategories.size) {
      await supabase.from('file_categories').delete().in('id', Array.from(selectedCategories));
    }
    clearSelection();
    void load();
  };

  const enterCategory = (c: FileCategory) => setStack(s => [...s, { categoryId: c.id, folderId: null, label: c.name }]);
  const enterFolder = (f: FileFolder) => setStack(s => [...s, { categoryId: f.category_id, folderId: f.id, label: f.name }]);
  const goToCrumb = (i: number) => { setStack(s => s.slice(0, i + 1)); clearSelection(); };

  const toggleEntry = (id: string) =>
    setSelectedEntries(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleFolder = (id: string) =>
    setSelectedFolders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Direct items in a folder = its subfolders + its files (one level).
  const folderItemCount = (cid: string, fid: string | null) =>
    folders.filter(f => f.category_id === cid && f.parent_folder_id === fid).length +
    entries.filter(e => e.category_id === cid && e.folder_id === fid).length;

  const openFile = (e: FileEntry) => {
    if (e.kind === 'link') {
      if (e.url) window.open(e.url, '_blank', 'noopener');
      return;
    }
    if (!e.storage_path) return;
    // Private bucket: open a tab synchronously (keeps the user gesture so the
    // popup isn't blocked), then point it at a freshly-signed URL.
    const tab = window.open('about:blank', '_blank');
    void signedUrl(supabase, e.storage_path).then((href) => {
      if (!href) { tab?.close(); return; }
      if (tab) tab.location.href = href;
      else window.open(href, '_blank', 'noopener');
    });
  };
  const deleteFolderRow = async (f: FileFolder) => {
    if (!(await confirm({ message: t.deleteFolderConfirm, destructive: true }))) return;
    await supabase.from('file_folders').delete().eq('id', f.id);
    void load();
  };
  const deleteCategoryRow = async (c: FileCategory) => {
    if (!(await confirm({ message: t.deleteFolderConfirm, destructive: true }))) return;
    await supabase.from('file_categories').delete().eq('id', c.id);
    void load();
  };
  const deleteEntry = async (e: FileEntry) => {
    if (!(await confirm({ message: t.deleteEntryConfirm, destructive: true }))) return;
    await supabase.from('file_entries').delete().eq('id', e.id);
    void load();
  };
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
  // Move the whole selection (files + folders) into one destination. Only the
  // top-level selected folders move; a selected folder nested under another
  // selected one rides along with its ancestor. Cross-category moves cascade
  // the denormalized category_id over each moved subtree (RLS uses it).
  const moveSelection = async (target: { categoryId: string; folderId: string | null }) => {
    if (selectionCount === 0) return;
    if (selectedEntries.size) {
      await supabase.from('file_entries')
        .update({ category_id: target.categoryId, folder_id: target.folderId })
        .in('id', Array.from(selectedEntries));
    }
    const ancestorSelected = (f: FileFolder) => {
      let pid = f.parent_folder_id;
      while (pid) { if (selectedFolders.has(pid)) return true; pid = folders.find(x => x.id === pid)?.parent_folder_id ?? null; }
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
    setMoveOpen(false);
    clearSelection();
    void load();
  };

  const isEmpty = atHome ? categories.length === 0 : (childFolders.length === 0 && childEntries.length === 0);

  return (
    <div className="p-6">
      {/* Storage usage meter */}
      {business && (
        limitBytes === null ? (
          <p className="text-xs text-faint mb-4">{es ? 'Almacenamiento ilimitado' : 'Unlimited storage'}</p>
        ) : (
          (() => {
            const used = usedBytes ?? 0;
            const pct = storagePercent(used, limitBytes);
            const full100 = used >= limitBytes;
            const barColor = full100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary';
            return (
              <div className="rounded-xl border border-border-soft bg-card px-4 py-3 mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-ink">{es ? 'Almacenamiento' : 'Storage'}</span>
                  <span className="text-xs text-muted">
                    {formatBytes(used)} {es ? 'de' : 'of'} {formatBytes(limitBytes)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border-soft overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                {/* What's eating the space: job photos+documents vs this
                   library vs equipment (needs migration 149). */}
                {breakdown && (
                  <p className="text-xs text-faint mt-1.5">
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
                  </p>
                )}
                {full100 && (
                  <p className="text-xs text-red-500 mt-1.5">
                    {es ? 'Almacenamiento lleno · mejora tu plan' : 'Storage full · upgrade your plan'}
                  </p>
                )}
              </div>
            );
          })()
        )
      )}

      {/* Header + breadcrumb */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <FolderOpen size={22} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
            <p className="text-sm text-muted">{t.subtitle}</p>
          </div>
        </div>
        {/* View toggle sits outside the canManage block: read-only members
            browse these folders too and want thumbnails just as much. */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleViewMode}
            aria-label={viewMode === 'grid' ? t.listView : t.gridView}
            title={viewMode === 'grid' ? t.listView : t.gridView}
            className="p-2.5 rounded-xl border border-border bg-card text-muted hover:text-primary hover:border-primary/40"
          >
            {viewMode === 'grid' ? <ListIcon size={16} /> : <LayoutGrid size={16} />}
          </button>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Enter selection mode (checkboxes appear). Shown only where
                there are selectable items and we're not already selecting. */}
            {/* Edit/delete live in the selection bar now, so this has to be
                reachable at home as well — otherwise a top-level folder has no
                edit path at all. */}
            {!selectionMode && (categories.length > 0 || childFolders.length > 0 || childEntries.length > 0) && (
              <Button variant="secondary" onClick={() => setSelectMode(true)}>
                <ListChecks size={16} className="mr-1.5" /> {t.selectButton}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setFolderModal({ editing: null })}>
              <FolderPlus size={16} className="mr-1.5" /> {t.newFolder}
            </Button>
            {!atHome && (
              <Button onClick={() => setFileModal({ editing: null })}>
                <FilePlus2 size={16} className="mr-1.5" /> {t.addEntry}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-wrap mb-4 text-sm">
        {stack.map((c, i) => {
          const last = i === stack.length - 1;
          return (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="text-faint" />}
              <button
                onClick={() => goToCrumb(i)}
                disabled={last}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${last ? 'text-ink font-semibold' : 'text-muted hover:text-primary hover:bg-primary/5'}`}
              >
                {i === 0 ? <><Home size={13} /> {t.title}</> : c.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Selection bar (files + folders) — visible whenever selection mode is on */}
      {canManage && selectionMode && (
        <div className="flex items-center gap-3 mb-4 rounded-xl bg-primary/5 border border-primary/20 px-4 py-2.5">
          <Tooltip label={t.clearSelectionBtn}>
            <button onClick={clearSelection} className="p-1 rounded-lg hover:bg-primary/10"><X size={15} className="text-primary" /></button>
          </Tooltip>
          <span className="text-sm font-medium text-primary">
            {selectionCount > 0 ? t.selectedCount.replace('{{count}}', String(selectionCount)) : t.selectPrompt}
          </span>
          <div className="flex-1" />
          {/* Edit only at exactly one — "edit" has no meaning for a set. */}
          {selectionCount === 1 && (
            <Button size="sm" variant="secondary" onClick={editSelected}>
              <Pencil size={14} className="mr-1.5" /> {tc.buttons.edit}
            </Button>
          )}
          {canMoveSelection && (
            <Button size="sm" variant="secondary" onClick={() => setMoveOpen(true)}>
              <FolderInput size={15} className="mr-1.5" /> {t.moveBtn}
            </Button>
          )}
          <Button size="sm" disabled={selectionCount === 0} onClick={() => void deleteSelected()} className="!bg-red-500 hover:!bg-red-600">
            <Trash2 size={14} className="mr-1.5" /> {tc.buttons.delete}
          </Button>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={8} />
      ) : isEmpty ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-surface">
          <FolderOpen size={32} className="text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted">{atHome ? t.empty : t.emptyFolder}</p>
          {!canManage && atHome && <p className="text-xs text-faint mt-1">{t.emptyHint}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Grid mode tiles folders too. A folder-only view that looked
              identical in both modes made the toggle read as broken. */}
          {viewMode === 'grid' && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {atHome && categories.map(c => (
                <FolderTile key={c.id} name={c.name} count={folderItemCount(c.id, null)}
                  onOpen={() => enterCategory(c)} canManage={canManage} coverPath={c.cover_path}
                  selected={selectedCategories.has(c.id)} selectionMode={selectionMode}
                  onToggleSelect={() => toggleCategory(c.id)} />
              ))}
              {childFolders.map(f => (
                <FolderTile key={f.id} name={f.name} count={folderItemCount(f.category_id, f.id)}
                  onOpen={() => enterFolder(f)} canManage={canManage}
                  selected={selectedFolders.has(f.id)} selectionMode={selectionMode}
                  onToggleSelect={() => toggleFolder(f.id)} coverPath={f.cover_path} />
              ))}
            </div>
          )}

          {/* Top-level folders (home) — not selectable/movable */}
          {viewMode !== 'grid' && atHome && categories.map(c => (
            <FolderCard
              key={c.id}
              name={c.name}
              count={folderItemCount(c.id, null)}
              badge={c.crew_visible ? { label: t.crewBadge, team: true } : { label: t.officeOnlyBadge, team: false }}
              onOpen={() => enterCategory(c)}
              canManage={canManage}
              coverPath={c.cover_path}
              selected={selectedCategories.has(c.id)}
              selectionMode={selectionMode}
              onToggleSelect={() => toggleCategory(c.id)}
            />
          ))}

          {/* Subfolders — selectable (long-press) so they can be bulk-moved */}
          {viewMode !== 'grid' && childFolders.map(f => (
            <FolderCard
              key={f.id}
              name={f.name}
              count={folderItemCount(f.category_id, f.id)}
              onOpen={() => enterFolder(f)}
              canManage={canManage}
              selected={selectedFolders.has(f.id)}
              selectionMode={selectionMode}
              onToggleSelect={() => toggleFolder(f.id)}
              coverPath={f.cover_path}
            />
          ))}

          {/* Files at this level. */}
          {viewMode === 'grid' ? (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {childEntries.map(e => (
                <FileCard
                  key={e.id}
                  entry={e}
                  officeOnly={!!category && !fileIsCrewVisible(e, category.crew_visible)}
                  metaLabel={fileMeta(e, t.linkBadge)}
                  canManage={canManage}
                  selected={selectedEntries.has(e.id)}
                  selectionMode={selectionMode}
                  onToggleSelect={() => toggleEntry(e.id)}
                  onOpen={() => openFile(e)}
                  onEdit={() => setFileModal({ editing: e })}
                  onDelete={() => deleteEntry(e)}
                />
              ))}
            </div>
          ) : childEntries.map(e => (
            <FileRow
              key={e.id}
              entry={e}
              officeOnly={!!category && !fileIsCrewVisible(e, category.crew_visible)}
              metaLabel={fileMeta(e, t.linkBadge)}
              canManage={canManage}
              selected={selectedEntries.has(e.id)}
              selectionMode={selectionMode}
              onToggleSelect={() => toggleEntry(e.id)}
              onOpen={() => openFile(e)}
              onEdit={() => setFileModal({ editing: e })}
              onDelete={() => deleteEntry(e)}
            />
          ))}
        </div>
      )}

      {folderModal && (
        <FolderModal
          editing={folderModal.editing}
          atHome={atHome}
          categoryId={here.categoryId}
          parentFolderId={here.folderId}
          businessId={business!.id}
          userId={user?.id ?? null}
          onClose={() => setFolderModal(null)}
          onSaved={() => { setFolderModal(null); void load(); }}
        />
      )}
      {fileModal && (
        <FileModal
          editing={fileModal.editing}
          categoryId={here.categoryId!}
          folderId={here.folderId}
          businessId={business!.id}
          userId={user?.id ?? null}
          limitBytes={limitBytes}
          subInfo={subInfo!}
          es={es}
          onClose={() => setFileModal(null)}
          onSaved={() => { setFileModal(null); void load(); }}
        />
      )}
      {moveOpen && (
        <MoveModal
          categories={categories}
          folders={folders}
          count={selectionCount}
          selectedFolderIds={selectedFolders}
          startCategoryId={here.categoryId}
          startFolderId={here.folderId}
          onClose={() => setMoveOpen(false)}
          onMove={moveSelection}
        />
      )}
    </div>
  );
}

function FolderCard({ name, count, badge, onOpen, canManage, selected, selectionMode, onToggleSelect, coverPath }: {
  name: string; count?: number; badge?: { label: string; team: boolean }; onOpen: () => void;
  canManage: boolean;
  selected?: boolean; selectionMode?: boolean; onToggleSelect?: () => void;
  /** Hand-picked folder picture (migration 214); null falls back to the icon. */
  coverPath?: string | null;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.files;
  const countLabel = count == null ? null
    : count === 0 ? t.itemsEmpty : count === 1 ? t.itemsOne : t.itemsMany.replace('{{count}}', String(count));
  const selectable = canManage && !!onToggleSelect;
  const inSelect = selectable && !!selectionMode;
  return (
    <div className={`flex items-center gap-3 px-3 py-3 rounded-xl border bg-card ${selected ? 'border-primary bg-primary/5' : 'border-border-soft hover:border-border'}`}>
      {inSelect && (
        <button onClick={() => onToggleSelect?.()} className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${selected ? 'bg-primary border-primary' : 'border-border hover:border-primary'}`}>
          {selected && <Check size={12} className="text-white" />}
        </button>
      )}
      <button
        onClick={() => (inSelect ? onToggleSelect?.() : onOpen())}
        className="flex items-center gap-3 flex-1 min-w-0 text-left select-none"
      >
        <div className="w-9 h-9 rounded-lg bg-primary/10 overflow-hidden flex items-center justify-center shrink-0">
          {coverPath
            ? <CoverImage path={coverPath} className="w-full h-full object-cover" />
            : <Folder size={17} className="text-primary" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink truncate">{name}</span>
            {badge && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badge.team ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}`}>
                {badge.team ? <Users size={10} /> : <Lock size={10} />}{badge.label}
              </span>
            )}
          </div>
          {countLabel && <p className="text-xs text-faint mt-0.5">{countLabel}</p>}
        </div>
      </button>
      {/* Edit and delete live in the selection bar now (long-press / Select),
          so a row carries navigation only. */}
      {!inSelect && <ChevronRight size={16} className="text-faint shrink-0" />}
    </div>
  );
}

function FileRow({ entry, officeOnly, metaLabel, canManage, selected, selectionMode, onToggleSelect, onOpen, onEdit, onDelete }: {
  entry: FileEntry; officeOnly: boolean; metaLabel: string;
  canManage: boolean; selected: boolean; selectionMode: boolean;
  onToggleSelect: () => void; onOpen: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const inSelect = canManage && selectionMode;
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-card ${selected ? 'border-primary bg-primary/5' : 'border-border-soft hover:border-border'}`}>
      {inSelect && (
        <button onClick={onToggleSelect} className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${selected ? 'bg-primary border-primary' : 'border-border hover:border-primary'}`}>
          {selected && <Check size={12} className="text-white" />}
        </button>
      )}
      <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center shrink-0">
        {entry.kind === 'link' ? <Link2 size={15} className="text-muted" /> : <FileText size={15} className="text-muted" />}
      </div>
      <button
        onClick={() => (inSelect ? onToggleSelect() : onOpen())}
        className="flex-1 min-w-0 text-left select-none"
      >
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-ink truncate">{entry.title}</p>
          {officeOnly && <Lock size={11} className="text-amber-500 shrink-0" />}
        </div>
        <p className="text-xs text-faint">{metaLabel}</p>
      </button>
      {!inSelect && (
        <>
          <Tooltip tip="openFile">
            <button onClick={onOpen} className="p-2 rounded-lg text-faint hover:text-primary hover:bg-primary/5 shrink-0"><ExternalLink size={15} /></button>
          </Tooltip>
        </>
      )}
    </div>
  );
}

/** Folder as a grid tile. Same footprint as a file card so the two line up in
 *  one grid — a folder-only view has to visibly change when you flip the
 *  toggle, or the control reads as broken. */
function FolderTile({ name, count, onOpen, canManage, selected, selectionMode, onToggleSelect, coverPath }: {
  name: string; count: number; onOpen: () => void; canManage: boolean;
  selected?: boolean; selectionMode?: boolean; onToggleSelect?: () => void;
  /** Hand-picked folder picture (migration 214); null falls back to the icon. */
  coverPath?: string | null;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.files;
  const countLabel = count === 0 ? t.itemsEmpty : count === 1 ? t.itemsOne : t.itemsMany.replace('{{count}}', String(count));
  const inSelect = canManage && !!selectionMode && !!onToggleSelect;
  return (
    <div className={`group relative rounded-xl border overflow-hidden bg-card ${selected ? 'border-primary ring-1 ring-primary/30' : 'border-border-soft hover:border-border'}`}>
      <button onClick={() => (inSelect && onToggleSelect ? onToggleSelect() : onOpen())} className="block w-full text-left">
        <div className="aspect-[3/4] w-full overflow-hidden flex items-center justify-center bg-primary/5 border-b border-border-soft">
          {coverPath
            ? <CoverImage path={coverPath} />
            : <Folder size={44} className="text-primary" />}
        </div>
        <div className="px-2.5 py-2">
          <p className="text-xs font-medium text-ink truncate">{name}</p>
          <p className="text-[11px] text-faint truncate">{countLabel}</p>
        </div>
      </button>
      {inSelect ? (
        <button
          onClick={onToggleSelect}
          className={`absolute top-2 left-2 w-5 h-5 rounded border flex items-center justify-center ${selected ? 'bg-primary border-primary' : 'bg-card/90 border-border'}`}
        >
          {selected && <Check size={12} className="text-white" />}
        </button>
      ) : null}
    </div>
  );
}

/** A stored image resolved to a signed URL. Used for folder covers, which are
 *  always hand-picked (there is nothing to render a folder from). */
function CoverImage({ path, className = 'w-full h-full object-cover object-top' }: { path: string; className?: string }) {
  const supabase = createSupabaseClient();
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setBroken(false);
    void signedUrl(supabase, path).then(u => { if (!cancelled) setSrc(u); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  if (!src || broken) return <Folder size={44} className="text-primary" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={className} />;
}

/**
 * Cached first-page preview. `thumbnail_path` is produced once by the API
 * (migration 212) and stored in the private bucket, so this only ever resolves
 * a signed URL — it never renders a PDF in the browser.
 *
 * Falls back to the type icon whenever there is no preview: a link, a format
 * poppler cannot rasterize, or a render that has not happened yet.
 */
function FileThumb({ entry }: { entry: FileEntry }) {
  const supabase = createSupabaseClient();
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setBroken(false);
    if (!entry.thumbnail_path) return;
    // Default bucket is the private one, same as FILES_BUCKET.
    void signedUrl(supabase, entry.thumbnail_path).then(u => {
      if (!cancelled) setSrc(u);
    });
    return () => { cancelled = true; };
  }, [entry.thumbnail_path]);

  if (src && !broken) {
    return (
      // object-top, not object-cover-centred: the useful part of a cover page
      // is its masthead, so crop from the bottom.
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="w-full h-full object-cover object-top"
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-surface">
      {entry.kind === 'link'
        ? <Link2 size={26} className="text-faint" />
        : <FileText size={26} className="text-faint" />}
    </div>
  );
}

function FileCard({ entry, officeOnly, metaLabel, canManage, selected, selectionMode, onToggleSelect, onOpen, onEdit, onDelete }: {
  entry: FileEntry; officeOnly: boolean; metaLabel: string;
  canManage: boolean; selected: boolean; selectionMode: boolean;
  onToggleSelect: () => void; onOpen: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const inSelect = canManage && selectionMode;
  return (
    <div className={`group relative rounded-xl border overflow-hidden bg-card ${selected ? 'border-primary ring-1 ring-primary/30' : 'border-border-soft hover:border-border'}`}>
      <button
        onClick={() => (inSelect ? onToggleSelect() : onOpen())}
        className="block w-full text-left"
      >
        <div className="aspect-[3/4] w-full overflow-hidden border-b border-border-soft bg-surface">
          <FileThumb entry={entry} />
        </div>
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-ink truncate">{entry.title}</p>
            {officeOnly && <Lock size={10} className="text-amber-500 shrink-0" />}
          </div>
          <p className="text-[11px] text-faint truncate">{metaLabel}</p>
        </div>
      </button>

      {inSelect ? (
        <button
          onClick={onToggleSelect}
          className={`absolute top-2 left-2 w-5 h-5 rounded border flex items-center justify-center ${selected ? 'bg-primary border-primary' : 'bg-card/90 border-border'}`}
        >
          {selected && <Check size={12} className="text-white" />}
        </button>
      ) : (
        // Only "open" stays inline. Edit and delete moved into the selection
        // bar (long-press / Select), so the card stays uncluttered and the two
        // destructive actions sit behind a deliberate gesture.
        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button onClick={onOpen} className="p-1.5 rounded-lg bg-card/90 border border-border-soft text-faint hover:text-primary"><ExternalLink size={13} /></button>
        </div>
      )}
    </div>
  );
}

function FolderModal({ editing, atHome, categoryId, parentFolderId, businessId, userId, onClose, onSaved }: {
  editing: FileCategory | FileFolder | null; atHome: boolean;
  categoryId: string | null; parentFolderId: string | null;
  businessId: string; userId: string | null; onClose: () => void; onSaved: () => void;
}) {
  const supabase = createSupabaseClient();
  const { t: full } = useLang();
  const t = full.dashboard.files;
  const tc = full.common;
  // A top-level folder (category) when editing one, or creating at home.
  const isCategory = editing ? !('category_id' in editing) : atHome;
  const [name, setName] = useState(editing?.name ?? '');
  const [crewVisible, setCrewVisible] = useState(
    editing && !('category_id' in editing) ? (editing as FileCategory).crew_visible : true,
  );
  const [saving, setSaving] = useState(false);
  // Folder picture (migration 214). Always hand-picked — a folder has no
  // contents to render a preview from.
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const existingCover = editing?.cover_path ?? null;

  const onPickCover = (f: File | null) => {
    if (!f || !f.type.startsWith('image/')) return;
    setCover(f);
    setCoverRemoved(false);
    setCoverPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  };
  usePasteImage(!saving, files => { if (files[0]) onPickCover(files[0]); }, [saving]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  /** Resolve the cover column for a row that now definitely exists. Uploading
   *  after the insert means a cancelled save leaves no orphan in the bucket. */
  const applyCover = async (table: 'file_categories' | 'file_folders', id: string) => {
    if (coverRemoved && !cover) {
      await supabase.from(table).update({ cover_path: null }).eq('id', id);
      return;
    }
    if (!cover) return;
    const shrunk = await downscaleImage(cover);
    const path = coverStoragePath(businessId, id, 'jpg');
    const { error } = await supabase.storage.from(FILES_BUCKET)
      .upload(path, shrunk, { contentType: 'image/jpeg', upsert: true });
    if (error) return; // best-effort: never fail a save over a picture
    await supabase.from(table).update({ cover_path: path }).eq('id', id);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    if (isCategory) {
      if (editing) {
        await supabase.from('file_categories').update({ name: name.trim(), crew_visible: crewVisible }).eq('id', editing.id);
        await applyCover('file_categories', editing.id);
      } else {
        const { data } = await supabase.from('file_categories')
          .insert({ business_id: businessId, name: name.trim(), crew_visible: crewVisible, created_by: userId })
          .select('id').single();
        if (data?.id) await applyCover('file_categories', data.id);
      }
    } else {
      if (editing) {
        await supabase.from('file_folders').update({ name: name.trim() }).eq('id', editing.id);
        await applyCover('file_folders', editing.id);
      } else {
        const { data } = await supabase.from('file_folders')
          .insert({ business_id: businessId, category_id: categoryId, parent_folder_id: parentFolderId, name: name.trim(), created_by: userId })
          .select('id').single();
        if (data?.id) await applyCover('file_folders', data.id);
      }
    }
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={editing ? tc.buttons.edit : t.newFolder}>
      <div className="flex flex-col gap-4">
        <Input label={t.folderNameLabel} placeholder={t.folderNamePlaceholder} value={name} onChange={e => setName(e.target.value)} autoFocus />
        {isCategory && (
          <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
            <div className="pr-3">
              <p className="text-sm font-medium text-ink">{t.crewVisibleLabel}</p>
              <p className="text-xs text-faint">{t.crewVisibleHint}</p>
            </div>
            <Toggle checked={crewVisible} onChange={setCrewVisible} />
          </div>
        )}
        {/* Folder picture. Always hand-picked — there are no contents to
            render a preview from. */}
        <div>
          <label className="text-sm font-medium text-ink">{t.coverLabel}</label>
          {/* Same shape as the job-photos picker: one tile that is either the
              image (with a corner remove) or a dashed drop target. */}
          <div className="mt-1.5">
            <div className="w-28">
              {coverPreview || (existingCover && !coverRemoved) ? (
                <div className="relative aspect-square rounded-xl overflow-hidden bg-border-soft">
                  {coverPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <CoverImage path={existingCover!} className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => coverInput.current?.click()}
                    className="absolute inset-0"
                    aria-label={t.coverChange}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCover(null);
                      setCoverPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
                      setCoverRemoved(true);
                    }}
                    aria-label={t.coverRemove}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverInput.current?.click()}
                  className="w-full aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-faint hover:border-primary hover:text-primary transition-colors"
                >
                  <ImagePlus size={22} />
                  <span className="text-[11px] mt-1.5 font-medium">{t.coverAdd}</span>
                </button>
              )}
            </div>
            <p className="text-xs text-faint mt-2">{t.folderCoverNote}</p>
            <PasteHint className="mt-1" />
          </div>
          <input ref={coverInput} type="file" accept="image/*" className="hidden"
            onChange={e => onPickCover(e.target.files?.[0] ?? null)} />
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} fullWidth>{tc.buttons.cancel}</Button>
          <Button onClick={save} loading={saving} fullWidth>{tc.buttons.save}</Button>
        </div>
      </div>
    </Modal>
  );
}

function FileModal({ editing, categoryId, folderId, businessId, userId, limitBytes, subInfo, es, onClose, onSaved }: {
  editing: FileEntry | null; categoryId: string; folderId: string | null;
  businessId: string; userId: string | null;
  limitBytes: number | null; subInfo: SubscriptionInfo; es: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const supabase = createSupabaseClient();
  const { t: full } = useLang();
  const t = full.dashboard.files;
  const tc = full.common;
  const [kind, setKind] = useState<FileEntryKind>(editing?.kind ?? 'file');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [url, setUrl] = useState(editing?.url ?? '');
  const [vis, setVis] = useState<'inherit' | 'team' | 'office'>(
    editing == null || editing.crew_visible == null ? 'inherit' : editing.crew_visible ? 'team' : 'office',
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  // Hand-picked cover (migration 213). Links never get one automatically —
  // rendering the page a URL points at would mean the server fetching
  // arbitrary user-supplied addresses — so the user supplies the image.
  // Held as a blob and uploaded only after the row exists, so a cancelled
  // save leaves no orphan in the bucket.
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const existingCover = editing?.thumbnail_path ?? null;

  const onPickCover = (f: File | null) => {
    if (!f || !f.type.startsWith('image/')) return;
    setCover(f);
    setCoverRemoved(false);
    setCoverPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  };
  // Ctrl/Cmd+V drops a screenshot straight in — same affordance as the other
  // photo fields. Disabled while saving so a stray paste can't race the upload.
  usePasteImage(!saving, files => { if (files[0]) onPickCover(files[0]); }, [saving]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  /** Upload the picked image and point the row at it. Best-effort: a cover
   *  failure must not fail a save whose file/link already went through. */
  const applyCover = async (entryId: string) => {
    if (coverRemoved && !cover) {
      // Null the status too, so a PDF becomes eligible for auto-generation again.
      await supabase.from('file_entries')
        .update({ thumbnail_path: null, thumbnail_status: null, thumbnail_manual: false })
        .eq('id', entryId);
      return;
    }
    if (!cover) return;
    const shrunk = await downscaleImage(cover);
    const path = coverStoragePath(businessId, entryId, 'jpg');
    const { error: upErr } = await supabase.storage.from(FILES_BUCKET)
      .upload(path, shrunk, { contentType: 'image/jpeg', upsert: true });
    if (upErr) return;
    await supabase.from('file_entries')
      .update({ thumbnail_path: path, thumbnail_status: 'ready', thumbnail_manual: true })
      .eq('id', entryId);
  };

  const crewVisibleValue = vis === 'inherit' ? null : vis === 'team';

  const onPickFile = (f: File | null) => {
    setError('');
    if (f && f.size > FILE_MAX_BYTES) { setError(t.tooBig); setFile(null); return; }
    setFile(f);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      if (editing) {
        // Edit metadata only (title, link url, visibility).
        await supabase.from('file_entries').update({
          title: title.trim() || editing.title,
          url: editing.kind === 'link' ? (url.trim() || editing.url) : editing.url,
          crew_visible: crewVisibleValue,
        }).eq('id', editing.id);
        await applyCover(editing.id);
        onSaved();
        return;
      }
      if (kind === 'file' && !file) { setError(t.chooseFile); setSaving(false); return; }
      if (kind === 'link' && !url.trim()) { setError(t.linkUrlLabel); setSaving(false); return; }
      if (kind === 'file' && file) {
        if (limitBytes != null) {
          const { data } = await supabase.rpc('business_storage_bytes', { p_business_id: businessId });
          const used = Number(data ?? 0);
          if (wouldExceedStorage(subInfo, used, file.size)) {
            setError(es ? 'No hay suficiente almacenamiento. Mejora tu plan para subir más.' : 'Not enough storage. Upgrade your plan to upload more.');
            setSaving(false);
            return;
          }
        }
        const path = fileStoragePath(businessId, fileUid(), file.name);
        const { error: upErr } = await supabase.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (upErr) throw new Error(upErr.message);
        const { data: created } = await supabase.from('file_entries').insert({
          business_id: businessId, category_id: categoryId, folder_id: folderId, title: title.trim() || file.name,
          kind: 'file', storage_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || null,
          crew_visible: crewVisibleValue, created_by: userId,
        }).select('id').single();
        // Kick off the first-page render, but never make the upload wait on it
        // or fail with it — the file is already saved, a thumbnail is a bonus.
        if (created?.id) {
          await applyCover(created.id);
          // Skip the render when the user supplied their own cover — it would
          // be discarded anyway (generateFor returns early on a set path).
          if (!cover) void queueThumbnail(supabase, created.id);
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

  return (
    <Modal open onClose={onClose} title={editing ? tc.buttons.edit : t.addEntry}>
      <div className="flex flex-col gap-4">
        {!editing && (
          <div className="flex p-1 rounded-xl bg-border-soft">
            {(['file', 'link'] as const).map(k => (
              <button key={k} onClick={() => setKind(k)} className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold ${kind === k ? 'bg-primary text-white shadow-sm' : 'text-muted'}`}>
                {k === 'file' ? <Upload size={14} /> : <Link2 size={14} />}{k === 'file' ? t.kindFile : t.kindLink}
              </button>
            ))}
          </div>
        )}
        <Input label={t.entryTitleLabel} placeholder={t.entryTitlePlaceholder} value={title} onChange={e => setTitle(e.target.value)} />
        {!editing && kind === 'file' ? (
          <div>
            <input ref={fileInput} type="file" className="hidden" onChange={e => onPickFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => fileInput.current?.click()} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border hover:border-primary text-left">
              <Upload size={18} className="text-faint" />
              <span className="text-sm text-muted truncate">{file ? file.name : t.chooseFile}</span>
            </button>
          </div>
        ) : (editing?.kind === 'link' || (!editing && kind === 'link')) ? (
          <Input label={t.linkUrlLabel} placeholder={t.linkUrlPlaceholder} value={url} onChange={e => setUrl(e.target.value)} />
        ) : null}

        {/* Cover image. Offered for links AND files: a link never gets one
            automatically, and a file's generated page 1 is sometimes not the
            page worth showing. */}
        <div>
          <label className="text-sm font-medium text-ink">{t.coverLabel}</label>
          {/* Same shape as the job-photos picker: one tile that is either the
              image (with a corner remove) or a dashed drop target. 3:4, since a
              document cover is portrait. */}
          <div className="mt-1.5">
            <div className="w-24">
              {coverPreview || (existingCover && !coverRemoved) ? (
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-border-soft">
                  {coverPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPreview} alt="" className="w-full h-full object-cover object-top" />
                  ) : (
                    <FileThumb entry={editing as FileEntry} />
                  )}
                  <button
                    type="button"
                    onClick={() => coverInput.current?.click()}
                    className="absolute inset-0"
                    aria-label={t.coverChange}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCover(null);
                      setCoverPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
                      setCoverRemoved(true);
                    }}
                    aria-label={t.coverRemove}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverInput.current?.click()}
                  className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-faint hover:border-primary hover:text-primary transition-colors"
                >
                  <ImagePlus size={22} />
                  <span className="text-[11px] mt-1.5 font-medium">{t.coverAdd}</span>
                </button>
              )}
            </div>
            <p className="text-xs text-faint mt-2">
              {(editing?.kind ?? kind) === 'link' ? t.coverLinkNote : t.coverFileNote}
            </p>
            <PasteHint className="mt-1" />
          </div>
          <input
            ref={coverInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => onPickCover(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Per-file visibility override */}
        <div>
          <label className="text-sm font-medium text-ink">{t.visibilityLabel}</label>
          <div className="flex p-1 rounded-xl bg-border-soft mt-1.5">
            {VIS.map(v => (
              <button key={v.key} onClick={() => setVis(v.key)} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${vis === v.key ? 'bg-primary text-white shadow-sm' : 'text-muted'}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} fullWidth>{tc.buttons.cancel}</Button>
          <Button onClick={save} loading={saving} fullWidth>{saving ? t.uploading : tc.buttons.save}</Button>
        </div>
      </div>
    </Modal>
  );
}

// Move picker: opens at the current location (so sibling folders show first),
// click a folder to drop the selection into it, the › chevron to open it, and
// the ‹ up button to climb out. Selected folders + their subtrees are excluded
// so you can't move a folder into itself.
function MoveModal({ categories, folders, count, selectedFolderIds, startCategoryId, startFolderId, onClose, onMove }: {
  categories: FileCategory[]; folders: FileFolder[]; count: number;
  selectedFolderIds: Set<string>; startCategoryId: string | null; startFolderId: string | null;
  onClose: () => void; onMove: (target: { categoryId: string; folderId: string | null }) => void;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.files;
  const tc = full.common;
  const [crumb, setCrumb] = useState<{ categoryId: string | null; folderId: string | null; label: string }>(() => {
    if (startFolderId) return { categoryId: startCategoryId, folderId: startFolderId, label: folders.find(f => f.id === startFolderId)?.name ?? '' };
    if (startCategoryId) return { categoryId: startCategoryId, folderId: null, label: categories.find(c => c.id === startCategoryId)?.name ?? '' };
    return { categoryId: null, folderId: null, label: '' };
  });

  const atHome = crumb.categoryId === null;
  const excluded = useMemo(() => {
    const out = new Set<string>();
    let frontier = Array.from(selectedFolderIds);
    frontier.forEach(id => out.add(id));
    while (frontier.length) {
      const next = folders.filter(f => f.parent_folder_id && frontier.includes(f.parent_folder_id) && !out.has(f.id));
      next.forEach(f => out.add(f.id));
      frontier = next.map(f => f.id);
    }
    return out;
  }, [selectedFolderIds, folders]);
  const subFolders = atHome ? [] : folders.filter(f => f.category_id === crumb.categoryId && f.parent_folder_id === crumb.folderId && !excluded.has(f.id));

  const goUp = () => {
    if (crumb.folderId) {
      const f = folders.find(x => x.id === crumb.folderId);
      if (f?.parent_folder_id) setCrumb({ categoryId: crumb.categoryId, folderId: f.parent_folder_id, label: folders.find(x => x.id === f.parent_folder_id)?.name ?? '' });
      else setCrumb({ categoryId: crumb.categoryId, folderId: null, label: categories.find(c => c.id === crumb.categoryId)?.name ?? '' });
    } else {
      setCrumb({ categoryId: null, folderId: null, label: '' });
    }
  };

  return (
    <Modal open onClose={onClose} title={t.moveTitle}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-faint -mt-1">{t.moveHint}</p>
        {/* Current location + up control */}
        <div className="flex items-center gap-2">
          {!atHome && (
            <Tooltip label={t.goUpBtn}>
              <button onClick={goUp} className="w-8 h-8 rounded-lg bg-border-soft hover:bg-border flex items-center justify-center shrink-0"><ChevronLeft size={16} className="text-ink" /></button>
            </Tooltip>
          )}
          <Folder size={15} className="text-primary shrink-0" />
          <span className="text-sm font-semibold text-ink truncate">{atHome ? t.title : crumb.label}</span>
        </div>
        <div className="flex flex-col gap-1.5 max-h-[45vh] overflow-y-auto">
          {atHome
            ? categories.map(c => (
                <div key={c.id} className="flex items-center rounded-xl border border-border-soft hover:border-border">
                  <button onClick={() => onMove({ categoryId: c.id, folderId: null })} className="flex items-center gap-2 px-3 py-2.5 flex-1 min-w-0 text-left">
                    <Folder size={15} className="text-primary shrink-0" /><span className="text-sm text-ink truncate">{c.name}</span>
                  </button>
                  <button onClick={() => setCrumb({ categoryId: c.id, folderId: null, label: c.name })} className="px-3 py-2.5 border-l border-border-soft text-faint hover:text-primary"><ChevronRight size={16} /></button>
                </div>
              ))
            : subFolders.map(f => (
                <div key={f.id} className="flex items-center rounded-xl border border-border-soft hover:border-border">
                  <button onClick={() => onMove({ categoryId: f.category_id, folderId: f.id })} className="flex items-center gap-2 px-3 py-2.5 flex-1 min-w-0 text-left">
                    <Folder size={15} className="text-primary shrink-0" /><span className="text-sm text-ink truncate">{f.name}</span>
                  </button>
                  <button onClick={() => setCrumb({ categoryId: f.category_id, folderId: f.id, label: f.name })} className="px-3 py-2.5 border-l border-border-soft text-faint hover:text-primary"><ChevronRight size={16} /></button>
                </div>
              ))}
          {!atHome && subFolders.length === 0 && <p className="text-xs text-faint px-1 py-2">{t.emptyFolder}</p>}
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} fullWidth>{tc.buttons.cancel}</Button>
          <Button onClick={() => crumb.categoryId && onMove({ categoryId: crumb.categoryId, folderId: crumb.folderId })} disabled={atHome} fullWidth>
            {t.moveHere} ({count})
          </Button>
        </div>
      </div>
    </Modal>
  );
}
