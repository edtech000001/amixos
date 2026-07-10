import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import {
  Clock,
  ClipboardList,
  UserCheck,
  DollarSign,
  Search, SlidersHorizontal, ChevronDown, Check } from 'lucide-react-native';
import { useLang } from '../../i18n';
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

  // Payroll summary
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
    <View className="flex-1 bg-surface">
    <ScrollView className="flex-1" contentContainerClassName="px-6 pt-6 pb-36">
      {/* Header — "add" is the bottom-right Fab; log-hours stays here as a
         secondary action. */}
      <View className="flex-row items-center justify-between mb-6 flex-wrap gap-3">
        <View>
          <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {t.summary
              .replace('{{active}}', String(activeCount))
              .replace('{{hours}}', String(totalHoursThisWeek))}
          </Text>
        </View>
        <Pressable
          onPress={onLogHours}
          className="flex-row items-center gap-1.5 bg-white border border-gray-200 px-4 py-2.5 rounded-xl active:bg-gray-50"
        >
          <Clock size={15} color="#374151" />
          <Text className="text-sm font-semibold text-gray-700">{t.logHours}</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View className="flex-row gap-1 bg-gray-100 p-1 rounded-xl mb-6 self-start">
        {(['empleados', 'horas', 'nomina'] as const).map(tabKey => (
          <Pressable
            key={tabKey}
            onPress={() => setTab(tabKey)}
            className={`px-4 py-1.5 rounded-lg ${tab === tabKey ? 'bg-white' : ''}`}
          >
            <Text
              className={`text-xs font-semibold capitalize ${
                tab === tabKey ? 'text-gray-900' : 'text-gray-500'
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
          <View className="flex-1 flex-row items-center rounded-2xl border border-gray-200 bg-white px-3.5">
            <Search size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t.teamSearchPlaceholder}
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 px-2.5 py-2.5 text-sm text-gray-900"
            />
          </View>
          <Pressable
            onPress={() => setFilterOpen(o => !o)}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              filtersActive || filterOpen ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'
            }`}
          >
            <SlidersHorizontal size={16} color={filtersActive || filterOpen ? '#4F46E5' : '#6B7280'} />
          </Pressable>
        </View>
        {filterOpen ? (
          <View className="bg-white rounded-2xl border border-gray-100 py-1 mb-4 overflow-hidden">
            {filterFields.map(f => {
              const sel = filterSel[f.key] ?? [];
              const open = openField === f.key;
              const values = open ? valueCounts(f) : [];
              const vq = norm(valueSearch.trim());
              const shown = vq
                ? values.filter(([v]) => norm(v === '' ? t.filter.empty : f.labelOf(v)).includes(vq))
                : values;
              return (
                <View key={f.key} className="border-b border-gray-50">
                  <Pressable
                    onPress={() => { setOpenField(open ? null : f.key); setValueSearch(''); }}
                    className="flex-row items-center justify-between px-4 py-3 active:bg-gray-50"
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-semibold text-gray-700">{f.label}</Text>
                      {sel.length ? (
                        <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary items-center justify-center">
                          <Text className="text-[10px] font-bold text-white">{sel.length}</Text>
                        </View>
                      ) : null}
                    </View>
                    <ChevronDown size={15} color="#9CA3AF" style={open ? { transform: [{ rotate: '180deg' }] } : undefined} />
                  </Pressable>
                  {open ? (
                    <View className="px-2 pb-2">
                      {values.length > 8 ? (
                        <TextInput
                          value={valueSearch}
                          onChangeText={setValueSearch}
                          placeholder={t.filter.searchValue}
                          placeholderTextColor="#9CA3AF"
                          autoCapitalize="none"
                          autoCorrect={false}
                          className="mb-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900"
                        />
                      ) : null}
                      <ScrollView className="max-h-52" nestedScrollEnabled>
                        {shown.map(([v, count]) => {
                          const on = sel.includes(v);
                          return (
                            <Pressable
                              key={v || '(empty)'}
                              onPress={() => toggleFilterValue(f.key, v)}
                              className="flex-row items-center gap-2 px-2 py-2 rounded-lg active:bg-gray-50"
                            >
                              <View className={`w-4 h-4 rounded border items-center justify-center ${on ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}`}>
                                {on ? <Check size={11} color="#fff" /> : null}
                              </View>
                              <Text className={`flex-1 text-sm ${v === '' ? 'italic text-gray-400' : 'text-gray-700'}`} numberOfLines={1}>
                                {v === '' ? t.filter.empty : f.labelOf(v)}
                              </Text>
                              <Text className="text-xs text-gray-400">{count}</Text>
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
              <Pressable onPress={clearFilters} className="mx-2 my-2 py-2 rounded-xl bg-gray-100 items-center active:opacity-80">
                <Text className="text-sm font-semibold text-gray-700">{t.filter.clear}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {employees.length === 0 ? (
          <View className="items-center py-20">
            <UserCheck size={40} color="#D1D5DB" />
            <Text className="text-sm text-gray-400 mt-3">{t.emptyEmployees}</Text>
            <Pressable onPress={onAddEmployee} className="mt-1">
              <Text className="text-primary text-sm font-medium">{t.addFirst}</Text>
            </Pressable>
          </View>
        ) : (
          <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {filteredEmployees.map((e, i) => (
              <Pressable
                key={e.id}
                onPress={() => onEditEmployee(e.id)}
                className={`flex-row items-start gap-3 px-5 py-4 active:bg-gray-50 ${
                  i < filteredEmployees.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <View
                  className={`w-9 h-9 rounded-full items-center justify-center ${
                    e.active ? 'bg-primary/10' : 'bg-gray-100'
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      e.active ? 'text-primary' : 'text-gray-400'
                    }`}
                  >
                    {e.firstName.charAt(0)}{e.lastName.charAt(0)}
                  </Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-gray-900" numberOfLines={2}>
                    {e.firstName} {e.lastName}
                  </Text>
                  {(!e.active || e.access?.kind === 'active' || e.access?.kind === 'invited') ? (
                    <View className="flex-row flex-wrap items-center gap-1.5 mt-1">
                      {!e.active ? (
                        <View className="px-2 py-0.5 rounded-full bg-gray-100">
                          <Text className="text-xs text-gray-400">{t.inactiveBadge}</Text>
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
                  <Text className="text-xs text-gray-400 mt-1">
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
        timesheets.length === 0 ? (
          <View className="items-center py-20">
            <ClipboardList size={40} color="#D1D5DB" />
            <Text className="text-sm text-gray-400 mt-3">{t.emptyTimesheets}</Text>
          </View>
        ) : (
          <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <View className="flex-row px-5 py-3 border-b border-gray-50">
              <Text className="flex-1 text-xs font-semibold text-gray-400 uppercase">
                {t.timesheetCols.worker}
              </Text>
              <Text className="w-20 text-xs font-semibold text-gray-400 uppercase text-center">
                {t.timesheetCols.date}
              </Text>
              <Text className="w-16 text-xs font-semibold text-gray-400 uppercase text-center">
                {t.timesheetCols.hours}
              </Text>
              <Text className="w-28 text-xs font-semibold text-gray-400 uppercase">
                {t.timesheetCols.work}
              </Text>
            </View>
            {timesheets.map((ts, i) => (
              <View
                key={ts.id}
                className={`flex-row items-center px-5 py-3 ${
                  i < timesheets.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <Text className="flex-1 text-sm text-gray-900 font-medium" numberOfLines={1}>
                  {ts.workerName ?? '—'}
                </Text>
                <Text className="w-20 text-xs text-gray-500 text-center">
                  {new Date(ts.workDate).toLocaleDateString(dateLocale, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <Text className="w-16 text-sm font-semibold text-gray-900 text-center">
                  {ts.hoursWorked ?? '—'}
                </Text>
                <Text className="w-28 text-xs text-gray-400" numberOfLines={1}>
                  {ts.jobDescription ?? '—'}
                </Text>
              </View>
            ))}
          </View>
        )
      ) : payrollRows.length === 0 ? (
        <View className="items-center py-20">
          <DollarSign size={40} color="#D1D5DB" />
          <Text className="text-sm text-gray-400 mt-3">{t.emptyPayroll}</Text>
        </View>
      ) : (
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <View className="px-5 py-3 border-b border-gray-50">
            <Text className="text-xs font-semibold text-gray-400">
              {t.payroll.summaryHeading.replace('{{month}}', payrollMonth)}
            </Text>
          </View>
          <View className="flex-row px-5 py-2 border-b border-gray-50">
            <Text className="flex-1 text-xs font-semibold text-gray-400 uppercase">
              {t.payroll.colEmployee}
            </Text>
            <Text className="w-16 text-xs font-semibold text-gray-400 uppercase text-center">
              {t.payroll.colHours}
            </Text>
            <Text className="w-20 text-xs font-semibold text-gray-400 uppercase text-center">
              {t.payroll.colRate}
            </Text>
            <Text className="w-24 text-xs font-semibold text-gray-400 uppercase text-right">
              {t.payroll.colTotal}
            </Text>
          </View>
          {payrollRows.map(([name, { hours, emp }], i) => {
            const rate = emp?.payRate ?? 0;
            const payType = emp?.payType ?? 'hourly';
            const pay =
              payType === 'hourly' ? hours * rate
              : payType === 'daily' ? Math.ceil(hours / 8) * rate
              : rate;
            return (
              <View
                key={name}
                className={`flex-row items-center px-5 py-3.5 ${
                  i < payrollRows.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <Text className="flex-1 text-sm font-medium text-gray-900" numberOfLines={1}>
                  {name}
                </Text>
                <Text className="w-16 text-sm text-gray-600 text-center">{hours}</Text>
                <Text className="w-20 text-xs text-gray-400 text-center">
                  ${rate.toFixed(2)}/{PAY_UNIT_SHORT[payType]}
                </Text>
                <Text className="w-24 text-sm font-bold text-gray-900 text-right">
                  ${pay.toFixed(2)}
                </Text>
              </View>
            );
          })}
          <View className="flex-row justify-between px-5 py-3 border-t border-gray-100">
            <Text className="text-sm font-bold text-gray-700">{t.payroll.monthlyTotal}</Text>
            <Text className="text-sm font-bold text-primary">${payrollTotal.toFixed(2)}</Text>
          </View>
        </View>
      )}

      {modalsSlot}
    </ScrollView>

    {/* New employee — floating action, bottom-right thumb reach */}
    <Fab onPress={onAddEmployee} />
    </View>
  );
}
