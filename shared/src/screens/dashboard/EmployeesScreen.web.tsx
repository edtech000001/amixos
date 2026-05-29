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
  Pencil,
  UserCheck,
  UserX,
  DollarSign,
} from 'lucide-react';
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
        employees.length === 0 ? (
          <div className="flex flex-col items-center py-20">
            <UserCheck size={40} className="text-gray-300" />
            <p className="text-sm text-gray-400 mt-3">{t.emptyEmployees}</p>
            <button type="button" onClick={onAddEmployee} className="text-primary text-sm font-medium mt-1 hover:underline">
              {t.addFirst}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {employees.map((e, i) => (
              <div
                key={e.id}
                className={`flex items-center justify-between px-5 py-4 ${
                  i < employees.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      e.active ? 'bg-primary/10' : 'bg-gray-100'
                    }`}
                  >
                    <span className={`text-sm font-semibold ${e.active ? 'text-primary' : 'text-gray-400'}`}>
                      {e.firstName.charAt(0)}{e.lastName.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {e.firstName} {e.lastName}
                      </span>
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
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {ROLES[e.role] ?? e.role} · {PAY_TYPES[e.payType]} ${e.payRate.toFixed(2)}
                      {e.phone ? ` · ${e.phone}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEditEmployee(e.id)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Pencil size={14} className="text-gray-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleActive(e.id)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {e.active ? (
                      <UserX size={14} className="text-gray-400" />
                    ) : (
                      <UserCheck size={14} className="text-emerald-500" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
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
