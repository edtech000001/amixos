// Shared types + helpers for the Files module (Google-Drive-style library).
//
// Structure: top-level folders (`file_categories`, which carry the Team/Office
// visibility default) contain arbitrarily-nested `file_folders`, with files
// (`file_entries`) living at any level. An entry is an uploaded file
// (storage_path) or an external link (url). See 053 + 054 migrations.
//
// Visibility: the top-level folder sets the default (crew_visible); a file may
// override its own (file_entries.crew_visible: null = inherit, true = Team,
// false = Office). Access control stays a single join to file_categories.
//
// Storage layout (same bucket as job/equipment photos + logos):
//   files/<business_id>/<uuid>/<filename>

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './supabaseFetch';

// Top-level folder. Still named `file_categories` in the DB; it's the
// visibility root of a tree.
export interface FileCategory {
  id: string;
  business_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  crew_visible: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Nestable folder inside a top-level folder. parent_folder_id null = a root
// folder directly under the category.
export interface FileFolder {
  id: string;
  business_id: string;
  category_id: string;
  parent_folder_id: string | null;
  name: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

export type FileEntryKind = 'file' | 'link';

export interface FileEntry {
  id: string;
  business_id: string;
  category_id: string | null;
  folder_id: string | null; // null = at the category root (no subfolder)
  title: string;
  kind: FileEntryKind;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  url: string | null;
  // null = inherit the category default; true = Team; false = Office.
  crew_visible: boolean | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

// Private bucket (migration 066). Reads go through signed URLs — see
// signedUrl()/useSignedUrl() in ./storageUrls. There is intentionally no
// public-URL helper here anymore: getPublicUrl on a private bucket is dead.
export const FILES_BUCKET = 'business-private';

export const FILE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export function fileStoragePath(businessId: string, folderId: string, filename: string): string {
  return `files/${businessId}/${folderId}/${filename}`;
}

export function fileUid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Best-effort size/type label, e.g. "PDF · 1.2 MB" or the link label. */
export function fileMeta(entry: FileEntry, linkLabel: string): string {
  if (entry.kind === 'link') return linkLabel;
  const parts: string[] = [];
  const ext = entry.file_name?.split('.').pop();
  if (ext) parts.push(ext.toUpperCase());
  if (entry.file_size) {
    const mb = entry.file_size / (1024 * 1024);
    parts.push(mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(entry.file_size / 1024))} KB`);
  }
  return parts.join(' · ');
}

/**
 * Effective Team-visibility of a file: its own override if set, else the
 * top-level folder's default. Used for the per-file lock badge.
 */
export function fileIsCrewVisible(entry: FileEntry, categoryCrewVisible: boolean): boolean {
  return entry.crew_visible == null ? categoryCrewVisible : entry.crew_visible;
}

export interface FilesTree {
  categories: FileCategory[];
  folders: FileFolder[];
  entries: FileEntry[];
}

/** Load the whole library for a business in three paginated reads. */
export async function fetchFilesTree(
  supabase: SupabaseClient,
  businessId: string,
): Promise<FilesTree> {
  const [categories, folders, entries] = await Promise.all([
    fetchAll<FileCategory>((from, to) =>
      supabase.from('file_categories').select('*')
        .eq('business_id', businessId).order('sort_order').order('name').range(from, to)),
    fetchAll<FileFolder>((from, to) =>
      supabase.from('file_folders').select('*')
        .eq('business_id', businessId).order('sort_order').order('name').range(from, to)),
    fetchAll<FileEntry>((from, to) =>
      supabase.from('file_entries').select('*')
        .eq('business_id', businessId).order('sort_order').order('created_at').range(from, to)),
  ]);
  return { categories, folders, entries };
}
