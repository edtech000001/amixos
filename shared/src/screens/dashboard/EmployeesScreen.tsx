import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, FlatList, Modal as RNModal } from 'react-native';
import {
  Clock,
  ClipboardList,
  UserCheck,
  Plus, Pencil, Trash2, X,
  Search, SlidersHorizontal, ChevronDown, Check, ListChecks } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { usePersistedSearch } from '../../lib/usePersistedSearch';
import { Fab } from '../../ui/Fab';
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
   *  (e.g. the confirm was cancelled); anything else clears it. Omit to hide
   *  the multi-select affordance entirely (no delete permission). */
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

  // Multi-select + bulk delete (team tab). Long-press a row to enter select
  // mode; tap toggles; a bottom bar deletes. Mirrors the clients/jobs lists.
  const canBulkDelete = !!onBulkDelete;
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectMode || selectedIds.size > 0;
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const enterSelect = (id: string) => { setSelectMode(true); setSelectedIds(new Set([id])); };
  const allSelected = filteredEmployees.length > 0 && selectedIds.size === filteredEmployees.length;
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(filteredEmployees.map(e => e.id)));
  const rowPress = (id: string) => (selectionMode ? toggleSelect(id) : onEditEmployee(id));
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

  // Header (title/summary) + tab switcher — shared across all three tabs.
  const topBar = (
    <>
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
        {onLogHours ? (
          <Pressable
            onPress={onLogHours}
            className="flex-row items-center gap-1.5 bg-card border border-border px-4 py-2.5 rounded-xl active:bg-surface"
          >
            <Clock size={15} color={c.muted} />
            <Text className="text-sm font-semibold text-ink">{t.logHours}</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row gap-1 bg-border-soft p-1 rounded-xl mb-6 self-start">
        {(['empleados', 'horas', 'historial'] as const).map(tabKey => (
          <Pressable
            key={tabKey}
            onPress={() => setTab(tabKey)}
            className={`px-4 py-1.5 rounded-lg ${tab === tabKey ? 'bg-card' : ''}`}
          >
            <Text className={`text-xs font-semibold capitalize ${tab === tabKey ? 'text-ink' : 'text-muted'}`}>
              {t.tabs[tabKey]}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  // Team-tab list header (search + filter + selection banner) rides above the
  // virtualized employee rows.
  const teamHeader = (
    <>
      {topBar}
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
        {canBulkDelete && employees.length > 0 ? (
          <Pressable
            onPress={() => (selectionMode ? exitSelect() : setSelectMode(true))}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              selectionMode ? 'bg-primary/10 border-primary' : 'bg-card border-border'
            }`}
          >
            <ListChecks size={16} color={selectionMode ? c.primary : c.muted} />
          </Pressable>
        ) : null}
      </View>

      {selectionMode ? (
        <View className="flex-row items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5 mb-3">
          <Pressable onPress={exitSelect} className="p-1 rounded">
            <X size={14} color={c.primary} />
          </Pressable>
          <Text className="text-sm font-medium text-primary flex-shrink" numberOfLines={1}>{selectedCountLabel}</Text>
          <View className="flex-1" />
          {!allSelected && filteredEmployees.length > 0 ? (
            <Pressable onPress={toggleSelectAll} className="px-2 py-1.5 rounded-lg active:bg-primary/10">
              <Text className="text-xs font-semibold text-primary">{t.selectAllShort}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );

  // One employee row (first/last rounding recreates the section card look).
  const renderEmployee = ({ item: e, index }: { item: EmployeeListItem; index: number }) => {
    const selected = selectedIds.has(e.id);
    const isFirst = index === 0;
    const isLast = index === filteredEmployees.length - 1;
    return (
      <Pressable
        onPress={() => rowPress(e.id)}
        onLongPress={canBulkDelete ? () => enterSelect(e.id) : undefined}
        delayLongPress={300}
        className={`flex-row items-start gap-3 px-5 py-4 border-x border-border-soft ${isFirst ? 'rounded-t-2xl border-t' : ''} ${isLast ? 'rounded-b-2xl border-b' : 'border-b'} ${
          selected ? 'bg-primary/5' : 'bg-card active:bg-surface'
        }`}
      >
        {selectionMode ? (
          <View className={`w-6 h-6 mt-1 rounded-md border items-center justify-center ${
            selected ? 'bg-primary border-primary' : 'border-border bg-card'
          }`}>
            {selected ? <Check size={14} color="#fff" /> : null}
          </View>
        ) : (
          <View className={`w-9 h-9 rounded-full items-center justify-center ${e.active ? 'bg-primary/10' : 'bg-border-soft'}`}>
            <Text className={`text-sm font-semibold ${e.active ? 'text-primary' : 'text-faint'}`}>
              {(e.firstName || '').charAt(0)}{(e.lastName || '').charAt(0)}
            </Text>
          </View>
        )}
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-ink" numberOfLines={2}>{e.firstName} {e.lastName}</Text>
          {(!e.active || e.access?.kind === 'active' || e.access?.kind === 'invited') ? (
            <View className="flex-row flex-wrap items-center gap-1.5 mt-1">
              {!e.active ? (
                <View className="px-2 py-0.5 rounded-full bg-border-soft">
                  <Text className="text-xs text-faint">{t.inactiveBadge}</Text>
                </View>
              ) : null}
              {e.access?.kind === 'active' ? (
                <View className="px-2 py-0.5 rounded-full bg-primary/10">
                  <Text className="text-xs font-semibold text-primary">{roleLabel(e.access.role, lang)}</Text>
                </View>
              ) : e.access?.kind === 'invited' ? (
                <View className="px-2 py-0.5 rounded-full bg-amber-100">
                  <Text className="text-xs font-semibold text-amber-700">{teamT.pendingBadge}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <Text className="text-xs text-faint mt-1">
            {ROLES[e.role] ?? e.role} · {PAY_TYPES[e.payType]} ${Number(e.payRate ?? 0).toFixed(2)}
            {e.phone ? ` · ${e.phone}` : ''}
          </Text>
        </View>
      </Pressable>
    );
  };

  // Hours tab — per-worker totals for the current pay period (small; plain ScrollView).
  const otherTabBody = (
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
      );

  // History tab — every logged/manual entry (all-time, not period-bound).
  // Virtualized via FlatList since it's no longer capped, so it stays smooth as
  // entries accumulate over the years.
  const historySearchBar = (
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
      {onLogHours ? (
        <Pressable
          onPress={onLogHours}
          className="flex-row items-center gap-1.5 bg-primary px-4 py-3 rounded-2xl active:opacity-90"
        >
          <Plus size={15} color="#fff" />
          <Text className="text-sm font-semibold text-white">{t.addHours}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const renderTimesheet = ({ item: ts, index: i }: { item: TimesheetListItem; index: number }) => {
    // Recreate the seamless card look with per-row rounding/borders.
    const isFirst = i === 0;
    const isLast = i === filteredTimesheets.length - 1;
    return (
      <View
        className={`flex-row items-center px-4 py-3 bg-card border-x border-border-soft ${
          isFirst ? 'rounded-t-2xl border-t' : ''
        } ${isLast ? 'rounded-b-2xl border-b' : 'border-b'}`}
      >
        <View className="flex-1 min-w-0 pr-2">
          <Text className="text-sm text-ink font-semibold" numberOfLines={1}>
            {ts.workerName ?? '—'}
          </Text>
          <Text className="text-xs text-faint mt-0.5" numberOfLines={1}>
            {new Date(ts.workDate + 'T00:00:00').toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
            {ts.jobDescription ? ` · ${ts.jobDescription}` : ''}
          </Text>
        </View>
        <Text className="text-sm font-semibold text-ink mr-1">
          {ts.hoursWorked ?? '—'}h
        </Text>
        {onEditTimesheet ? (
          <Pressable onPress={() => onEditTimesheet(ts.id)} hitSlop={8} className="p-2 active:opacity-60">
            <Pencil size={16} color={c.muted} />
          </Pressable>
        ) : null}
        {onDeleteTimesheet ? (
          <Pressable onPress={() => onDeleteTimesheet(ts.id)} hitSlop={8} className="p-2 active:opacity-60">
            <Trash2 size={16} color={c.danger} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-surface">
      {tab === 'empleados' ? (
        <FlatList
          data={employees.length === 0 ? [] : filteredEmployees}
          keyExtractor={e => e.id}
          renderItem={renderEmployee}
          ListHeaderComponent={teamHeader}
          ListEmptyComponent={
            <View className="items-center py-20">
              <UserCheck size={40} color={c.faint} />
              <Text className="text-sm text-faint mt-3">{t.emptyEmployees}</Text>
              {onAddEmployee ? (
                <Pressable onPress={onAddEmployee} className="mt-1">
                  <Text className="text-primary text-sm font-medium">{t.addFirst}</Text>
                </Pressable>
              ) : null}
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: selectionMode ? 320 : 176 }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={15}
          windowSize={7}
          maxToRenderPerBatch={10}
        />
      ) : tab === 'historial' ? (
        <FlatList
          data={filteredTimesheets}
          keyExtractor={ts => ts.id}
          renderItem={renderTimesheet}
          ListHeaderComponent={<>{topBar}{historySearchBar}</>}
          ListEmptyComponent={
            <View className="items-center py-20">
              <ClipboardList size={40} color={c.faint} />
              <Text className="text-sm text-faint mt-3">{tsSearch ? t.hoursNoResults : t.emptyTimesheets}</Text>
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 176 }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={15}
          windowSize={7}
          maxToRenderPerBatch={12}
        />
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="px-6 pt-6 pb-44" keyboardShouldPersistTaps="handled">
          {topBar}
          {otherTabBody}
          {modalsSlot}
        </ScrollView>
      )}
      {tab !== 'horas' ? modalsSlot : null}

    {/* New employee — floating action, bottom-right thumb reach. The Hours
       logged tab has its own inline "add entry" button. Hidden while selecting. */}
    {tab === 'empleados' && !selectionMode && onAddEmployee ? <Fab onPress={onAddEmployee} /> : null}

    {/* Bulk-delete pill — floating bottom-left, matching the jobs list. */}
    {tab === 'empleados' && selectionMode ? (
      <Pressable
        onPress={handleBulkDelete}
        disabled={selectedIds.size === 0 || !!bulkDeleting}
        className="absolute bottom-32 left-5 flex-row items-center gap-2 px-5 h-14 rounded-full"
        style={{
          backgroundColor: selectedIds.size === 0 || bulkDeleting ? '#D1D5DB' : '#DC2626',
          elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Trash2 size={20} color="#FFFFFF" />
        <Text className="text-white font-semibold">
          {`${t.bulkDelete}${selectedIds.size > 0 ? ` · ${selectedIds.size}` : ''}`}
        </Text>
      </Pressable>
    ) : null}

    {/* Filter bottom sheet — matches the jobs sort/group sheet. fade (not slide)
       so the dim backdrop doesn't read as a gray bar rising. */}
    <RNModal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
      <View className="flex-1 justify-end">
        <Pressable
          onPress={() => setFilterOpen(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
        />
        <View className="bg-card rounded-t-3xl px-5 pt-3 pb-10 max-h-[85%]">
          <View className="self-center w-10 h-1 rounded-full bg-border mb-4" />
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-base font-bold text-ink">{t.filter.button}</Text>
            <View className="flex-row items-center gap-3">
              {filtersActive ? (
                <Pressable onPress={clearFilters} hitSlop={8}>
                  <Text className="text-sm font-semibold text-muted">{t.filter.clear}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={8}>
                <Text className="text-sm font-semibold text-primary">{full.common.buttons.done}</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="gap-1.5">
              {filterFields.map(f => {
                const sel = filterSel[f.key] ?? [];
                const open = openField === f.key;
                const values = open ? valueCounts(f) : [];
                const vq = norm(valueSearch.trim());
                const shown = vq
                  ? values.filter(([v]) => norm(v === '' ? t.filter.empty : f.labelOf(v)).includes(vq))
                  : values;
                return (
                  <View key={f.key} className={`rounded-2xl overflow-hidden ${open ? 'bg-surface' : ''}`}>
                    <Pressable
                      onPress={() => { setOpenField(open ? null : f.key); setValueSearch(''); }}
                      className={`flex-row items-center justify-between px-4 py-3.5 rounded-2xl ${open ? '' : 'active:bg-surface'}`}
                    >
                      <View className="flex-row items-center gap-2">
                        <Text className={`text-base ${sel.length ? 'text-primary font-semibold' : 'text-ink font-medium'}`}>{f.label}</Text>
                        {sel.length ? (
                          <View className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary items-center justify-center">
                            <Text className="text-[11px] font-bold text-white">{sel.length}</Text>
                          </View>
                        ) : null}
                      </View>
                      <ChevronDown size={17} color={c.faint} style={open ? { transform: [{ rotate: '180deg' }] } : undefined} />
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
                            className="mb-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
                          />
                        ) : null}
                        <ScrollView className="max-h-64" nestedScrollEnabled>
                          {shown.map(([v, count]) => {
                            const on = sel.includes(v);
                            return (
                              <Pressable
                                key={v || '(empty)'}
                                onPress={() => toggleFilterValue(f.key, v)}
                                className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl active:bg-card"
                              >
                                <View className={`w-5 h-5 rounded-md border items-center justify-center ${on ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
                                  {on ? <Check size={13} color="#fff" /> : null}
                                </View>
                                <Text className={`flex-1 text-base ${v === '' ? 'italic text-faint' : on ? 'text-primary font-medium' : 'text-ink'}`} numberOfLines={1}>
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
            </View>
          </ScrollView>
        </View>
      </View>
    </RNModal>
    </View>
  );
}
