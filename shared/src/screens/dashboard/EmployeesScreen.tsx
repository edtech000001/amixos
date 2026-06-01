import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import {
  Plus,
  Clock,
  ClipboardList,
  UserCheck,
  DollarSign,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { ROLE_LABELS } from '../../lib/permissions';
import type { AccessStatus } from '../../lib/teamPeople';

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
}

type Tab = 'empleados' | 'horas' | 'nomina';

export function EmployeesScreen({
  employees,
  timesheets,
  onAddEmployee,
  onEditEmployee,
  onToggleActive,
  onLogHours,
  modalsSlot,
}: EmployeesScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.employees;
  const teamT = full.dashboard.settings.team;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';
  const dateLocale = full.dashboard.dateLocale;
  const [tab, setTab] = useState<Tab>('empleados');

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
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pt-6 pb-36">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6 flex-wrap gap-3">
        <View>
          <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {t.summary
              .replace('{{active}}', String(activeCount))
              .replace('{{hours}}', String(totalHoursThisWeek))}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={onLogHours}
            className="flex-row items-center gap-1.5 bg-white border border-gray-200 px-4 py-2.5 rounded-xl active:bg-gray-50"
          >
            <Clock size={15} color="#374151" />
            <Text className="text-sm font-semibold text-gray-700">{t.logHours}</Text>
          </Pressable>
          <Pressable
            onPress={onAddEmployee}
            className="flex-row items-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl active:opacity-80"
          >
            <Plus size={15} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">{t.addBtn}</Text>
          </Pressable>
        </View>
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
        employees.length === 0 ? (
          <View className="items-center py-20">
            <UserCheck size={40} color="#D1D5DB" />
            <Text className="text-sm text-gray-400 mt-3">{t.emptyEmployees}</Text>
            <Pressable onPress={onAddEmployee} className="mt-1">
              <Text className="text-primary text-sm font-medium">{t.addFirst}</Text>
            </Pressable>
          </View>
        ) : (
          <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {employees.map((e, i) => (
              <Pressable
                key={e.id}
                onPress={() => onEditEmployee(e.id)}
                className={`flex-row items-start gap-3 px-5 py-4 active:bg-gray-50 ${
                  i < employees.length - 1 ? 'border-b border-gray-50' : ''
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
        )
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
  );
}
