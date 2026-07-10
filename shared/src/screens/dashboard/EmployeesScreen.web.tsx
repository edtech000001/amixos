'use client';

// Web-only EmployeesScreen — plain HTML + Tailwind (see ClientsListScreen.web
// for the rationale: shared RN screens render unstyled on web). Same exported
// API as EmployeesScreen.tsx so the web page wrapper is untouched and the
// bundler resolves this .web.tsx variant automatically.

import { useMemo, useState, type ReactNode } from 'react';
import {
  Plus,
  Clock,
  ClipboardList,
  UserCheck,
  DollarSign, Search, X, SlidersHorizontal, ChevronDown, Check } from 'lucide-react';
import { useLang } from '../../i18n';
import { ROLE_LABELS } from '../../lib/permissions';
import type { AccessStatus } from '../../lib/teamPeople';
import { splitMultiValue } from '../../lib/fieldTemplates';

export interface EmployeeListItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  payType: string;
  payRate: number;
  active: boolean;
  /** App-access status (Phase 1 merge of Empleados + Equipo). Undefined = unknown. */
  access?: AccessStatus;
  /** Extra searchable text built by the caller: every field value + semantic
   *  keywords (overtime/acceso/inactivo…), so "overtime" finds eligible
   *  workers and "acceso" finds everyone with an app account. */
  searchExtra?: string;
  /** Hourly + eligible → overtime facet in the filter panel. */
  overtimeEligible?: boolean;
  city?: string | null;
  state?: string | null;
  /** Raw custom_fields (field_key → value). Which keys become filter
   *  columns is decided by customFieldDefs — stale keys from deleted
   *  fields are ignored. */
  customFields?: Record<string, string>;
}

/** A filterable column: pick the field, then check the values you want. */
interface FilterField {
  key: string;
  label: string;
  get: (e: EmployeeListItem) => string;
  labelOf: (v: string) => string;
  /** Multi-select custom fields store "A, B" — split into individual options. */
  split?: boolean;
}

/** A custom-field definition from Ajustes → Equipo (key → display label). */
export interface CustomFieldDef {
  key: string;
  label: string;
  multi?: boolean;
  /** Boolean fields store "true"/"false" — display as Sí/No. */
  boolean?: boolean;
}

export interface TimesheetListItem {
  id: string;
  workerName: string | null;
  workDate: string;
  hoursWorked: number | null;
  jobDescription: string | null;
  employeeId: string | null;
}

export interface EmployeesScreenProps {
  employees: EmployeeListItem[];
  timesheets: TimesheetListItem[];
  onAddEmployee: () => void;
  onEditEmployee: (id: string) => void;
  onToggleActive: (id: string) => void;
  onLogHours: () => void;
  /** Optional slot for modals/dialogs rendered on web. */
  modalsSlot?: ReactNode;
  /** Custom-field definitions (from employee_field_templates) — drive the
   *  filter panel so deleted fields never appear and labels are the real
   *  field names, not the snake_case keys. */
  customFieldDefs?: CustomFieldDef[];
}

type Tab = 'empleados' | 'horas' | 'nomina';

export function EmployeesScreen({
  employees,
  timesheets,
  onAddEmployee,
  onEditEmployee,
  onToggleActive,
  onLogHours,
  customFieldDefs,
  modalsSlot,
}: EmployeesScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.employees;
  const teamT = full.dashboard.settings.team;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';
  const dateLocale = full.dashboard.dateLocale;
  const [tab, setTab] = useState<Tab>('empleados');
  const [search, setSearch] = useState('');
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Column-value filters (AppSheet-style): pick a field, then check the
  // values you want. Values come from the data itself, so custom fields and
  // any set of options work without hardcoding. AND across fields, OR within.
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSel, setFilterSel] = useState<Record<string, string[]>>({});
  const [openField, setOpenField] = useState<string | null>(null);
  const [valueSearch, setValueSearch] = useState('');
  const filtersActive = Object.values(filterSel).some(v => v.length > 0);
  const clearFilters = () => setFilterSel({});
  const toggleFilterValue = (fieldKey: string, v: string) =>
    setFilterSel(prev => {
      const cur = prev[fieldKey] ?? [];
      return { ...prev, [fieldKey]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] };
    });

  const ROLES: Record<string, string> = {
    owner: t.roles.owner,
    manager: t.roles.manager,
    worker: t.roles.worker,
  };
  const PAY_TYPES: Record<string, string> = {
    hourly: t.payTypes.hourly,
    salary: t.payTypes.salary,
    daily: t.payTypes.daily,
  };
  const PAY_UNIT_SHORT: Record<string, string> = {
    hourly: t.payRateUnitShort.hourly,
    salary: t.payRateUnitShort.salary,
    daily: t.payRateUnitShort.daily,
  };

  const filterFields = useMemo<FilterField[]>(() => {
    const id = (v: string) => v;
    const fields: FilterField[] = [
      { key: 'status', label: t.filter.status, get: e => (e.active ? 'active' : 'inactive'), labelOf: v => (v === 'active' ? t.filter.active : t.filter.inactive) },
      { key: 'role', label: t.filter.role, get: e => e.role, labelOf: v => ROLES[v] ?? v },
      { key: 'access', label: t.filter.access, get: e => (e.access?.kind === 'active' ? 'yes' : e.access?.kind === 'invited' ? 'invited' : 'no'), labelOf: v => (v === 'yes' ? t.filter.accessYes : v === 'invited' ? t.filter.accessInvited : t.filter.accessNo) },
      { key: 'payType', label: t.filter.payType, get: e => e.payType, labelOf: v => PAY_TYPES[v] ?? v },
      { key: 'overtime', label: t.filter.overtime, get: e => (e.overtimeEligible ? 'yes' : 'no'), labelOf: v => (v === 'yes' ? t.filter.yes : t.filter.no) },
      { key: 'city', label: t.filter.city, get: e => (e.city ?? '').trim(), labelOf: id },
      { key: 'state', label: t.filter.state, get: e => (e.state ?? '').trim(), labelOf: id },
    ];
    (customFieldDefs ?? []).forEach(d => fields.push({
      key: `cf:${d.key}`,
      label: d.label,
      get: e => String(e.customFields?.[d.key] ?? '').trim(),
      labelOf: d.boolean ? v => (v === 'true' ? t.filter.yes : v === 'false' ? t.filter.no : v) : id,
      split: d.multi,
    }));
    return fields;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFieldDefs, t]);

  /** One employee's value(s) for a field — multi-selects split into options. */
  const partsOf = (f: FilterField, e: EmployeeListItem): string[] => {
    const v = f.get(e);
    const parts = f.split ? splitMultiValue(v) : v ? [v] : [];
    return parts.length ? parts : [''];
  };

  /** Distinct values + row counts for one field, blanks last. */
  const valueCounts = (f: FilterField): [string, number][] => {
    const m = new Map<string, number>();
    employees.forEach(e => partsOf(f, e).forEach(v => m.set(v, (m.get(v) ?? 0) + 1)));
    return Array.from(m.entries()).sort((a, b) =>
      a[0] === '' ? 1 : b[0] === '' ? -1 : f.labelOf(a[0]).localeCompare(f.labelOf(b[0])));
  };

  const filteredEmployees = useMemo(() => {
    const q = norm(search.trim());
    return employees.filter(e => {
      if (q && !norm(`${e.firstName} ${e.lastName} ${e.phone ?? ''} ${e.searchExtra ?? ''}`).includes(q)) return false;
      for (const f of filterFields) {
        const sel = filterSel[f.key];
        if (sel?.length && !partsOf(f, e).some(v => sel.includes(v))) return false;
      }
      return true;
    });
  }, [employees, search, filterFields, filterSel]);

  const activeCount = employees.filter(e => e.active).length;
  const totalHoursThisWeek = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return timesheets
      .filter(ts => new Date(ts.workDate) >= start)
      .reduce((s, ts) => s + (ts.hoursWorked ?? 0), 0);
  }, [timesheets]);

  const payrollRows = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthSheets = timesheets.filter(ts => new Date(ts.workDate) >= startMonth);
    const byWorker: Record<string, { hours: number; emp?: EmployeeListItem }> = {};
    monthSheets.forEach(ts => {
      const key = ts.workerName ?? t.payroll.unknownWorker;
      if (!byWorker[key])
        byWorker[key] = { hours: 0, emp: employees.find(e => e.id === ts.employeeId) };
      byWorker[key].hours += ts.hoursWorked ?? 0;
    });
    return Object.entries(byWorker);
  }, [timesheets, employees, t.payroll.unknownWorker]);

  const payrollMonth = new Date().toLocaleDateString(dateLocale, {
    month: 'long',
    year: 'numeric',
  });
  const payrollTotal = payrollRows.reduce((s, [, { hours, emp }]) => {
    const rate = emp?.payRate ?? 0;
    const pt = emp?.payType ?? 'hourly';
    return s + (pt === 'hourly' ? hours * rate : pt === 'daily' ? Math.ceil(hours / 8) * rate : rate);
  }, 0);

  return (
    <div className="px-6 lg:px-8 pt-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t.summary
              .replace('{{active}}', String(activeCount))
              .replace('{{hours}}', String(totalHoursThisWeek))}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLogHours}
            className="flex items-center gap-1.5 bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Clock size={15} className="text-gray-700" />
            {t.logHours}
          </button>
          <button
            type="button"
            onClick={onAddEmployee}
            className="flex items-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={15} className="text-white" />
            {t.addBtn}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
        {(['empleados', 'horas', 'nomina'] as const).map(tabKey => (
          <button
            type="button"
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              tab === tabKey ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.tabs[tabKey]}
          </button>
        ))}
      </div>

      {tab === 'empleados' ? (
        <>
        <div className="flex items-start gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.teamSearchPlaceholder}
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-10 py-2.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          ) : null}
        </div>
        {/* Column filters — facet chips in a dropdown (like Group menus). */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setFilterOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold shadow-sm transition-colors ${
              filtersActive ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={15} /> {t.filter.button}
          </button>
          {filterOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-80 bg-white rounded-2xl border border-gray-100 shadow-lg py-2 max-h-[28rem] overflow-y-auto">
                {filterFields.map(f => {
                  const sel = filterSel[f.key] ?? [];
                  const open = openField === f.key;
                  const values = open ? valueCounts(f) : [];
                  const vq = norm(valueSearch.trim());
                  const shown = vq
                    ? values.filter(([v]) => norm(v === '' ? t.filter.empty : f.labelOf(v)).includes(vq))
                    : values;
                  return (
                    <div key={f.key} className="border-b border-gray-50 last:border-0">
                      <button
                        type="button"
                        onClick={() => { setOpenField(open ? null : f.key); setValueSearch(''); }}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <span className="flex items-center gap-2">
                          {f.label}
                          {sel.length ? (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold inline-flex items-center justify-center">
                              {sel.length}
                            </span>
                          ) : null}
                        </span>
                        <ChevronDown size={15} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open ? (
                        <div className="px-2 pb-2">
                          {values.length > 8 ? (
                            <input
                              value={valueSearch}
                              onChange={ev => setValueSearch(ev.target.value)}
                              placeholder={t.filter.searchValue}
                              className="w-full mb-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          ) : null}
                          <div className="max-h-52 overflow-y-auto">
                            {shown.map(([v, count]) => {
                              const on = sel.includes(v);
                              return (
                                <button
                                  key={v || '(empty)'}
                                  type="button"
                                  onClick={() => toggleFilterValue(f.key, v)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-gray-50 text-left"
                                >
                                  <span className={`w-4 h-4 rounded border inline-flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}`}>
                                    {on ? <Check size={11} className="text-white" /> : null}
                                  </span>
                                  <span className={`flex-1 truncate ${v === '' ? 'italic text-gray-400' : 'text-gray-700'}`}>
                                    {v === '' ? t.filter.empty : f.labelOf(v)}
                                  </span>
                                  <span className="text-xs text-gray-400">{count}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {filtersActive ? (
                  <div className="px-2 pt-2">
                    <button type="button" onClick={clearFilters} className="w-full py-2 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200">
                      {t.filter.clear}
                    </button>
                  </div>
                ) : null}              </div>
            </>
          ) : null}
        </div>
        </div>
        {employees.length === 0 ? (
          <div className="flex flex-col items-center py-20">
            <UserCheck size={40} className="text-gray-300" />
            <p className="text-sm text-gray-400 mt-3">{t.emptyEmployees}</p>
            <button type="button" onClick={onAddEmployee} className="text-primary text-sm font-medium mt-1 hover:underline">
              {t.addFirst}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {filteredEmployees.map((e, i) => {
              // App-access / inactive badges — rendered in their own column on
              // wide windows, under the name on small ones.
              const badges = (!e.active || e.access?.kind === 'active' || e.access?.kind === 'invited') ? (
                <>
                  {!e.active ? (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-400">
                      {t.inactiveBadge}
                    </span>
                  ) : null}
                  {e.access?.kind === 'active' ? (
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {ROLE_LABELS[e.access.role][lang]}
                    </span>
                  ) : e.access?.kind === 'invited' ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-xs font-semibold text-amber-700">
                      {teamT.pendingBadge}
                    </span>
                  ) : null}
                </>
              ) : null;
              return (
              <button
                type="button"
                key={e.id}
                onClick={() => onEditEmployee(e.id)}
                className={`w-full text-left flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors ${
                  i < filteredEmployees.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    e.active ? 'bg-primary/10' : 'bg-gray-100'
                  }`}
                >
                  <span className={`text-sm font-semibold ${e.active ? 'text-primary' : 'text-gray-400'}`}>
                    {e.firstName.charAt(0)}{e.lastName.charAt(0)}
                  </span>
                </div>
                {/* Name (flex) | role | pay | phone | badges — aligned columns
                   that collapse back under the name on narrow windows. */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 break-words">
                    {e.firstName} {e.lastName}
                  </p>
                  {badges ? <div className="md:hidden flex flex-wrap items-center gap-1.5 mt-1">{badges}</div> : null}
                  <p className="md:hidden text-xs text-gray-400 mt-1 truncate">
                    {ROLES[e.role] ?? e.role} · {PAY_TYPES[e.payType]} ${e.payRate.toFixed(2)}
                    {e.phone ? ` · ${e.phone}` : ''}
                  </p>
                </div>
                <span className="hidden md:block w-40 shrink-0 text-sm text-gray-600 truncate">
                  {ROLES[e.role] ?? e.role}
                </span>
                <span className="hidden md:block w-44 shrink-0 text-xs text-gray-500">
                  {PAY_TYPES[e.payType]} ${e.payRate.toFixed(2)}
                </span>
                <span className="hidden lg:block w-40 shrink-0 text-xs text-gray-400 truncate">
                  {e.phone ?? ''}
                </span>
                <span className="hidden md:flex w-40 shrink-0 flex-wrap items-center gap-1.5">
                  {badges}
                </span>
              </button>
              );
            })}
          </div>
        )}
        </>
      ) : tab === 'horas' ? (
        timesheets.length === 0 ? (
          <div className="flex flex-col items-center py-20">
            <ClipboardList size={40} className="text-gray-300" />
            <p className="text-sm text-gray-400 mt-3">{t.emptyTimesheets}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex px-5 py-3 border-b border-gray-50">
              <span className="flex-1 text-xs font-semibold text-gray-400 uppercase">{t.timesheetCols.worker}</span>
              <span className="w-24 text-xs font-semibold text-gray-400 uppercase text-center">{t.timesheetCols.date}</span>
              <span className="w-16 text-xs font-semibold text-gray-400 uppercase text-center">{t.timesheetCols.hours}</span>
              <span className="w-40 text-xs font-semibold text-gray-400 uppercase">{t.timesheetCols.work}</span>
            </div>
            {timesheets.map((ts, i) => (
              <div
                key={ts.id}
                className={`flex items-center px-5 py-3 ${i < timesheets.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <span className="flex-1 text-sm text-gray-900 font-medium truncate">{ts.workerName ?? '—'}</span>
                <span className="w-24 text-xs text-gray-500 text-center">
                  {new Date(ts.workDate).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                </span>
                <span className="w-16 text-sm font-semibold text-gray-900 text-center">{ts.hoursWorked ?? '—'}</span>
                <span className="w-40 text-xs text-gray-400 truncate">{ts.jobDescription ?? '—'}</span>
              </div>
            ))}
          </div>
        )
      ) : payrollRows.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <DollarSign size={40} className="text-gray-300" />
          <p className="text-sm text-gray-400 mt-3">{t.emptyPayroll}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <span className="text-xs font-semibold text-gray-400">
              {t.payroll.summaryHeading.replace('{{month}}', payrollMonth)}
            </span>
          </div>
          <div className="flex px-5 py-2 border-b border-gray-50">
            <span className="flex-1 text-xs font-semibold text-gray-400 uppercase">{t.payroll.colEmployee}</span>
            <span className="w-16 text-xs font-semibold text-gray-400 uppercase text-center">{t.payroll.colHours}</span>
            <span className="w-24 text-xs font-semibold text-gray-400 uppercase text-center">{t.payroll.colRate}</span>
            <span className="w-28 text-xs font-semibold text-gray-400 uppercase text-right">{t.payroll.colTotal}</span>
          </div>
          {payrollRows.map(([name, { hours, emp }], i) => {
            const rate = emp?.payRate ?? 0;
            const payType = emp?.payType ?? 'hourly';
            const pay =
              payType === 'hourly' ? hours * rate
              : payType === 'daily' ? Math.ceil(hours / 8) * rate
              : rate;
            return (
              <div
                key={name}
                className={`flex items-center px-5 py-3.5 ${i < payrollRows.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <span className="flex-1 text-sm font-medium text-gray-900 truncate">{name}</span>
                <span className="w-16 text-sm text-gray-600 text-center">{hours}</span>
                <span className="w-24 text-xs text-gray-400 text-center">
                  ${rate.toFixed(2)}/{PAY_UNIT_SHORT[payType]}
                </span>
                <span className="w-28 text-sm font-bold text-gray-900 text-right">${pay.toFixed(2)}</span>
              </div>
            );
          })}
          <div className="flex justify-between px-5 py-3 border-t border-gray-100">
            <span className="text-sm font-bold text-gray-700">{t.payroll.monthlyTotal}</span>
            <span className="text-sm font-bold text-primary">${payrollTotal.toFixed(2)}</span>
          </div>
        </div>
      )}

      {modalsSlot}
    </div>
  );
}
