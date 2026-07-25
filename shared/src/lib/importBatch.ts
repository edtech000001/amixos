import type { ImportFailedRow } from './importRunners';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface BatchInsertItem<TEntry, TMeta> {
  /** Row handed to the parent-table insert. */
  entry: TEntry;
  /** Caller context carried alongside the entry (label, rowIndex, child specs).
   *  Returned to `onInserted` with the new id so children can be attached. */
  meta: TMeta;
}

export interface BatchInsertOptions<TEntry, TMeta> {
  supabase: SupabaseLike;
  table: string;
  items: BatchInsertItem<TEntry, TMeta>[];
  /** Parent rows per multi-row insert. Kept modest (Postgres param limits). */
  chunkSize?: number;
  /** Row label for error reporting (matches the runners' failedRows shape). */
  labelOf: (meta: TMeta) => string;
  rowIndexOf?: (meta: TMeta) => number | undefined;
  /** Called once per SUCCESSFULLY inserted row, in insertion order, with the
   *  new id + its meta. Accumulate child/link rows here. */
  onInserted?: (id: string, meta: TMeta) => void;
  /** Progress callback — `done` = rows finalized so far in THIS call. Fired at
   *  each chunk boundary (matches the per-chunk cadence of the current code). */
  onProgress?: (done: number) => void;
  /** Checked at each chunk boundary; when true the loop stops and returns
   *  `aborted: true` with the partial counts already accumulated. */
  shouldAbort?: () => boolean;
}

/**
 * Batched multi-row insert with per-row error attribution — the generalized
 * form of the pattern already proven in ImportClientsModal.
 *
 * Fast path: one `insert(chunk).select('id')` per `chunkSize` rows; PostgREST
 * returns the inserted rows in insertion order, so we zip `data[j].id` back to
 * `items[j].meta` via `onInserted`. On a whole-chunk rollback (one bad row
 * fails the transaction) we retry that slice one row at a time to pinpoint and
 * report exactly the offending row, preserving today's per-row `failedRows`.
 *
 * IMPORTANT: id↔meta zipping is only valid WITHIN a single multi-row insert, so
 * we never zip across chunks.
 */
export async function batchInsert<TEntry extends Record<string, unknown>, TMeta>(
  opts: BatchInsertOptions<TEntry, TMeta>,
): Promise<{ success: number; failedRows: ImportFailedRow[]; aborted: boolean }> {
  const { supabase, table, items, labelOf, rowIndexOf, onInserted, onProgress, shouldAbort } = opts;
  const chunkSize = opts.chunkSize ?? 50;
  let success = 0;
  const failedRows: ImportFailedRow[] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    if (shouldAbort?.()) return { success, failedRows, aborted: true };
    onProgress?.(i);
    const slice = items.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(table)
      .insert(slice.map((x) => x.entry))
      .select('id');
    if (error) {
      // Whole chunk rolled back — find the bad row(s) by retrying individually.
      for (const item of slice) {
        const { data: d2, error: e2 } = await supabase
          .from(table)
          .insert(item.entry)
          .select('id')
          .single();
        if (e2) {
          failedRows.push({ label: labelOf(item.meta), reason: e2.message, rowIndex: rowIndexOf?.(item.meta) });
        } else {
          success++;
          if (d2?.id) onInserted?.(d2.id as string, item.meta);
        }
      }
    } else if (Array.isArray(data)) {
      success += slice.length;
      data.forEach((r: { id: string }, j: number) => {
        const item = slice[j];
        if (item) onInserted?.(r.id, item.meta);
      });
    }
  }
  return { success, failedRows, aborted: false };
}

/**
 * Best-effort chunked insert for child/link rows (job_assignments, job_items,
 * employee_locations, invoice_clients, …) once their parent ids are known.
 * Mirrors the client_locations write in ImportClientsModal. A failure here does
 * not roll back the already-inserted parents.
 */
export async function chunkedInsert(
  supabase: SupabaseLike,
  table: string,
  rows: Record<string, unknown>[],
  chunkSize = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await supabase.from(table).insert(rows.slice(i, i + chunkSize));
  }
}
