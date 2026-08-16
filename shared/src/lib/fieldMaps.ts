// Order-insensitive equality for the per-field config maps stored in
// businesses.*_field_required / *_field_hidden (JSONB).
//
// WHY: Postgres jsonb does NOT preserve key order (keys come back sorted by
// length, then bytewise). The settings screens' dirty checks compared the
// local draft map against the refetched DB map with JSON.stringify — same
// content in a different key order read as "unsaved changes", so the Save
// button reappeared right after a successful save and users saved twice.
// Compare by truthiness per key instead: {a:true,b:true} == {b:true,a:true},
// and an absent key equals a false one (both maps treat falsy as "off").

export function sameFieldMap(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): boolean {
  const A = a ?? {};
  const B = b ?? {};
  for (const k of Object.keys(A)) if (!!A[k] !== !!B[k]) return false;
  for (const k of Object.keys(B)) if (!!A[k] !== !!B[k]) return false;
  return true;
}
