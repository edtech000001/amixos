// One-time relocation: move sensitive uploads (files / job photos / equipment
// photos) out of the PUBLIC `business-assets` bucket into the PRIVATE
// `business-private` bucket created by migration 066. Logos stay where they are.
//
// Run with the API's env (service-role key — bypasses RLS). Two phases:
//
//   node scripts/migrate-assets-to-private.mjs copy
//       Copies every object to business-private. Idempotent (upsert). After
//       this, objects exist in BOTH buckets — safe to deploy the new app build
//       that reads from business-private.
//
//   node scripts/migrate-assets-to-private.mjs cleanup
//       For each object confirmed present in business-private, DELETES the
//       original from the public business-assets bucket. This is what actually
//       removes the public exposure. Run only AFTER the new build is live.
//
//   node scripts/migrate-assets-to-private.mjs verify
//       Reports how many objects are present in each bucket (no writes).
//
// The authoritative list of paths comes from the DB tables (file_entries,
// job_photos, equipment_photos), not a recursive storage list.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SRC = 'business-assets';
const DST = 'business-private';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const mode = (process.argv[2] || 'copy').toLowerCase();
if (!['copy', 'cleanup', 'verify'].includes(mode)) {
  console.error(`Unknown mode "${mode}". Use: copy | cleanup | verify`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Collect every sensitive object path from the DB (paginated, service-role
// bypasses RLS). Only file_entries of kind 'file' have a storage_path.
async function collectPaths() {
  const sources = [
    { table: 'file_entries', kindFile: true },
    { table: 'job_photos', kindFile: false },
    { table: 'equipment_photos', kindFile: false },
  ];
  const paths = new Set();
  for (const { table, kindFile } of sources) {
    for (let from = 0; ; from += 1000) {
      let q = supabase.from(table).select('storage_path').range(from, from + 999);
      if (kindFile) q = q.eq('kind', 'file');
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      if (!data?.length) break;
      for (const r of data) if (r.storage_path) paths.add(r.storage_path);
      if (data.length < 1000) break;
    }
  }
  return [...paths];
}

// Authoritative existence check: createSignedUrl resolves against the storage
// DB (storage.objects), so it reflects a delete immediately. download() would
// instead hit the public CDN for a public bucket and return stale/cached bytes
// for an already-deleted object, giving a false positive.
async function existsIn(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  return !error && !!data?.signedUrl;
}

async function run() {
  console.log(`Mode: ${mode}  (${SRC} → ${DST})`);
  const paths = await collectPaths();
  console.log(`Found ${paths.length} sensitive object(s) referenced in the DB.\n`);

  let copied = 0, removed = 0, missingSrc = 0, missingDst = 0, failed = 0, srcPresent = 0, dstPresent = 0;

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    try {
      if (mode === 'copy') {
        const { data: blob, error } = await supabase.storage.from(SRC).download(path);
        if (error || !blob) { missingSrc++; continue; }
        const buf = Buffer.from(await blob.arrayBuffer());
        const { error: upErr } = await supabase.storage
          .from(DST)
          .upload(path, buf, { upsert: true, contentType: blob.type || undefined });
        if (upErr) { failed++; console.warn(`  ! upload ${path}: ${upErr.message}`); }
        else copied++;
      } else if (mode === 'cleanup') {
        // Only delete the public original once the private copy is confirmed.
        if (!(await existsIn(DST, path))) { missingDst++; console.warn(`  ! not in ${DST}, skipping delete: ${path}`); continue; }
        const { error: rmErr } = await supabase.storage.from(SRC).remove([path]);
        if (rmErr) { failed++; console.warn(`  ! remove ${path}: ${rmErr.message}`); }
        else removed++;
      } else {
        // verify
        if (await existsIn(SRC, path)) srcPresent++;
        if (await existsIn(DST, path)) dstPresent++;
      }
    } catch (e) {
      failed++;
      console.warn(`  ! ${path}: ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 25 === 0) console.log(`  …${i + 1}/${paths.length}`);
  }

  console.log('\nDone.');
  if (mode === 'copy') console.log(`  copied=${copied}  missing_in_source=${missingSrc}  failed=${failed}`);
  if (mode === 'cleanup') console.log(`  removed_from_public=${removed}  not_yet_in_private=${missingDst}  failed=${failed}`);
  if (mode === 'verify') console.log(`  in_public(${SRC})=${srcPresent}  in_private(${DST})=${dstPresent}  of ${paths.length}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
