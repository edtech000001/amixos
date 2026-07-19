'use client';

// Files module — web. Google-Drive-style nested folders. Top-level folders
// (file_categories, which carry the Team/Office visibility default) contain
// arbitrarily-nested folders (file_folders); files live at any level. Navigate
// one level at a time with a breadcrumb. Files can override their own
// visibility. Lazy-loaded from /dashboard/modulos/files.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen, FolderPlus, FilePlus2, Folder, ChevronRight, ChevronLeft, FileText, Link2,
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
  FILES_BUCKET, FILE_MAX_BYTES,
  type FileCategory, type FileFolder, type FileEntry, type FileEntryKind,
} from '@amixos/shared/lib/files';
import { signedUrl } from '@amixos/shared/lib/storageUrls';
import {
  storageLimitBytes, wouldExceedStorage, storagePercent, formatBytes,
} from '@amixos/shared/lib/storageLimits';
import type { SubscriptionInfo } from '@amixos/shared/lib/subscription';

// A breadcrumb crumb identifies a location: categoryId null = home (list of
// top-level folders); folderId null = at a top-level folder's root.
interface Crumb { categoryId: string | null; folderId: string | null; label: string }

export default function FilesModule() {
  const supabase = createSupabaseClient();
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

  const loadUsage = async () => {
    if (!business) return;
    const { data } = await supabase.rpc('business_storage_bytes', { p_business_id: business.id });
    setUsedBytes(Number(data ?? 0));
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

  const [folderModal, setFolderModal] = useState<{ editing: FileCategory | FileFolder | null } | null>(null);
  const [fileModal, setFileModal] = useState<{ editing: FileEntry | null } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  const load = async () => {
    if (!business) return;
    const tree = await fetchFilesTree(supabase, business.id);
    setCategories(tree.categories);
    setFolders(tree.folders);
    setEntries(tree.entries);
    setLoading(false);
    void loadUsage();
  };
  useEffect(() => { void load(); }, [business?.id]);

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
  const clearSelection = () => { setSelectedEntries(new Set()); setSelectedFolders(new Set()); setSelectMode(false); };
  const selectionCount = selectedEntries.size + selectedFolders.size;
  const selectionMode = selectMode || selectionCount > 0;

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
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Enter selection mode (checkboxes appear). Shown only where
                there are selectable items and we're not already selecting. */}
            {!atHome && !selectionMode && (childFolders.length > 0 || childEntries.length > 0) && (
              <Button variant="secondary" onClick={() => setSelectMode(true)}>
                <FolderInput size={16} className="mr-1.5" /> {t.moveBtn}
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
          <button onClick={clearSelection} className="p-1 rounded-lg hover:bg-primary/10"><X size={15} className="text-primary" /></button>
          <span className="text-sm font-medium text-primary">
            {selectionCount > 0 ? t.selectedCount.replace('{{count}}', String(selectionCount)) : t.selectPrompt}
          </span>
          <div className="flex-1" />
          <Button size="sm" disabled={selectionCount === 0} onClick={() => setMoveOpen(true)}>
            <FolderInput size={15} className="mr-1.5" /> {t.moveBtn}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex gap-1 py-20 justify-center">
          {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      ) : isEmpty ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-surface">
          <FolderOpen size={32} className="text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted">{atHome ? t.empty : t.emptyFolder}</p>
          {!canManage && atHome && <p className="text-xs text-faint mt-1">{t.emptyHint}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Top-level folders (home) — not selectable/movable */}
          {atHome && categories.map(c => (
            <FolderCard
              key={c.id}
              name={c.name}
              count={folderItemCount(c.id, null)}
              badge={c.crew_visible ? { label: t.crewBadge, team: true } : { label: t.officeOnlyBadge, team: false }}
              onOpen={() => enterCategory(c)}
              canManage={canManage}
              onEdit={() => setFolderModal({ editing: c })}
              onDelete={() => deleteCategoryRow(c)}
            />
          ))}

          {/* Subfolders — selectable (long-press) so they can be bulk-moved */}
          {childFolders.map(f => (
            <FolderCard
              key={f.id}
              name={f.name}
              count={folderItemCount(f.category_id, f.id)}
              onOpen={() => enterFolder(f)}
              canManage={canManage}
              selected={selectedFolders.has(f.id)}
              selectionMode={selectionMode}
              onToggleSelect={() => toggleFolder(f.id)}
              onEdit={() => setFolderModal({ editing: f })}
              onDelete={() => deleteFolderRow(f)}
            />
          ))}

          {/* Files at this level */}
          {childEntries.map(e => (
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

function FolderCard({ name, count, badge, onOpen, canManage, onEdit, onDelete, selected, selectionMode, onToggleSelect }: {
  name: string; count?: number; badge?: { label: string; team: boolean }; onOpen: () => void;
  canManage: boolean; onEdit: () => void; onDelete: () => void;
  // Subfolders pass these (selectable); top-level categories omit them.
  selected?: boolean; selectionMode?: boolean; onToggleSelect?: () => void;
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
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Folder size={17} className="text-primary" />
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
      {!inSelect && canManage && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/5"><Pencil size={14} /></button>
          <button onClick={onDelete} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10"><Trash2 size={14} /></button>
        </div>
      )}
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
          <button onClick={onOpen} className="p-2 rounded-lg text-faint hover:text-primary hover:bg-primary/5 shrink-0"><ExternalLink size={15} /></button>
          {canManage && (
            <>
              <button onClick={onEdit} className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/5 shrink-0"><Pencil size={14} /></button>
              <button onClick={onDelete} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 shrink-0"><Trash2 size={14} /></button>
            </>
          )}
        </>
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

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    if (isCategory) {
      if (editing) await supabase.from('file_categories').update({ name: name.trim(), crew_visible: crewVisible }).eq('id', editing.id);
      else await supabase.from('file_categories').insert({ business_id: businessId, name: name.trim(), crew_visible: crewVisible, created_by: userId });
    } else {
      if (editing) await supabase.from('file_folders').update({ name: name.trim() }).eq('id', editing.id);
      else await supabase.from('file_folders').insert({ business_id: businessId, category_id: categoryId, parent_folder_id: parentFolderId, name: name.trim(), created_by: userId });
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
        await supabase.from('file_entries').insert({
          business_id: businessId, category_id: categoryId, folder_id: folderId, title: title.trim() || file.name,
          kind: 'file', storage_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || null,
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
            <button onClick={goUp} className="w-8 h-8 rounded-lg bg-border-soft hover:bg-border flex items-center justify-center shrink-0"><ChevronLeft size={16} className="text-ink" /></button>
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
