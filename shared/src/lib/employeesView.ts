// Team (Employees) list view: sort + group, applied client-side (the roster is
// loaded whole). Persisted per device+business like the other lists' views.
// Column filters stay in the screen (they're built from the data itself).

export type EmployeeSortKey = 'name' | 'recent' | 'payRate';
export const EMPLOYEE_SORT_KEYS: EmployeeSortKey[] = ['name', 'recent', 'payRate'];
const DEFAULT_DESC: Record<EmployeeSortKey, boolean> = { name: false, recent: true, payRate: true };
export function employeeSortIsDesc(k: EmployeeSortKey, sortDesc?: boolean | null): boolean {
  return sortDesc ?? DEFAULT_DESC[k];
}
/** Caption key for the current direction (dashboard.employees.view.dir). */
export function employeeSortCaption(k: EmployeeSortKey, desc: boolean): 'az' | 'za' | 'newest' | 'oldest' | 'highest' | 'lowest' {
  if (k === 'name') return desc ? 'za' : 'az';
  if (k === 'payRate') return desc ? 'highest' : 'lowest';
  return desc ? 'newest' : 'oldest';
}

export type EmployeeGroupKey = 'none' | 'role' | 'payType';
export const EMPLOYEE_GROUP_KEYS: EmployeeGroupKey[] = ['none', 'role', 'payType'];

interface SortableEmployee {
  firstName: string;
  lastName: string;
  payRate: number;
  createdAt?: string | null;
  role: string;
  payType: string;
}

const fullName = (e: SortableEmployee) => `${e.firstName} ${e.lastName}`.trim();
const byName = (a: SortableEmployee, b: SortableEmployee) =>
  fullName(a).localeCompare(fullName(b), 'es', { sensitivity: 'base' });

export function sortEmployees<T extends SortableEmployee>(list: T[], k: EmployeeSortKey, sortDesc: boolean | null): T[] {
  const desc = employeeSortIsDesc(k, sortDesc);
  const dir = desc ? -1 : 1;
  return [...list].sort((a, b) => {
    let d = 0;
    if (k === 'payRate') d = (Number(a.payRate) || 0) - (Number(b.payRate) || 0);
    else if (k === 'recent') {
      // Missing dates sink to the bottom in either direction.
      if (!a.createdAt || !b.createdAt) return a.createdAt ? -1 : b.createdAt ? 1 : byName(a, b);
      d = a.createdAt.localeCompare(b.createdAt);
    } else d = byName(a, b);
    return d * dir || byName(a, b);
  });
}

/** Buckets in label order; rows keep the incoming (sorted) order. */
export function groupEmployees<T extends SortableEmployee>(
  list: T[],
  groupBy: EmployeeGroupKey,
  labelOf: (key: EmployeeGroupKey, value: string) => string,
): { key: string; title: string; data: T[] }[] {
  if (groupBy === 'none') return [{ key: '', title: '', data: list }];
  const m = new Map<string, T[]>();
  for (const e of list) {
    const v = groupBy === 'role' ? e.role : e.payType;
    if (!m.has(v)) m.set(v, []);
    m.get(v)!.push(e);
  }
  return Array.from(m.entries())
    .map(([v, data]) => ({ key: v, title: labelOf(groupBy, v), data }))
    .sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
}

export const EMPLOYEES_VIEW_KEY = 'amixos.employeesView.v1';
export interface EmployeesView { sortBy: EmployeeSortKey; sortDesc: boolean | null; groupBy: EmployeeGroupKey }
export function parseEmployeesView(raw: string | null | undefined): EmployeesView {
  const out: EmployeesView = { sortBy: 'name', sortDesc: null, groupBy: 'none' };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw);
    if (EMPLOYEE_SORT_KEYS.includes(o?.sortBy)) out.sortBy = o.sortBy;
    if (typeof o?.sortDesc === 'boolean') out.sortDesc = o.sortDesc;
    if (EMPLOYEE_GROUP_KEYS.includes(o?.groupBy)) out.groupBy = o.groupBy;
  } catch { /* corrupt — defaults */ }
  return out;
}
