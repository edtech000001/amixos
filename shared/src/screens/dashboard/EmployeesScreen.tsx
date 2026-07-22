import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import {
  Clock,
  ClipboardList,
  UserCheck,
  Plus, Pencil, Trash2, X,
  Search, SlidersHorizontal, ChevronDown, Check } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { usePersistedSearch } from '../../lib/usePersistedSearch';
import { Fab } from '../../ui/Fab';
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
  /** Extra searchable text built by the caller: field values + semantic
   *  keywords (overtime/acceso/inactivo…). */
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
  onAddEmployee: () => void;
  onEditEmployee: (id: string) => void;
  onToggleActive: (id: string) => void;
  onLogHours: () => void;
  /** Edit / delete a logged-hours entry (History tab). */
  onEditTimesheet?: (id: string) => void;
  onDeleteTimesheet?: (id: string) => void;
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
  customFieldDefs,
  modalsSlot,
}: EmployeesScreenProps) {
  const { t: full, locale } = useLang();
  const c = useThemeColors();
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
    <View className="flex-1 bg-surface">
    <ScrollView className="flex-1" contentContainerClassName="px-6 pt-6 pb-44">
      {/* Header — "add" is the bottom-right Fab; log-hours stays here as a
         secondary action. */}
      <View className="flex-row items-center justify-between mb-6 flex-wrap gap-3">
        <View>
          <Text className="text-2xl font-bold text-ink">{t.title}</Text>
          <Text className="text-sm text-muted mt-0.5">
            {tab === 'empleados' && (search.trim() !== '' || filtersActive)
              ? t.resultsCount.replace('{{count}}', String(filteredEmployees.length))
              : t.summary
                  .replace('{{active}}', String(activeCount))
                  .replace('{{hours}}', String(periodHours))}
          </Text>
        </View>
        <Pressable
          onPress={onLogHours}
          className="flex-row items-center gap-1.5 bg-card border border-border px-4 py-2.5 rounded-xl active:bg-surface"
        >
          <Clock size={15} color={c.muted} />
          <Text className="text-sm font-semibold text-ink">{t.logHours}</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View className="flex-row gap-1 bg-border-soft p-1 rounded-xl mb-6 self-start">
        {(['empleados', 'horas', 'historial'] as const).map(tabKey => (
          <Pressable
            key={tabKey}
            onPress={() => setTab(tabKey)}
            className={`px-4 py-1.5 rounded-lg ${tab === tabKey ? 'bg-card' : ''}`}
          >
            <Text
              className={`text-xs font-semibold capitalize ${
                tab === tabKey ? 'text-ink' : 'text-muted'
              }`}
            >
              {t.tabs[tabKey]}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'empleados' ? (
        <>
        <View className="flex-row items-center gap-2 mb-3">
          <View className="flex-1 flex-row items-center rounded-2xl border border-border bg-card px-3.5">
            <Search size={16} color={c.faint} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t.teamSearchPlaceholder}
              placeholderTextColor={c.faint}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 px-2.5 py-2.5 text-sm text-ink"
            />
          </View>
          <Pressable
            onPress={() => setFilterOpen(o => !o)}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              filtersActive || filterOpen ? 'bg-primary/10 border-primary' : 'bg-card border-border'
            }`}
          >
            <SlidersHorizontal size={16} color={filtersActive || filterOpen ? c.primary : c.muted} />
          </Pressable>
        </View>
        {filterOpen ? (
          <View className="bg-card rounded-2xl border border-border-soft py-1 mb-4 overflow-hidden">
            {filterFields.map(f => {
              const sel = filterSel[f.key] ?? [];
              const open = openField === f.key;
              const values = open ? valueCounts(f) : [];
              const vq = norm(valueSearch.trim());
              const shown = vq
                ? values.filter(([v]) => norm(v === '' ? t.filter.empty : f.labelOf(v)).includes(vq))
                : values;
              return (
                <View key={f.key} className="border-b border-border-soft">
                  <Pressable
                    onPress={() => { setOpenField(open ? null : f.key); setValueSearch(''); }}
                    className="flex-row items-center justify-between px-4 py-3 active:bg-surface"
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-semibold text-ink">{f.label}</Text>
                      {sel.length ? (
                        <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary items-center justify-center">
                          <Text className="text-[10px] font-bold text-white">{sel.length}</Text>
                        </View>
                      ) : null}
                    </View>
                    <ChevronDown size={15} color={c.faint} style={open ? { transform: [{ rotate: '180deg' }] } : undefined} />
                  </Pressable>
                  {open ? (
                    <View className="px-2 pb-2">
                      {values.length > 8 ? (
                        <TextInput
                          value={valueSearch}
                          onChangeText={setValueSearch}
                          placeholder={t.filter.searchValue}
                          placeholderTextColor={c.faint}
                          autoCapitalize="none"
                          autoCorrect={false}
                          className="mb-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-ink"
                        />
                      ) : null}
                      <ScrollView className="max-h-52" nestedScrollEnabled>
                        {shown.map(([v, count]) => {
                          const on = sel.includes(v);
                          return (
                            <Pressable
                              key={v || '(empty)'}
                              onPress={() => toggleFilterValue(f.key, v)}
                              className="flex-row items-center gap-2 px-2 py-2 rounded-lg active:bg-surface"
                            >
                              <View className={`w-4 h-4 rounded border items-center justify-center ${on ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
                                {on ? <Check size={11} color="#fff" /> : null}
                              </View>
                              <Text className={`flex-1 text-sm ${v === '' ? 'italic text-faint' : 'text-ink'}`} numberOfLines={1}>
                                {v === '' ? t.filter.empty : f.labelOf(v)}
                              </Text>
                              <Text className="text-xs text-faint">{count}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              );
            })}
            {filtersActive ? (
              <Pressable onPress={clearFilters} className="mx-2 my-2 py-2 rounded-xl bg-border-soft items-center active:opacity-80">
                <Text className="text-sm font-semibold text-ink">{t.filter.clear}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {employees.length === 0 ? (
          <View className="items-center py-20">
            <UserCheck size={40} color={c.faint} />
            <Text className="text-sm text-faint mt-3">{t.emptyEmployees}</Text>
            <Pressable onPress={onAddEmployee} className="mt-1">
              <Text className="text-primary text-sm font-medium">{t.addFirst}</Text>
            </Pressable>
          </View>
        ) : (
          <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
            {filteredEmployees.map((e, i) => (
              <Pressable
                key={e.id}
                onPress={() => onEditEmployee(e.id)}
                className={`flex-row items-start gap-3 px-5 py-4 active:bg-surface ${
                  i < filteredEmployees.length - 1 ? 'border-b border-border-soft' : ''
                }`}
              >
                <View
                  className={`w-9 h-9 rounded-full items-center justify-center ${
                    e.active ? 'bg-primary/10' : 'bg-border-soft'
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      e.active ? 'text-primary' : 'text-faint'
                    }`}
                  >
                    {e.firstName.charAt(0)}{e.lastName.charAt(0)}
                  </Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-ink" numberOfLines={2}>
                    {e.firstName} {e.lastName}
                  </Text>
                  {(!e.active || e.access?.kind === 'active' || e.access?.kind === 'invited') ? (
                    <View className="flex-row flex-wrap items-center gap-1.5 mt-1">
                      {!e.active ? (
                        <View className="px-2 py-0.5 rounded-full bg-border-soft">
                          <Text className="text-xs text-faint">{t.inactiveBadge}</Text>
                        </View>
                      ) : null}
                      {e.access?.kind === 'active' ? (
                        <View className="px-2 py-0.5 rounded-full bg-primary/10">
                          <Text className="text-xs font-semibold text-primary">{ROLE_LABELS[e.access.role][lang]}</Text>
                        </View>
                      ) : e.access?.kind === 'invited' ? (
                        <View className="px-2 py-0.5 rounded-full bg-amber-100">
                          <Text className="text-xs font-semibold text-amber-700">{teamT.pendingBadge}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <Text className="text-xs text-faint mt-1">
                    {ROLES[e.role] ?? e.role} · {PAY_TYPES[e.payType]} ${e.payRate.toFixed(2)}
                    {e.phone ? ` · ${e.phone}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        </>
      ) : tab === 'horas' ? (
        /* Hours tab — per-worker totals for the current pay period. */
        <>
          {payPeriodLabel ? (
            <Text className="text-xs text-faint mb-3">
              {t.hoursThisPeriod.replace('{{period}}', payPeriodLabel)}
            </Text>
          ) : null}
          {(hourTotals ?? []).length === 0 ? (
            <View className="items-center py-20">
              <ClipboardList size={40} color={c.faint} />
              <Text className="text-sm text-faint mt-3">{t.emptyHourTotals}</Text>
            </View>
          ) : (
            <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
              {(hourTotals ?? []).map((h, i) => (
                <View
                  key={(h.employeeId ?? h.workerName ?? '') + i}
                  className={`flex-row items-center px-5 py-4 ${
                    i < (hourTotals ?? []).length - 1 ? 'border-b border-border-soft' : ''
                  }`}
                >
                  <Text className="flex-1 text-sm text-ink font-semibold" numberOfLines={1}>
                    {h.workerName ?? '—'}
                  </Text>
                  <Text className="text-sm font-bold text-ink">{Number(h.hours.toFixed(2))}h</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          {/* Search + add new entry */}
          <View className="flex-row items-center gap-2 mb-4">
            <View className="flex-1 flex-row items-center rounded-2xl border border-border bg-card px-3.5 py-2.5">
              <Search size={16} color={c.faint} />
              <TextInput
                value={tsSearch}
                onChangeText={setTsSearch}
                placeholder={t.hoursSearchPlaceholder}
                placeholderTextColor={c.faint}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 ml-2 text-sm text-ink"
              />
              {tsSearch ? (
                <Pressable onPress={() => setTsSearch('')} hitSlop={8}>
                  <X size={16} color={c.faint} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={onLogHours}
              className="flex-row items-center gap-1.5 bg-primary px-4 py-3 rounded-2xl active:opacity-90"
            >
              <Plus size={15} color="#fff" />
              <Text className="text-sm font-semibold text-white">{t.addHours}</Text>
            </Pressable>
          </View>
          {filteredTimesheets.length === 0 ? (
            <View className="items-center py-20">
              <ClipboardList size={40} color={c.faint} />
              <Text className="text-sm text-faint mt-3">{tsSearch ? t.hoursNoResults : t.emptyTimesheets}</Text>
            </View>
          ) : (
            <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
              {filteredTimesheets.map((ts, i) => (
                <View
                  key={ts.id}
                  className={`flex-row items-center px-4 py-3 ${
                    i < filteredTimesheets.length - 1 ? 'border-b border-border-soft' : ''
                  }`}
                >
                  <View className="flex-1 min-w-0 pr-2">
                    <Text className="text-sm text-ink font-semibold" numberOfLines={1}>
                      {ts.workerName ?? '—'}
                    </Text>
                    <Text className="text-xs text-faint mt-0.5" numberOfLines={1}>
                      {new Date(ts.workDate).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                      {ts.jobDescription ? ` · ${ts.jobDescription}` : ''}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-ink mr-1">
                    {ts.hoursWorked ?? '—'}h
                  </Text>
                  <Pressable onPress={() => onEditTimesheet?.(ts.id)} hitSlop={8} className="p-2 active:opacity-60">
                    <Pencil size={16} color={c.muted} />
                  </Pressable>
                  <Pressable onPress={() => onDeleteTimesheet?.(ts.id)} hitSlop={8} className="p-2 active:opacity-60">
                    <Trash2 size={16} color={c.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {modalsSlot}
    </ScrollView>

    {/* New employee — floating action, bottom-right thumb reach. The Hours
       logged tab has its own inline "add entry" button. */}
    {tab === 'empleados' ? <Fab onPress={onAddEmployee} /> : null}
    </View>
  );
}
