// Resolve auth user ids → display names for "created by / edited by" lines.
// Resolution order per user: employee first+last name (linked by user_id) →
// membership display_name (auth metadata) → email. Users who left the
// business simply don't resolve (callers render nothing for them).

import { fetchAll } from './supabaseFetch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export async function memberNameMap(
  supabase: AnySupabase,
  businessId: string,
): Promise<Record<string, string>> {
  const [{ data: members }, employees] = await Promise.all([
    supabase.rpc('list_business_members', { b_id: businessId }),
    // employees_roster (view, migration 178): names-only, readable by every
    // member — so roles without the Employees permission still resolve names.
    fetchAll<{ user_id: string; first_name: string | null; last_name: string | null }>((from, to) =>
      supabase
        .from('employees_roster')
        .select('user_id, first_name, last_name')
        .eq('business_id', businessId)
        .not('user_id', 'is', null)
        .range(from, to),
    ).catch(() => [] as { user_id: string; first_name: string | null; last_name: string | null }[]),
  ]);

  const empName: Record<string, string> = {};
  for (const e of employees) {
    const name = `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim();
    if (e.user_id && name) empName[e.user_id] = name;
  }

  // Email-derived fallbacks read poorly on "created by" lines
  // ("thepivotbuilders.construction") — prettify: local part, separators to
  // spaces, words capitalized ("Thepivotbuilders Construction").
  const prettify = (raw: string): string => {
    const local = raw.split('@')[0] ?? raw;
    return local
      .split(/[._\-+]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const map: Record<string, string> = { ...empName };
  for (const m of (members ?? []) as { user_id: string; email: string | null; display_name: string | null }[]) {
    if (!m.user_id) continue;
    const display = m.display_name?.trim() ?? '';
    // Auth display names often ARE the email local part (signup default) —
    // treat those as email-ish and prettify them too.
    const label =
      empName[m.user_id] ||
      (display && !/^[\w.+-]+$/.test(display) ? display : '') ||
      prettify(display || m.email || '');
    if (label) map[m.user_id] = label;
  }
  return map;
}
