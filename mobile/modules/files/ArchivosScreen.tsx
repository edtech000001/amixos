// Files module screen (mobile). Google-Drive-style nested folders: top-level
// folders (file_categories, carrying the Team/Office visibility default)
// contain arbitrarily-nested folders (file_folders); files live at any level.
// Navigate one level at a time; files can override their own visibility.
// One-hand conventions: FAB + bottom-sheet forms (fade), save at the bottom.

import { useCallback, useState } from 'react';
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
import { useLang } from '@/lib/i18n/LangProvider';
import { Input, Toggle, Button, Fab } from '@amixos/shared/ui';
import { can } from '@amixos/shared/lib/permissions';
import {
  fetchFilesTree, fileStoragePath, fileUrl, fileUid, fileMeta, fileIsCrewVisible,
  FILES_BUCKET, FILE_MAX_BYTES,
  type FileCategory, type FileFolder, type FileEntry, type FileEntryKind,
} from '@amixos/shared/lib/files';

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
  const [sheet, setSheet] = useState<Sheet>(null);

  const load = useCallback(async () => {
    if (!business) return;
    const tree = await fetchFilesTree(supabase, business.id);
    setCategories(tree.categories);
    setFolders(tree.folders);
    setEntries(tree.entries);
    setLoading(false);
  }, [business?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const here = stack[stack.length - 1];
  const atHome = here.categoryId === null;
  const category = categories.find(c => c.id === here.categoryId) ?? null;
  const childFolders = atHome ? [] : folders.filter(f => f.category_id === here.categoryId && f.parent_folder_id === here.folderId);
  const childEntries = atHome ? [] : entries.filter(e => e.category_id === here.categoryId && e.folder_id === here.folderId);
  const isEmpty = atHome ? categories.length === 0 : (childFolders.length === 0 && childEntries.length === 0);

  const goBack = () => {
    if (stack.length > 1) { setStack(s => s.slice(0, -1)); setSelectedIds(new Set()); }
    else router.back();
  };
  const enterCategory = (c: FileCategory) => setStack(s => [...s, { categoryId: c.id, folderId: null, label: c.name }]);
  const enterFolder = (f: FileFolder) => setStack(s => [...s, { categoryId: f.category_id, folderId: f.id, label: f.name }]);

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelectedIds(new Set());

  const openEntry = (e: FileEntry) => {
    const href = e.kind === 'link' ? e.url : (e.storage_path ? fileUrl(supabase, e.storage_path) : null);
    if (href) Linking.openURL(href).catch(() => {});
  };
  const confirmDelete = (message: string, run: () => Promise<void>) =>
    Alert.alert('', message, [
      { text: tc.buttons.cancel, style: 'cancel' },
      { text: tc.buttons.delete, style: 'destructive', onPress: () => { void run().then(load); } },
    ]);
  const moveSelected = async (target: { categoryId: string; folderId: string | null }) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await supabase.from('file_entries').update({ category_id: target.categoryId, folder_id: target.folderId }).in('id', ids);
    setSheet(null);
    clearSelection();
    void load();
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* App bar */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable onPress={goBack} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-gray-100">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="ml-1 text-lg font-semibold text-gray-900 flex-1" numberOfLines={1}>
          {atHome ? t.title : here.label}
        </Text>
      </View>

      {/* Breadcrumb (depth > 1) */}
      {stack.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-gray-100" contentContainerClassName="px-4 py-2 gap-1 items-center">
          {stack.map((c, i) => (
            <Pressable key={i} onPress={() => { setStack(s => s.slice(0, i + 1)); clearSelection(); }} className="flex-row items-center gap-1">
              {i > 0 ? <ChevronRight size={12} color="#D1D5DB" /> : null}
              <Text className={`text-xs ${i === stack.length - 1 ? 'text-gray-900 font-semibold' : 'text-primary'}`}>
                {i === 0 ? t.title : c.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Selection bar */}
      {canManage && selectedIds.size > 0 ? (
        <View className="flex-row items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/20">
          <Pressable onPress={clearSelection} hitSlop={8}><X size={16} color="#4F46E5" /></Pressable>
          <Text className="text-sm font-medium text-primary flex-1">{t.selectedCount.replace('{{count}}', String(selectedIds.size))}</Text>
          <Pressable onPress={() => setSheet({ type: 'move' })} className="flex-row items-center gap-1.5 bg-primary px-3.5 py-1.5 rounded-full active:opacity-80">
            <FolderInput size={14} color="#FFFFFF" /><Text className="text-xs font-semibold text-white">{t.moveBtn}</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView contentContainerClassName="px-6 pt-5 pb-32">
        {atHome ? <Text className="text-sm text-gray-500 mb-5">{t.subtitle}</Text> : null}

        {loading ? (
          <View className="py-20 items-center"><ActivityIndicator color="#4F46E5" /></View>
        ) : isEmpty ? (
          <View className="py-16 items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50">
            <FolderOpen size={30} color="#D1D5DB" />
            <Text className="text-sm font-medium text-gray-600 mt-3">{atHome ? t.empty : t.emptyFolder}</Text>
            {!canManage && atHome ? <Text className="text-xs text-gray-400 mt-1 px-8 text-center">{t.emptyHint}</Text> : null}
          </View>
        ) : (
          <View className="gap-2">
            {/* Top-level folders (home) */}
            {atHome ? categories.map(c => (
              <FolderRow key={c.id} name={c.name}
                badge={c.crew_visible ? { label: t.crewBadge, team: true } : { label: t.officeOnlyBadge, team: false }}
                onOpen={() => enterCategory(c)} canManage={canManage}
                onEdit={() => setSheet({ type: 'folder', editing: c })}
                onDelete={() => confirmDelete(t.deleteFolderConfirm, async () => { await supabase.from('file_categories').delete().eq('id', c.id); })}
              />
            )) : null}

            {/* Subfolders */}
            {childFolders.map(f => (
              <FolderRow key={f.id} name={f.name}
                onOpen={() => enterFolder(f)} canManage={canManage}
                onEdit={() => setSheet({ type: 'folder', editing: f })}
                onDelete={() => confirmDelete(t.deleteFolderConfirm, async () => { await supabase.from('file_folders').delete().eq('id', f.id); })}
              />
            ))}

            {/* Files */}
            {childEntries.map(e => {
              const officeOnly = !!category && !fileIsCrewVisible(e, category.crew_visible);
              return (
                <View key={e.id} className={`flex-row items-center gap-3 px-3 py-2.5 rounded-xl border ${selectedIds.has(e.id) ? 'border-primary bg-primary/5' : 'border-gray-100'}`}>
                  {canManage ? (
                    <Pressable onPress={() => toggleSelect(e.id)} hitSlop={6}
                      className={`w-5 h-5 rounded border items-center justify-center ${selectedIds.has(e.id) ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                      {selectedIds.has(e.id) ? <Check size={12} color="#FFFFFF" /> : null}
                    </Pressable>
                  ) : null}
                  <View className="w-8 h-8 rounded-lg bg-gray-50 items-center justify-center">
                    {e.kind === 'link' ? <Link2 size={15} color="#6B7280" /> : <FileText size={15} color="#6B7280" />}
                  </View>
                  <Pressable onPress={() => openEntry(e)} className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-sm font-medium text-gray-900 flex-shrink" numberOfLines={1}>{e.title}</Text>
                      {officeOnly ? <Lock size={11} color="#F59E0B" /> : null}
                    </View>
                    <Text className="text-xs text-gray-400">{fileMeta(e, t.linkBadge)}</Text>
                  </Pressable>
                  <Pressable onPress={() => openEntry(e)} hitSlop={6} className="p-1.5"><ExternalLink size={15} color="#9CA3AF" /></Pressable>
                  {canManage ? (
                    <>
                      <Pressable onPress={() => setSheet({ type: 'file', editing: e })} hitSlop={6} className="p-1.5"><Pencil size={14} color="#6B7280" /></Pressable>
                      <Pressable onPress={() => confirmDelete(t.deleteEntryConfirm, async () => { await supabase.from('file_entries').delete().eq('id', e.id); })} hitSlop={6} className="p-1.5"><Trash2 size={14} color="#EF4444" /></Pressable>
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
          selectedCount={selectedIds.size}
          businessId={business!.id}
          userId={user?.id ?? null}
          onClose={() => setSheet(null)}
          onPick={(next) => setSheet(next)}
          onMove={moveSelected}
          onSaved={() => { setSheet(null); void load(); }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function FolderRow({ name, badge, onOpen, canManage, onEdit, onDelete }: {
  name: string; badge?: { label: string; team: boolean }; onOpen: () => void;
  canManage: boolean; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3 px-3 py-3 rounded-xl border border-gray-100">
      <Pressable onPress={onOpen} className="flex-row items-center gap-3 flex-1">
        <View className="w-9 h-9 rounded-lg bg-primary/10 items-center justify-center">
          <Folder size={17} color="#4F46E5" />
        </View>
        <Text className="font-medium text-gray-900 flex-shrink" numberOfLines={1}>{name}</Text>
        {badge ? (
          <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${badge.team ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            {badge.team ? <UsersIcon size={9} color="#047857" /> : <Lock size={9} color="#B45309" />}
            <Text className={`text-[10px] font-semibold ${badge.team ? 'text-emerald-700' : 'text-amber-700'}`}>{badge.label}</Text>
          </View>
        ) : null}
      </Pressable>
      {canManage ? (
        <View className="flex-row items-center">
          <Pressable onPress={onEdit} hitSlop={6} className="p-1.5"><Pencil size={14} color="#6B7280" /></Pressable>
          <Pressable onPress={onDelete} hitSlop={6} className="p-1.5"><Trash2 size={14} color="#EF4444" /></Pressable>
        </View>
      ) : null}
      <ChevronRight size={16} color="#D1D5DB" />
    </View>
  );
}

// All bottom sheets for the screen (actions chooser, folder form, file form,
// move picker). animationType="fade" keeps the backdrop steady.
function FileSheets({
  sheet, atHome, categoryId, folderId, categories, folders, selectedCount,
  businessId, userId, onClose, onPick, onMove, onSaved,
}: {
  sheet: NonNullable<Sheet>;
  atHome: boolean; categoryId: string | null; folderId: string | null;
  categories: FileCategory[]; folders: FileFolder[]; selectedCount: number;
  businessId: string; userId: string | null;
  onClose: () => void; onPick: (s: Sheet) => void;
  onMove: (target: { categoryId: string; folderId: string | null }) => void;
  onSaved: () => void;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.files;
  const tc = full.common;

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
  const [crumb, setCrumb] = useState<{ categoryId: string | null; folderId: string | null; label: string }>({ categoryId: null, folderId: null, label: '' });

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
  const moveSubFolders = moveAtHome ? [] : folders.filter(f => f.category_id === crumb.categoryId && f.parent_folder_id === crumb.folderId);

  return (
    <RNModal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end bg-black/40">
        <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-4 pb-8 pt-4">
          <View className="items-center mb-3"><View className="w-10 h-1 bg-gray-200 rounded-full" /></View>

          {/* Actions chooser */}
          {sheet.type === 'actions' ? (
            <View className="gap-1 pb-2">
              <Pressable onPress={() => onPick({ type: 'folder', editing: null })} className="flex-row items-center gap-3 px-3 py-4 rounded-2xl active:bg-gray-50">
                <FolderPlus size={20} color="#4F46E5" />
                <Text className="text-base font-semibold text-gray-900">{t.newFolder}</Text>
              </Pressable>
              {!atHome ? (
                <Pressable onPress={() => onPick({ type: 'file', editing: null })} className="flex-row items-center gap-3 px-3 py-4 rounded-2xl active:bg-gray-50">
                  <FilePlus2 size={20} color="#4F46E5" />
                  <Text className="text-base font-semibold text-gray-900">{t.addEntry}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Folder form */}
          {sheet.type === 'folder' ? (
            <View className="gap-4">
              <Text className="text-lg font-bold text-gray-900 px-1">{folderEditing ? tc.buttons.edit : t.newFolder}</Text>
              <Input label={t.folderNameLabel} placeholder={t.folderNamePlaceholder} value={fname} onChangeText={setFname} />
              {isCategory ? (
                <View className="flex-row items-center justify-between rounded-2xl border border-gray-200 px-4 py-3">
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-medium text-gray-700">{t.crewVisibleLabel}</Text>
                    <Text className="text-xs text-gray-400">{t.crewVisibleHint}</Text>
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
              <Text className="text-lg font-bold text-gray-900 px-1">{fileEditing ? tc.buttons.edit : t.addEntry}</Text>
              {!fileEditing ? (
                <View className="flex-row p-1 rounded-2xl bg-gray-100">
                  {(['file', 'link'] as const).map(k => (
                    <Pressable key={k} onPress={() => setKind(k)} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${kind === k ? 'bg-white' : ''}`}>
                      {k === 'file' ? <Upload size={14} color={kind === k ? '#4F46E5' : '#6B7280'} /> : <Link2 size={14} color={kind === k ? '#4F46E5' : '#6B7280'} />}
                      <Text className={`text-sm font-semibold ${kind === k ? 'text-primary' : 'text-gray-500'}`}>{k === 'file' ? t.kindFile : t.kindLink}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Input label={t.entryTitleLabel} placeholder={t.entryTitlePlaceholder} value={title} onChangeText={setTitle} />
              {!fileEditing && kind === 'file' ? (
                <Pressable onPress={pickFile} className="flex-row items-center gap-3 px-4 py-3.5 rounded-2xl border border-dashed border-gray-300">
                  <Upload size={18} color="#9CA3AF" />
                  <Text className="text-sm text-gray-600 flex-1" numberOfLines={1}>{picked ? picked.name : t.chooseFile}</Text>
                </Pressable>
              ) : (fileEditing?.kind === 'link' || (!fileEditing && kind === 'link')) ? (
                <Input label={t.linkUrlLabel} placeholder={t.linkUrlPlaceholder} value={url} onChangeText={setUrl} autoCapitalize="none" />
              ) : null}

              {/* Per-file visibility override */}
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">{t.visibilityLabel}</Text>
                <View className="flex-row p-1 rounded-2xl bg-gray-100">
                  {VIS.map(v => (
                    <Pressable key={v.key} onPress={() => setVis(v.key)} className={`flex-1 rounded-xl py-2 items-center ${vis === v.key ? 'bg-white' : ''}`}>
                      <Text className={`text-xs font-semibold ${vis === v.key ? 'text-primary' : 'text-gray-500'}`}>{v.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
              <Button onPress={saveFile} loading={saving} fullWidth>{saving && kind === 'file' && !fileEditing ? t.uploading : tc.buttons.save}</Button>
            </View>
          ) : null}

          {/* Move picker */}
          {sheet.type === 'move' ? (
            <View className="gap-4">
              <Text className="text-lg font-bold text-gray-900 px-1">{t.moveTitle}</Text>
              <View className="flex-row items-center gap-1">
                <Pressable onPress={() => setCrumb({ categoryId: null, folderId: null, label: '' })}>
                  <Text className={`text-xs ${moveAtHome ? 'text-gray-900 font-semibold' : 'text-primary'}`}>{t.title}</Text>
                </Pressable>
                {!moveAtHome ? <><ChevronRight size={12} color="#D1D5DB" /><Text className="text-xs font-semibold text-gray-900">{crumb.label}</Text></> : null}
              </View>
              <ScrollView className="max-h-72" contentContainerClassName="gap-1.5">
                {moveAtHome
                  ? categories.map(c => (
                      <Pressable key={c.id} onPress={() => setCrumb({ categoryId: c.id, folderId: null, label: c.name })} className="flex-row items-center gap-2 px-3 py-3 rounded-xl border border-gray-100">
                        <Folder size={15} color="#4F46E5" /><Text className="text-sm text-gray-900 flex-1">{c.name}</Text><ChevronRight size={15} color="#D1D5DB" />
                      </Pressable>
                    ))
                  : moveSubFolders.map(f => (
                      <Pressable key={f.id} onPress={() => setCrumb({ categoryId: f.category_id, folderId: f.id, label: f.name })} className="flex-row items-center gap-2 px-3 py-3 rounded-xl border border-gray-100">
                        <Folder size={15} color="#4F46E5" /><Text className="text-sm text-gray-900 flex-1">{f.name}</Text><ChevronRight size={15} color="#D1D5DB" />
                      </Pressable>
                    ))}
                {!moveAtHome && moveSubFolders.length === 0 ? <Text className="text-xs text-gray-400 px-1 py-2">{t.emptyFolder}</Text> : null}
              </ScrollView>
              <Button onPress={() => crumb.categoryId && onMove({ categoryId: crumb.categoryId, folderId: crumb.folderId })} disabled={moveAtHome} fullWidth>
                {`${t.moveHere} (${selectedCount})`}
              </Button>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
