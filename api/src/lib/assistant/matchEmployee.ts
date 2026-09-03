// Resolve a free-text worker name to an employee id.
//
// The assistant's crew tool takes `worker_name` as required and `employee_id`
// as optional, so the model can hand back a bare name — and it routinely does.
// Those rows were written with employee_id null, which makes the worker a
// string rather than a person: no payroll hours, no crew reports, invisible to
// the job form's crew picker.
//
// Mirrors shared/src/lib/dataImport.ts:matchEmployeeId. Duplicated rather than
// imported because the api workspace deliberately does not depend on
// @amixos/shared (same convention as crewFinder.ts and operatingHours.ts). Keep
// the two in step: a change to the matching rules belongs in both.

export interface EmployeeLite {
  id: string;
  first_name: string;
  last_name?: string | null;
  check_name?: string | null;
  active?: boolean | null;
}

/** Lowercase, collapse whitespace, strip accents — so "José  Ramos" matches
 *  "Jose Ramos". */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** One candidate → that id. Several → the single ACTIVE one, else no match:
 *  linking to the wrong person is worse than leaving a name. */
function pickUnique(candidates: EmployeeLite[]): string | null {
  if (candidates.length === 1) return candidates[0].id;
  if (candidates.length > 1) {
    const active = candidates.filter(e => e.active !== false);
    if (active.length === 1) return active[0].id;
  }
  return null;
}

/**
 * Exact full name → check name → full-name prefix → first name only.
 * Ambiguity at any stage resolves to the single active candidate, or gives up.
 */
export function matchEmployeeId(name: string, employees: EmployeeLite[]): string | null {
  const target = normalizeName(name);
  if (!target) return null;

  const full = (e: EmployeeLite) => normalizeName(`${e.first_name} ${e.last_name ?? ''}`);

  const exact = employees.filter(e => full(e) === target);
  const exactPick = pickUnique(exact);
  if (exactPick) return exactPick;
  if (exact.length > 1) return null; // tie on the FULL name → do not guess

  const byCheck = pickUnique(
    employees.filter(e => e.check_name && normalizeName(e.check_name) === target),
  );
  if (byCheck) return byCheck;

  // Extra surname on either side: "Edvin Ramirez" ↔ "Edvin Ramirez Gomez".
  const byPrefix = pickUnique(
    employees.filter(e => {
      const f = full(e);
      return f.startsWith(`${target} `) || target.startsWith(`${f} `);
    }),
  );
  if (byPrefix) return byPrefix;

  // First name only — the loosest rule, so it still demands a unique winner.
  if (!target.includes(' ')) {
    return pickUnique(employees.filter(e => normalizeName(e.first_name) === target));
  }
  return null;
}
