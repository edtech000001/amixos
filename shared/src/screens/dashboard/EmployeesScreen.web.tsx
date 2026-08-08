'use client';

// Web-only EmployeesScreen — plain HTML + Tailwind (see ClientsListScreen.web
// for the rationale: shared RN screens render unstyled on web). Same exported
// API as EmployeesScreen.tsx so the web page wrapper is untouched and the
// bundler resolves this .web.tsx variant automatically.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Plus,
  Clock,
  ClipboardList,
  UserCheck,
  Pencil, Trash2,
  Search, X, SlidersHorizontal, ChevronDown, Check, ListChecks } from 'lucide-react';
import { useLang } from '../../i18n';
import { usePersistedSearch } from '../../lib/usePersistedSearch';
import { roleLabel } from '../../lib/permissions';
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

/** Per-worker hour total for the current pay period (Hours tab). */
export interface HourTotalItem {
  employeeId: string | null;
  workerName: string | null;
  hours: number;
}

export interface EmployeesScreenProps {
  employees: EmployeeListItem[];
  timesheets: TimesheetListItem[];
  /** Per-worker hour totals for the current pay period (Hours tab). */
  hourTotals?: HourTotalItem[];
  /** Human label for the current pay period, e.g. "Jul 14 – Jul 27". */
  payPeriodLabel?: string | null;
  /** Omit to hide the Add-employee affordances (no create permission). */
  onAddEmployee?: () => void;
  onEditEmployee: (id: string) => void;
  onToggleActive: (id: string) => void;
  /** Omit to hide the Log-hours / Add-hours buttons (no timesheet write). */
  onLogHours?: () => void;
  /** Edit / delete a logged-hours entry (History tab). */
  onEditTimesheet?: (id: string) => void;
  onDeleteTimesheet?: (id: string) => void;
  /** Bulk-delete the selected employees. Return false to keep the selection
   *  (cancelled); anything else clears it. Omit to hide multi-select. */
  onBulkDelete?: (ids: string[]) => Promise<boolean> | void;
  bulkDeleting?: boolean;
  /** Optional slot for modals/dialogs rendered on web. */
  modalsSlot?: ReactNode;
  /** Custom-field definitions (from employee_field_templates) — drive the
   *  filter panel so deleted fields never appear and labels are the real
   *  field names, not the snake_case keys. */
  customFieldDefs?: CustomFieldDef[];
}

type Tab = 'empleados' | 'horas' | 'historial';

export function EmployeesScreen({
  employees,
  timesheets,
  hourTotals,
  payPeriodLabel,
  onAddEmployee,
  onEditEmployee,
  onToggleActive,
  onLogHours,
  onEditTimesheet,
  onDeleteTimesheet,
  onBulkDelete,
  bulkDeleting,
  customFieldDefs,
  modalsSlot,
}: EmployeesScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.employees;
  const teamT = full.dashboard.settings.team;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';
  const dateLocale = full.dashboard.dateLocale;
  const [tab, setTab] = useState<Tab>('empleados');
  const [search, setSearch] = usePersistedSearch('search.employees');
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

  const filterFields = useMemo<FilterField[]>(() => {
    const id = (v: string) => v;
    const fields: FilterField[] = [
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

  // Default view: ACTIVE workers only — ex-workers are occasional reading, so
  // they live behind the Activos/Inactivos segment instead of mixing in.
  const [statusView, setStatusView] = useState<'active' | 'inactive'>('active');

  const filteredEmployees = useMemo(() => {
    const q = norm(search.trim());
    return employees.filter(e => {
      if (e.active !== (statusView === 'active')) return false;
      if (q && !norm(`${e.firstName} ${e.lastName} ${e.phone ?? ''} ${e.searchExtra ?? ''}`).includes(q)) return false;
      for (const f of filterFields) {
        const sel = filterSel[f.key];
        if (sel?.length && !partsOf(f, e).some(v => sel.includes(v))) return false;
      }
      return true;
    });
  }, [employees, search, filterFields, filterSel, statusView]);

  // Multi-select + bulk delete (team tab). Mirrors the clients list.
  const canBulkDelete = !!onBulkDelete;
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectMode || selectedIds.size > 0;
  // Anchor for shift-click range selection (index into filteredEmployees).
  const lastIdxRef = useRef<number | null>(null);
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); lastIdxRef.current = null; };
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Row click in select mode: plain click toggles + moves the anchor; shift+click
  // selects every row between the anchor and this one (like a file list).
  const rowClick = (ev: React.MouseEvent, id: string, index: number) => {
    if (!selectionMode) { onEditEmployee(id); return; }
    if (ev.shiftKey && lastIdxRef.current !== null) {
      const [a, b] = lastIdxRef.current < index ? [lastIdxRef.current, index] : [index, lastIdxRef.current];
      setSelectedIds(prev => {
        const n = new Set(prev);
        for (let i = a; i <= b; i++) n.add(filteredEmployees[i].id);
        return n;
      });
    } else {
      toggleSelect(id);
      lastIdxRef.current = index;
    }
  };
  const allSelected = filteredEmployees.length > 0 && selectedIds.size === filteredEmployees.length;
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(filteredEmployees.map(e => e.id)));
  const handleBulkDelete = async () => {
    if (!onBulkDelete || selectedIds.size === 0) return;
    const res = await onBulkDelete(Array.from(selectedIds));
    if (res !== false) exitSelect();
  };
  const selectedCountLabel = (selectedIds.size === 1 ? t.selectedCountSingle : t.selectedCountPlural)
    .replace('{{count}}', String(selectedIds.size));

  const [tsSearch, setTsSearch] = useState('');
  const filteredTimesheets = useMemo(() => {
    const q = norm(tsSearch.trim());
    if (!q) return timesheets;
    return timesheets.filter(ts =>
      norm(`${ts.workerName ?? ''} ${ts.jobDescription ?? ''}`).includes(q));
  }, [timesheets, tsSearch]);

  const activeCount = employees.filter(e => e.active).length;
  // Total hours across the current pay period — includes job hours (via the
  // hourTotals the route computes with the Payroll engine), not just timesheets.
  const periodHours = useMemo(
    () => Number((hourTotals ?? []).reduce((s, h) => s + h.hours, 0).toFixed(1)),
    [hourTotals],
  );

  return (
    <div className="px-6 lg:px-8 pt-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="text-sm text-muted mt-0.5">
            {tab === 'empleados' && (search.trim() !== '' || filtersActive)
              ? t.resultsCount.replace('{{count}}', String(filteredEmployees.length))
              : t.summary
                  .replace('{{active}}', String(activeCount))
                  .replace('{{hours}}', String(periodHours))}
          </p>
        </div>
        <div className="flex gap-2">
          {onLogHours ? (
            <button
              type="button"
              onClick={onLogHours}
              className="flex items-center gap-1.5 bg-card border border-border px-4 py-2.5 rounded-xl text-sm font-semibold text-ink hover:bg-surface transition-colors"
            >
              <Clock size={15} className="text-ink" />
              {t.logHours}
            </button>
          ) : null}
          {onAddEmployee ? (
            <button
              type="button"
              onClick={onAddEmployee}
              className="flex items-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <Plus size={15} className="text-white" />
              {t.addBtn}
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex gap-1 bg-border-soft p-1 rounded-xl mb-6">
        {(['empleados', 'horas', 'historial'] as const).map(tabKey => (
          <button
            type="button"
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              tab === tabKey ? 'bg-primary/15 text-primary shadow-sm' : 'text-muted hover:text-ink'
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
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.teamSearchPlaceholder}
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-2xl border border-border bg-card pl-10 pr-10 py-2.5 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted">
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
              filtersActive ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'
            }`}
          >
            <SlidersHorizontal size={15} /> {t.filter.button}
          </button>
          {filterOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-80 bg-card rounded-2xl border border-border-soft shadow-lg py-2 max-h-[28rem] overflow-y-auto">
                {filterFields.map(f => {
                  const sel = filterSel[f.key] ?? [];
                  const open = openField === f.key;
                  const values = open ? valueCounts(f) : [];
                  const vq = norm(valueSearch.trim());
                  const shown = vq
                    ? values.filter(([v]) => norm(v === '' ? t.filter.empty : f.labelOf(v)).includes(vq))
                    : values;
                  return (
                    <div key={f.key} className="border-b border-border-soft last:border-0">
                      <button
                        type="button"
                        onClick={() => { setOpenField(open ? null : f.key); setValueSearch(''); }}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface"
                      >
                        <span className="flex items-center gap-2">
                          {f.label}
                          {sel.length ? (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold inline-flex items-center justify-center">
                              {sel.length}
                            </span>
                          ) : null}
                        </span>
                        <ChevronDown size={15} className={`text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open ? (
                        <div className="px-2 pb-2">
                          {values.length > 8 ? (
                            <input
                              value={valueSearch}
                              onChange={ev => setValueSearch(ev.target.value)}
                              placeholder={t.filter.searchValue}
                              className="w-full mb-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-surface text-left"
                                >
                                  <span className={`w-4 h-4 rounded border inline-flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
                                    {on ? <Check size={11} className="text-white" /> : null}
                                  </span>
                                  <span className={`flex-1 truncate ${v === '' ? 'italic text-faint' : 'text-ink'}`}>
                                    {v === '' ? t.filter.empty : f.labelOf(v)}
                                  </span>
                                  <span className="text-xs text-faint">{count}</span>
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
                    <button type="button" onClick={clearFilters} className="w-full py-2 rounded-xl bg-border-soft text-sm font-semibold text-ink hover:bg-border">
                      {t.filter.clear}
                    </button>
                  </div>
                ) : null}              </div>
            </>
          ) : null}
        </div>
        {canBulkDelete && employees.length > 0 ? (
          <button
            type="button"
            onClick={() => (selectionMode ? exitSelect() : setSelectMode(true))}
            title={t.selectAllShort}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold shadow-sm transition-colors ${
              selectionMode ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'
            }`}
          >
            <ListChecks size={15} />
          </button>
        ) : null}
        </div>
        {/* Active/Inactive segment — the list shows one group at a time (active
            by default). Hidden while everyone is active: nothing to switch to. */}
        {employees.length - activeCount > 0 ? (
          <div className="flex gap-1.5 mb-4">
            {(['active', 'inactive'] as const).map(k => {
              const on = statusView === k;
              const n = k === 'active' ? activeCount : employees.length - activeCount;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusView(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    on ? 'bg-primary text-white' : 'bg-border-soft text-muted hover:bg-border'
                  }`}
                >
                  {k === 'active' ? t.viewActive : t.viewInactive}
                  <span className={on ? 'font-bold text-white/80' : 'font-bold text-faint'}>{n}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {selectionMode ? (
          <div className="flex items-center justify-between mb-3 px-4 py-2.5 rounded-2xl bg-primary/5 border border-primary/30">
            <span className="text-sm font-semibold text-primary">{selectedCountLabel}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleSelectAll} className="text-xs font-semibold text-primary hover:underline">
                {t.selectAllShort}
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0 || !!bulkDeleting}
                className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:bg-gray-300 transition-colors"
              >
                <Trash2 size={14} />
                {`${t.bulkDelete}${selectedIds.size > 0 ? ` · ${selectedIds.size}` : ''}`}
              </button>
              <button type="button" onClick={exitSelect} className="text-faint hover:text-muted p-1">
                <X size={16} />
              </button>
            </div>
          </div>
        ) : null}
        {employees.length === 0 ? (
          <div className="flex flex-col items-center py-20">
            <UserCheck size={40} className="text-faint" />
            <p className="text-sm text-faint mt-3">{t.emptyEmployees}</p>
            {onAddEmployee ? (
              <button type="button" onClick={onAddEmployee} className="text-primary text-sm font-medium mt-1 hover:underline">
                {t.addFirst}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden">
            {filteredEmployees.map((e, i) => {
              // App-access / inactive badges — rendered in their own column on
              // wide windows, under the name on small ones.
              const badges = (!e.active || e.access?.kind === 'active' || e.access?.kind === 'invited') ? (
                <>
                  {!e.active ? (
                    <span className="px-2 py-0.5 rounded-full bg-border-soft text-xs text-faint">
                      {t.inactiveBadge}
                    </span>
                  ) : null}
                  {e.access?.kind === 'active' ? (
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {roleLabel(e.access.role, lang)}
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
                // Lets the page's scroll restore find and re-center this
                // exact row when the user returns from the detail.
                data-scroll-anchor={e.id}
                onClick={(ev) => rowClick(ev, e.id, i)}
                className={`[content-visibility:auto] [contain-intrinsic-size:auto_72px] w-full text-left flex items-center gap-3 px-5 py-4 hover:bg-surface transition-colors select-none ${
                  selectedIds.has(e.id) ? 'bg-primary/5' : ''
                } ${i < filteredEmployees.length - 1 ? 'border-b border-border-soft' : ''}`}
              >
                {selectionMode ? (
                  <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
                    selectedIds.has(e.id) ? 'bg-primary border-primary' : 'border-border bg-card'
                  }`}>
                    {selectedIds.has(e.id) ? <Check size={15} className="text-white" /> : null}
                  </div>
                ) : (
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    e.active ? 'bg-primary/10' : 'bg-border-soft'
                  }`}
                >
                  <span className={`text-sm font-semibold ${e.active ? 'text-primary' : 'text-faint'}`}>
                    {(e.firstName || '').charAt(0)}{(e.lastName || '').charAt(0)}
                  </span>
                </div>
                )}
                {/* Name (flex) | role | pay | phone | badges — aligned columns
                   that collapse back under the name on narrow windows. */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink break-words">
                    {e.firstName} {e.lastName}
                  </p>
                  {badges ? <div className="md:hidden flex flex-wrap items-center gap-1.5 mt-1">{badges}</div> : null}
                  <p className="md:hidden text-xs text-faint mt-1 truncate">
                    {ROLES[e.role] ?? e.role} · {PAY_TYPES[e.payType]} ${Number(e.payRate ?? 0).toFixed(2)}
                    {e.phone ? ` · ${e.phone}` : ''}
                  </p>
                </div>
                <span className="hidden md:block w-40 shrink-0 text-sm text-muted truncate">
                  {ROLES[e.role] ?? e.role}
                </span>
                <span className="hidden md:block w-44 shrink-0 text-xs text-muted">
                  {PAY_TYPES[e.payType]} ${Number(e.payRate ?? 0).toFixed(2)}
                </span>
                <span className="hidden lg:block w-40 shrink-0 text-xs text-faint truncate">
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
        /* Hours tab — per-worker totals for the current pay period. */
        <>
          {payPeriodLabel ? (
            <p className="text-xs text-faint mb-3">
              {t.hoursThisPeriod.replace('{{period}}', payPeriodLabel)}
            </p>
          ) : null}
          {(hourTotals ?? []).length === 0 ? (
            <div className="flex flex-col items-center py-20">
              <ClipboardList size={40} className="text-faint" />
              <p className="text-sm text-faint mt-3">{t.emptyHourTotals}</p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden">
              {(hourTotals ?? []).map((h, i) => (
                <div
                  key={(h.employeeId ?? h.workerName ?? '') + i}
                  className={`flex items-center px-5 py-4 ${
                    i < (hourTotals ?? []).length - 1 ? 'border-b border-border-soft' : ''
                  }`}
                >
                  <span className="flex-1 text-sm font-semibold text-ink truncate">{h.workerName ?? '—'}</span>
                  <span className="text-sm font-bold text-ink">{Number(h.hours.toFixed(2))}h</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Search + add new entry */}
          <div className="flex items-start gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input
                value={tsSearch}
                onChange={e => setTsSearch(e.target.value)}
                placeholder={t.hoursSearchPlaceholder}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full rounded-2xl border border-border bg-card pl-10 pr-10 py-2.5 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {tsSearch ? (
                <button type="button" onClick={() => setTsSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted">
                  <X size={16} />
                </button>
              ) : null}
            </div>
            {onLogHours ? (
              <button
                type="button"
                onClick={onLogHours}
                className="shrink-0 flex items-center gap-1.5 bg-primary px-4 py-2.5 rounded-2xl text-sm font-semibold text-white hover:opacity-90 transition-opacity shadow-sm"
              >
                <Plus size={15} className="text-white" />
                {t.addHours}
              </button>
            ) : null}
          </div>
          {filteredTimesheets.length === 0 ? (
            <div className="flex flex-col items-center py-20">
              <ClipboardList size={40} className="text-faint" />
              <p className="text-sm text-faint mt-3">{tsSearch ? t.hoursNoResults : t.emptyTimesheets}</p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden">
              <div className="flex px-5 py-3 border-b border-border-soft">
                <span className="flex-1 text-xs font-semibold text-faint uppercase">{t.timesheetCols.worker}</span>
                <span className="w-24 text-xs font-semibold text-faint uppercase text-center">{t.timesheetCols.date}</span>
                <span className="w-16 text-xs font-semibold text-faint uppercase text-center">{t.timesheetCols.hours}</span>
                <span className="w-40 text-xs font-semibold text-faint uppercase">{t.timesheetCols.work}</span>
                <span className="w-20 shrink-0" />
              </div>
              {filteredTimesheets.map((ts, i) => (
                <div
                  key={ts.id}
                  className={`flex items-center px-5 py-3 ${i < filteredTimesheets.length - 1 ? 'border-b border-border-soft' : ''}`}
                >
                  <span className="flex-1 text-sm text-ink font-medium truncate">{ts.workerName ?? '—'}</span>
                  <span className="w-24 text-xs text-muted text-center">
                    {new Date(ts.workDate + 'T00:00:00').toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="w-16 text-sm font-semibold text-ink text-center">{ts.hoursWorked ?? '—'}</span>
                  <span className="w-40 text-xs text-faint truncate">{ts.jobDescription ?? '—'}</span>
                  <span className="w-20 shrink-0 flex items-center justify-end gap-1">
                    {onEditTimesheet ? (
                      <button
                        type="button"
                        onClick={() => onEditTimesheet(ts.id)}
                        className="p-1.5 rounded-lg text-muted hover:bg-surface hover:text-primary transition-colors"
                        aria-label={full.common.buttons.edit}
                      >
                        <Pencil size={15} />
                      </button>
                    ) : null}
                    {onDeleteTimesheet ? (
                      <button
                        type="button"
                        onClick={() => onDeleteTimesheet(ts.id)}
                        className="p-1.5 rounded-lg text-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                        aria-label={full.common.buttons.delete}
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modalsSlot}
    </div>
  );
}
