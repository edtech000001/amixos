// Files-module thumbnails.
//
// The grid view needs a preview per file. Supabase Storage transforms images
// but cannot rasterize a PDF, so page 1 is rendered here once with poppler's
// pdftoppm and written back to the same private bucket. `file_entries
// .thumbnail_path` is the cache: once set, nothing re-renders and every later
// view is a plain signed-URL fetch.
//
// Rendering server-side rather than in the app is deliberate, for two reasons
// that hold up: it is ONE implementation instead of a pdf.js path on web and a
// native module (plus a new dev-client build) on mobile, and it can backfill
// files uploaded long before this existed — client-side generation only ever
// helps the next upload.

import { Router } from 'express';
import { spawn } from 'child_process';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { authenticate, AuthRequest, getBusinessRole } from '../middleware/auth';
import { supabase } from '../config/supabase';

export const filesRouter = Router();
filesRouter.use(authenticate);

const BUCKET = 'business-private';
/** Long edge of the generated image. Big enough to stay sharp on a 2x grid
 *  card, small enough to stay tens of KB. */
const THUMB_PX = 480;
/** JPEG, not PNG. The render is a one-time cost; storage and egress are the
 *  recurring ones — a thumbnail is stored forever and re-fetched on every grid
 *  view. A document cover page is roughly 4-5x smaller as JPEG, and at 480px
 *  the extra compression is not visible. */
const THUMB_QUALITY = 85;
/** A PDF's cross-reference table lives at the END of the file, so page 1
 *  cannot be located without the whole document — the buffer scales with file
 *  SIZE, not page count. Matched to the upload limit (FILE_MAX_BYTES) so this
 *  is only a defensive guard: anything that got in is renderable, and there is
 *  no silent band of files that upload fine but never get a preview. */
const MAX_FETCH_BYTES = 50 * 1024 * 1024;
/** pdftoppm on a pathological document can spin; kill it rather than tie up a
 *  request slot. Renders normally finish in well under a second. */
const RENDER_TIMEOUT_MS = 20_000;

/** Only formats poppler can actually rasterize. Everything else is marked
 *  `unsupported` once, so the backfill never picks it up again. */
function isRenderable(mime: string | null, name: string | null): boolean {
  if (mime === 'application/pdf') return true;
  return !!name && name.toLowerCase().endsWith('.pdf');
}

/** Thumbnails sit beside their source file, so the storage policies that guard
 *  the original already guard the preview — no separate ACL to keep in sync. */
function thumbPathFor(storagePath: string): string {
  return `${storagePath.replace(/\.[^./]*$/, '')}.thumb.jpg`;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('render_timeout')); }, timeoutMs);
    child.stderr.on('data', d => { stderr += String(d).slice(0, 500); });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`pdftoppm_exit_${code}: ${stderr.trim()}`));
    });
  });
}

type GenResult = { status: 'ready'; path: string } | { status: 'unsupported' | 'failed'; error?: string };

/**
 * Render page 1 of one entry and store the PNG. Idempotent: an entry that
 * already has a thumbnail returns it untouched, so a duplicate request (two
 * clients opening the same folder) costs nothing.
 */
async function generateFor(entry: {
  id: string; kind: string; storage_path: string | null; mime_type: string | null;
  file_name: string | null; thumbnail_path: string | null;
}): Promise<GenResult> {
  if (entry.thumbnail_path) return { status: 'ready', path: entry.thumbnail_path };
  if (entry.kind !== 'file' || !entry.storage_path) return { status: 'unsupported' };
  if (!isRenderable(entry.mime_type, entry.file_name)) return { status: 'unsupported' };

  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(entry.storage_path);
  if (dlErr || !blob) return { status: 'failed', error: dlErr?.message ?? 'download_failed' };

  const buf = Buffer.from(await blob.arrayBuffer());
  // 'failed', not 'unsupported': oversize is a limit WE set, not a property of
  // the file. Marking it terminal would mean raising the cap later never
  // revisits these rows.
  if (buf.byteLength > MAX_FETCH_BYTES) return { status: 'failed', error: 'too_large' };

  const dir = await mkdtemp(join(tmpdir(), 'thumb-'));
  try {
    const src = join(dir, 'in.pdf');
    await writeFile(src, buf);
    // -f/-l 1 → first page only. -scale-to bounds the long edge. pdftoppm
    // appends its own page-number suffix, hence the readdir below.
    await run('pdftoppm', [
      '-jpeg', '-jpegopt', `quality=${THUMB_QUALITY}`,
      '-f', '1', '-l', '1', '-scale-to', String(THUMB_PX),
      src, join(dir, 'out'),
    ], RENDER_TIMEOUT_MS);

    const produced = (await readdir(dir)).find(f => f.startsWith('out') && f.endsWith('.jpg'));
    if (!produced) return { status: 'failed', error: 'no_output' };
    const img = await readFile(join(dir, produced));

    const path = thumbPathFor(entry.storage_path);
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, img, { contentType: 'image/jpeg', upsert: true });
    if (upErr) return { status: 'failed', error: upErr.message };
    return { status: 'ready', path };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : 'render_failed' };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Write the outcome back. `failed` keeps the row eligible for a later retry;
 *  `unsupported` is terminal so the backfill stops reconsidering it. */
async function record(id: string, result: GenResult): Promise<void> {
  await supabase.from('file_entries').update(
    result.status === 'ready'
      ? { thumbnail_path: result.path, thumbnail_status: 'ready' }
      : { thumbnail_status: result.status },
  ).eq('id', id);
}

async function loadEntry(id: string) {
  const { data } = await supabase
    .from('file_entries')
    .select('id, business_id, kind, storage_path, mime_type, file_name, thumbnail_path')
    .eq('id', id)
    .single();
  return data as (null | {
    id: string; business_id: string; kind: string; storage_path: string | null;
    mime_type: string | null; file_name: string | null; thumbnail_path: string | null;
  });
}

/**
 * POST /api/v1/files/:id/thumbnail
 * Generate (or return the cached) thumbnail for one file. Called
 * fire-and-forget by the client right after an upload.
 */
filesRouter.post('/:id/thumbnail', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const entry = await loadEntry(String(req.params.id));
  if (!entry) return res.status(404).json({ success: false, message: 'not_found' });

  // Authorize against the file's OWN business, taken from the row rather than
  // the request — a caller must not be able to name someone else's business_id
  // and have it checked instead.
  const role = await getBusinessRole(userId, entry.business_id);
  if (!role) return res.status(403).json({ success: false, message: 'forbidden' });

  const result = await generateFor(entry);
  await record(entry.id, result);
  return res.json({ success: true, status: result.status, path: result.status === 'ready' ? result.path : null });
});

/**
 * POST /api/v1/files/thumbnails/backfill  { business_id, limit? }
 * Drains the queue of existing files that predate thumbnails. Bounded per call
 * so one request cannot run for minutes; the client repeats while `remaining`
 * is above zero.
 */
filesRouter.post('/thumbnails/backfill', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const businessId = String(req.body?.business_id ?? '');
  if (!businessId) return res.status(400).json({ success: false, message: 'business_id required' });
  const role = await getBusinessRole(userId, businessId);
  if (!role) return res.status(403).json({ success: false, message: 'forbidden' });

  const limit = Math.min(Math.max(Number(req.body?.limit) || 10, 1), 25);
  // Failed rows are skipped by default so a permanently broken file cannot
  // stall the queue forever, and included on request — that is what makes
  // 'failed' genuinely retryable rather than terminal in practice.
  const retryFailed = req.body?.retry_failed === true;
  const statusFilter = retryFailed
    ? 'thumbnail_status.is.null,thumbnail_status.eq.pending,thumbnail_status.eq.failed'
    : 'thumbnail_status.is.null,thumbnail_status.eq.pending';

  const { data: rows } = await supabase
    .from('file_entries')
    .select('id, business_id, kind, storage_path, mime_type, file_name, thumbnail_path')
    .eq('business_id', businessId)
    .eq('kind', 'file')
    .is('thumbnail_path', null)
    .or(statusFilter)
    .limit(limit);

  let ready = 0, skipped = 0, failed = 0;
  // Sequential on purpose: each render spawns a process and holds the whole
  // file in memory. Doing them in parallel is how one container OOMs.
  for (const row of (rows ?? []) as Parameters<typeof generateFor>[0][]) {
    const result = await generateFor(row);
    await record(row.id, result);
    if (result.status === 'ready') ready++;
    else if (result.status === 'unsupported') skipped++;
    else failed++;
  }

  const { count } = await supabase
    .from('file_entries')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('kind', 'file')
    .is('thumbnail_path', null)
    .or(statusFilter);

  return res.json({ success: true, processed: rows?.length ?? 0, ready, skipped, failed, remaining: count ?? 0 });
});
