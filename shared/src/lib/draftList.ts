// Helpers for the "draft until Save" pattern used by the Settings screens.
//
// Pattern: keep two parallel arrays of the same shape — `db` is the last
// thing fetched from the DB, `local` is the user-edited working copy. All
// mutations (add / edit / delete / reorder) target `local`. The screen is
// "dirty" when `local` differs from `db`. Save() diffs them and persists
// the minimum set of writes; Discard() copies `db` back over `local`.
//
// Rows that the user added in the form get a `temp:` prefix on their id so
// we can tell them apart from rows that already exist in the DB.

export const TEMP_ID_PREFIX = 'temp:';

export function newTempId(): string {
  // crypto.randomUUID is available on web (Next 14 / modern browsers) and
  // on RN with the global polyfill (Expo 51 provides it). Fall back to a
  // timestamp+random combo if it's missing for any reason.
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return TEMP_ID_PREFIX + uuid;
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX);
}

export interface DiffResult<T> {
  inserts: T[];           // rows to INSERT (temp ids, not yet in DB)
  updates: T[];           // rows whose fields changed (still have DB id)
  deletes: string[];      // DB ids to DELETE
  orderChanged: boolean;  // true if the relative order of surviving rows differs
}

/**
 * Compare two snapshots of the same list by `id`. Equality of a single row
 * uses shallow JSON.stringify since the rows are flat data objects (no
 * functions / undefined). `compareFields` lets the caller pick which fields
 * count as a "change" — e.g. ignore server-side `created_at` / `updated_at`.
 */
export function diffById<T extends { id: string }>(
  db: T[],
  local: T[],
  opts: { compareFields?: (keyof T)[] } = {},
): DiffResult<T> {
  const dbById = new Map(db.map((r) => [r.id, r]));
  const localIds = new Set(local.map((r) => r.id));

  const inserts: T[] = [];
  const updates: T[] = [];
  for (const row of local) {
    if (isTempId(row.id)) {
      inserts.push(row);
      continue;
    }
    const original = dbById.get(row.id);
    if (!original) {
      // Edge: id looks like a DB id but isn't in db — treat as insert.
      inserts.push(row);
      continue;
    }
    if (!sameRow(original, row, opts.compareFields)) updates.push(row);
  }

  const deletes: string[] = [];
  for (const row of db) {
    if (!localIds.has(row.id)) deletes.push(row.id);
  }

  // Order differs if the sequence of surviving (non-deleted, non-inserted)
  // ids in `local` doesn't match their relative sequence in `db`.
  const survivingLocal = local
    .filter((r) => !isTempId(r.id) && dbById.has(r.id))
    .map((r) => r.id);
  const survivingDb = db.filter((r) => localIds.has(r.id)).map((r) => r.id);
  const orderChanged =
    survivingLocal.length !== survivingDb.length ||
    survivingLocal.some((id, i) => id !== survivingDb[i]);

  return { inserts, updates, deletes, orderChanged };
}

function sameRow<T>(a: T, b: T, fields?: (keyof T)[]): boolean {
  if (fields && fields.length) {
    return fields.every((k) => stableEqual(a[k], b[k]));
  }
  return stableEqual(a, b);
}

function stableEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True iff `local` is identical to `db` (no inserts/updates/deletes/reorder). */
export function isDirty<T extends { id: string }>(
  db: T[],
  local: T[],
  opts?: { compareFields?: (keyof T)[] },
): boolean {
  const d = diffById(db, local, opts);
  return (
    d.inserts.length > 0 ||
    d.updates.length > 0 ||
    d.deletes.length > 0 ||
    d.orderChanged
  );
}

/**
 * Reorder helper: move the element with `id` to `toIndex` in a new array.
 * Pure — does not mutate the input. Returns the input unchanged if the id
 * is missing or the index is out of range.
 */
export function moveItem<T extends { id: string }>(
  list: T[],
  id: string,
  toIndex: number,
): T[] {
  const fromIndex = list.findIndex((r) => r.id === id);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= list.length) return list;
  if (fromIndex === toIndex) return list;
  const next = list.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
