#!/usr/bin/env node
/**
 * Storage half of the Archivos clone. Run AFTER clone_files_module.sql.
 *
 * The SQL mirrors the database rows and rewrites every path from
 * files/<source>/ to files/<target>/. It cannot move bytes, so until this runs
 * the target's rows point at objects that do not exist yet — files fail to open
 * and covers fall back to icons.
 *
 * MIRROR, NOT MERGE — same contract as the SQL. The target's prefix is deleted
 * first, then the source is copied over it. That is what makes re-running safe:
 * without the delete, every run would leave the previous copy behind as
 * orphaned objects nobody can find, since the DB rows that referenced them were
 * already replaced.
 *
 * Objects are copied server-side (storage.copy) rather than downloaded and
 * re-uploaded, so nothing streams through this machine.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node supabase/scripts/copy_files_storage.mjs <source-business-id> <target-business-id> [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'business-private';
/** Generated page-1 thumbnails. Deliberately NOT copied: the SQL nulls
 *  thumbnail_path for generated ones so the target re-renders its own, which
 *  means a copied .thumb.jpg would be an orphan the moment it lands. */
const SKIP_SUFFIX = '.thumb.jpg';

const [, , source, target, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');

if (!source || !target) {
  console.error('Usage: node copy_files_storage.mjs <source-business-id> <target-business-id> [--dry-run]');
  process.exit(1);
}
if (source === target) {
  console.error('source and target must differ');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/**
 * Every object under a prefix. Storage's list() is one level deep and returns
 * folders as entries with no id, so this recurses. It also pages: the default
 * limit would silently truncate a business with a lot of files.
 */
async function listAll(prefix) {
  const out = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    if (!data?.length) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // No id => a folder placeholder, not an object.
      if (entry.id) out.push(path);
      else out.push(...await listAll(path));
    }
    if (data.length < pageSize) break;
  }
  return out;
}

async function main() {
  const srcPrefix = `files/${source}`;
  const tgtPrefix = `files/${target}`;

  console.log(`Source: ${srcPrefix}\nTarget: ${tgtPrefix}${dryRun ? '\n(dry run — nothing will be written)' : ''}\n`);

  const existing = await listAll(tgtPrefix);
  console.log(`Target currently holds ${existing.length} object(s).`);
  if (existing.length && !dryRun) {
    // Batched: remove() takes a list, and one call with thousands of paths is
    // rejected. 100 at a time keeps each request small.
    for (let i = 0; i < existing.length; i += 100) {
      const batch = existing.slice(i, i + 100);
      const { error } = await supabase.storage.from(BUCKET).remove(batch);
      if (error) throw new Error(`remove: ${error.message}`);
    }
    console.log(`Cleared ${existing.length} object(s) from the target.`);
  }

  const sourceObjects = (await listAll(srcPrefix)).filter(p => !p.endsWith(SKIP_SUFFIX));
  console.log(`Source holds ${sourceObjects.length} object(s) to copy (thumbnails skipped).`);

  let copied = 0;
  const failures = [];
  for (const from of sourceObjects) {
    const to = `${tgtPrefix}${from.slice(srcPrefix.length)}`;
    if (dryRun) { copied++; continue; }
    // Server-side copy: the bytes never travel through this machine.
    const { error } = await supabase.storage.from(BUCKET).copy(from, to);
    if (error) failures.push(`${from} -> ${to}: ${error.message}`);
    else copied++;
    if (copied % 25 === 0) console.log(`  ${copied}/${sourceObjects.length}`);
  }

  console.log(`\nCopied ${copied}/${sourceObjects.length} object(s).`);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    failures.forEach(f => console.error('  ' + f));
    // Non-zero so a wrapper script cannot mistake a partial copy for success.
    process.exit(1);
  }
  console.log('Done. Covers and uploaded files should now resolve for the target.');
}

main().catch(err => {
  console.error(err.message ?? err);
  process.exit(1);
});
