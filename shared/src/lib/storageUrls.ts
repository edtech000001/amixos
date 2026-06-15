// Signed-URL helpers for the PRIVATE `business-private` bucket (migration 066).
//
// Files, job photos, and equipment photos live in a private bucket and are NOT
// publicly readable — every read is a short-lived signed URL minted for an
// authenticated member (RLS checks membership on createSignedUrl). Logos are
// the exception: they stay in the public `business-assets` bucket and keep
// using getPublicUrl, because they render on the public invoice pages.
//
// Use the hooks in components (they resolve URLs into state and re-sign when
// the path changes); use signedUrl/signedUrls for imperative cases (e.g.
// opening a file on click).

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The private bucket holding all non-logo uploads. */
export const PRIVATE_ASSETS_BUCKET = 'business-private';

/** The public bucket holding business logos (rendered on public invoice pages). */
export const PUBLIC_ASSETS_BUCKET = 'business-assets';

/**
 * Extract the in-bucket object path from a public getPublicUrl() string, e.g.
 * ".../object/public/business-assets/logos/abc-123.png" → "logos/abc-123.png".
 * Returns null when the URL is empty or doesn't belong to the given bucket.
 * Used to delete a logo object given only its stored public URL.
 */
export function pathFromPublicUrl(
  url: string | null | undefined,
  bucket: string = PUBLIC_ASSETS_BUCKET,
): string | null {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rest = url.slice(idx + marker.length).split('?')[0];
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/** Default signed-URL lifetime. Long enough for a viewing session, short
 *  enough that a leaked URL expires quickly. */
export const SIGNED_URL_TTL = 60 * 60; // 1 hour, seconds

/** Sign a single storage path. Returns null for empty paths or on error. */
export async function signedUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  ttl: number = SIGNED_URL_TTL,
  bucket: string = PRIVATE_ASSETS_BUCKET,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Batch-sign many paths in one request. Returns a path → URL map (missing or
 *  failed paths are simply absent from the map). */
export async function signedUrls(
  supabase: SupabaseClient,
  paths: Array<string | null | undefined>,
  ttl: number = SIGNED_URL_TTL,
  bucket: string = PRIVATE_ASSETS_BUCKET,
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)));
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, ttl);
  const out: Record<string, string> = {};
  if (!error && data) {
    for (const row of data) {
      if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
    }
  }
  return out;
}

/** Resolve one signed URL into state; re-signs when the path changes. */
export function useSignedUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  ttl: number = SIGNED_URL_TTL,
  bucket: string = PRIVATE_ASSETS_BUCKET,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    signedUrl(supabase, path, ttl, bucket).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, path, ttl, bucket]);
  return url;
}

/** Resolve a list of signed URLs into a path → URL map for rendering grids. */
export function useSignedUrls(
  supabase: SupabaseClient,
  paths: Array<string | null | undefined>,
  ttl: number = SIGNED_URL_TTL,
  bucket: string = PRIVATE_ASSETS_BUCKET,
): Record<string, string> {
  // Stable dependency key so the effect only re-runs when the set changes.
  const key = Array.from(new Set(paths.filter((p): p is string => !!p))).sort().join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setUrls({});
      return;
    }
    signedUrls(supabase, key.split('|'), ttl, bucket).then((m) => {
      if (!cancelled) setUrls(m);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, key, ttl, bucket]);
  return urls;
}
