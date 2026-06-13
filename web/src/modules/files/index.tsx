'use client';

// Files module — web. Google-Drive-style nested folders. Top-level folders
// (file_categories, which carry the Team/Office visibility default) contain
// arbitrarily-nested folders (file_folders); files live at any level. Navigate
// one level at a time with a breadcrumb. Files can override their own
// visibility. Lazy-loaded from /dashboard/modulos/files.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen, FolderPlus, FilePlus2, Folder, ChevronRight, FileText, Link2,
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
import {
  fetchFilesTree, fileStoragePath, fileUrl, fileUid, fileMeta, fileIsCrewVisible,
  FILES_BUCKET, FILE_MAX_BYTES,
  type FileCategory, type FileFolder, type FileEntry, type FileEntryKind,
} from '@amixos/shared/lib/files';

// A breadcrumb crumb identifies a location: categoryId null = home (list of
// top-level folders); folderId null = at a top-level folder's root.
interface Crumb { categoryId: string | null; folderId: string | null; label: string }

export default function FilesModule() {
  const supabase = createSupabaseClient();
  const { business, user, currentRole } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.files;
  const tc = full.common;
  const canManage = can.manageFiles(currentRole);

  const [categories, setCategories] = useState<FileCategory[]>([]);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stack, setStack] = useState<Crumb[]>([{ categoryId: null, folderId: null, label: '' }]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const enterCategory = (c: FileCategory) => setStack(s => [...s, { categoryId: c.id, folderId: null, label: c.name }]);
  const enterFolder = (f: FileFolder) => setStack(s => [...s, { categoryId: f.category_id, folderId: f.id, label: f.name }]);
  const goToCrumb = (i: number) => { setStack(s => s.slice(0, i + 1)); setSelectedIds(new Set()); };

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelectedIds(new Set());

  const openFile = (e: FileEntry) => {
    const href = e.kind === 'link' ? e.url : (e.storage_path ? fileUrl(supabase, e.storage_path) : null);
    if (href) window.open(href, '_blank', 'noopener');
  };
  const deleteFolderRow = async (f: FileFolder) => {
    if (!window.confirm(t.deleteFolderConfirm)) return;
    await supabase.from('file_folders').delete().eq('id', f.id);
    void load();
  };
  const deleteCategoryRow = async (c: FileCategory) => {
    if (!window.confirm(t.deleteFolderConfirm)) return;
    await supabase.from('file_categories').delete().eq('id', c.id);
    void load();
  };
  const deleteEntry = async (e: FileEntry) => {
    if (!window.confirm(t.deleteEntryConfirm)) return;
    await supabase.from('file_entries').delete().eq('id', e.id);
    void load();
  };
  const moveSelected = async (target: { categoryId: string; folderId: string | null }) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await supabase.from('file_entries').update({ category_id: target.categoryId, folder_id: target.folderId }).in('id', ids);
    setMoveOpen(false);
    clearSelection();
    void load();
  };

  const isEmpty = atHome ? categories.length === 0 : (childFolders.length === 0 && childEntries.length === 0);

  return (
    <div className="p-6">
      {/* Header + breadcrumb */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <FolderOpen size={22} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
            <p className="text-sm text-gray-500">{t.subtitle}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
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
              {i > 0 && <ChevronRight size={14} className="text-gray-300" />}
              <button
                onClick={() => goToCrumb(i)}
                disabled={last}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${last ? 'text-gray-900 font-semibold' : 'text-gray-500 hover:text-primary hover:bg-primary/5'}`}
              >
                {i === 0 ? <><Home size={13} /> {t.title}</> : c.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Selection bar */}
      {canManage && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 rounded-xl bg-primary/5 border border-primary/20 px-4 py-2.5">
          <button onClick={clearSelection} className="p-1 rounded-lg hover:bg-primary/10"><X size={15} className="text-primary" /></button>
          <span className="text-sm font-medium text-primary">{t.selectedCount.replace('{{count}}', String(selectedIds.size))}</span>
          <div className="flex-1" />
          <Button size="sm" onClick={() => setMoveOpen(true)}><FolderInput size={15} className="mr-1.5" /> {t.moveBtn}</Button>
        </div>
      )}

      {loading ? (
        <div className="flex gap-1 py-20 justify-center">
          {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      ) : isEmpty ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-gray-200 bg-gray-50">
          <FolderOpen size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">{atHome ? t.empty : t.emptyFolder}</p>
          {!canManage && atHome && <p className="text-xs text-gray-400 mt-1">{t.emptyHint}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Top-level folders (home) */}
          {atHome && categories.map(c => (
            <FolderCard
              key={c.id}
              name={c.name}
              badge={c.crew_visible ? { label: t.crewBadge, team: true } : { label: t.officeOnlyBadge, team: false }}
              onOpen={() => enterCategory(c)}
              canManage={canManage}
              onEdit={() => setFolderModal({ editing: c })}
              onDelete={() => deleteCategoryRow(c)}
            />
          ))}

          {/* Subfolders */}
          {childFolders.map(f => (
            <FolderCard
              key={f.id}
              name={f.name}
              onOpen={() => enterFolder(f)}
              canManage={canManage}
              onEdit={() => setFolderModal({ editing: f })}
              onDelete={() => deleteFolderRow(f)}
            />
          ))}

          {/* Files at this level */}
          {childEntries.map(e => {
            const officeOnly = !!category && !fileIsCrewVisible(e, category.crew_visible);
            return (
              <div key={e.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white ${selectedIds.has(e.id) ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200'}`}>
                {canManage && (
                  <button onClick={() => toggleSelect(e.id)} className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${selectedIds.has(e.id) ? 'bg-primary border-primary' : 'border-gray-300 hover:border-primary'}`}>
                    {selectedIds.has(e.id) && <Check size={12} className="text-white" />}
                  </button>
                )}
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  {e.kind === 'link' ? <Link2 size={15} className="text-gray-500" /> : <FileText size={15} className="text-gray-500" />}
                </div>
                <button onClick={() => openFile(e)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-900 truncate">{e.title}</p>
                    {officeOnly && <Lock size={11} className="text-amber-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-400">{fileMeta(e, t.linkBadge)}</p>
                </button>
                <button onClick={() => openFile(e)} className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 shrink-0"><ExternalLink size={15} /></button>
                {canManage && (
                  <>
                    <button onClick={() => setFileModal({ editing: e })} className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/5 shrink-0"><Pencil size={14} /></button>
                    <button onClick={() => deleteEntry(e)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 shrink-0"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            );
          })}
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
          onClose={() => setFileModal(null)}
          onSaved={() => { setFileModal(null); void load(); }}
        />
      )}
      {moveOpen && (
        <MoveModal
          categories={categories}
          folders={folders}
          count={selectedIds.size}
          onClose={() => setMoveOpen(false)}
          onMove={moveSelected}
        />
      )}
    </div>
  );
}

function FolderCard({ name, badge, onOpen, canManage, onEdit, onDelete }: {
  name: string; badge?: { label: string; team: boolean }; onOpen: () => void;
  canManage: boolean; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-white">
      <button onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Folder size={17} className="text-primary" />
        </div>
        <span className="font-medium text-gray-900 truncate">{name}</span>
        {badge && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.team ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {badge.team ? <Users size={10} /> : <Lock size={10} />}{badge.label}
          </span>
        )}
      </button>
      {canManage && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/5"><Pencil size={14} /></button>
          <button onClick={onDelete} className="p-2 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
        </div>
      )}
      <ChevronRight size={16} className="text-gray-300 shrink-0" />
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
          <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
            <div className="pr-3">
              <p className="text-sm font-medium text-gray-700">{t.crewVisibleLabel}</p>
              <p className="text-xs text-gray-400">{t.crewVisibleHint}</p>
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

function FileModal({ editing, categoryId, folderId, businessId, userId, onClose, onSaved }: {
  editing: FileEntry | null; categoryId: string; folderId: string | null;
  businessId: string; userId: string | null; onClose: () => void; onSaved: () => void;
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
          <div className="flex p-1 rounded-xl bg-gray-100">
            {(['file', 'link'] as const).map(k => (
              <button key={k} onClick={() => setKind(k)} className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold ${kind === k ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
                {k === 'file' ? <Upload size={14} /> : <Link2 size={14} />}{k === 'file' ? t.kindFile : t.kindLink}
              </button>
            ))}
          </div>
        )}
        <Input label={t.entryTitleLabel} placeholder={t.entryTitlePlaceholder} value={title} onChange={e => setTitle(e.target.value)} />
        {!editing && kind === 'file' ? (
          <div>
            <input ref={fileInput} type="file" className="hidden" onChange={e => onPickFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => fileInput.current?.click()} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-gray-300 hover:border-primary text-left">
              <Upload size={18} className="text-gray-400" />
              <span className="text-sm text-gray-600 truncate">{file ? file.name : t.chooseFile}</span>
            </button>
          </div>
        ) : (editing?.kind === 'link' || (!editing && kind === 'link')) ? (
          <Input label={t.linkUrlLabel} placeholder={t.linkUrlPlaceholder} value={url} onChange={e => setUrl(e.target.value)} />
        ) : null}

        {/* Per-file visibility override */}
        <div>
          <label className="text-sm font-medium text-gray-700">{t.visibilityLabel}</label>
          <div className="flex p-1 rounded-xl bg-gray-100 mt-1.5">
            {VIS.map(v => (
              <button key={v.key} onClick={() => setVis(v.key)} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${vis === v.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
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

// Move picker: navigate the folder tree, pick a destination folder.
function MoveModal({ categories, folders, count, onClose, onMove }: {
  categories: FileCategory[]; folders: FileFolder[]; count: number;
  onClose: () => void; onMove: (target: { categoryId: string; folderId: string | null }) => void;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.files;
  const tc = full.common;
  const [crumb, setCrumb] = useState<{ categoryId: string | null; folderId: string | null; label: string }>({ categoryId: null, folderId: null, label: '' });

  const atHome = crumb.categoryId === null;
  const subFolders = atHome ? [] : folders.filter(f => f.category_id === crumb.categoryId && f.parent_folder_id === crumb.folderId);

  return (
    <Modal open onClose={onClose} title={t.moveTitle}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => setCrumb({ categoryId: null, folderId: null, label: '' })} className={atHome ? 'font-semibold text-gray-900' : 'text-primary hover:underline'}>{t.title}</button>
          {!atHome && <><ChevronRight size={14} className="text-gray-300" /><span className="font-semibold text-gray-900">{crumb.label}</span></>}
        </div>
        <div className="flex flex-col gap-1.5 max-h-[45vh] overflow-y-auto">
          {atHome
            ? categories.map(c => (
                <button key={c.id} onClick={() => setCrumb({ categoryId: c.id, folderId: null, label: c.name })} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-gray-200 text-left">
                  <Folder size={15} className="text-primary" /><span className="text-sm text-gray-900 flex-1">{c.name}</span><ChevronRight size={15} className="text-gray-300" />
                </button>
              ))
            : subFolders.map(f => (
                <button key={f.id} onClick={() => setCrumb({ categoryId: f.category_id, folderId: f.id, label: f.name })} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-gray-200 text-left">
                  <Folder size={15} className="text-primary" /><span className="text-sm text-gray-900 flex-1">{f.name}</span><ChevronRight size={15} className="text-gray-300" />
                </button>
              ))}
          {!atHome && subFolders.length === 0 && <p className="text-xs text-gray-400 px-1 py-2">{t.emptyFolder}</p>}
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
