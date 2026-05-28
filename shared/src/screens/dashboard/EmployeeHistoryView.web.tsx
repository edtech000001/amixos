'use client';

// Web-only EmployeeHistoryView — plain HTML + Tailwind. Same exported API as
// EmployeeHistoryView.tsx so the web edit-employee modal resolves this variant
// automatically instead of rendering the RN version through react-native-web.

import { useEffect, useState } from 'react';
import { Briefcase, DollarSign, UserCheck, UserX, FileText, Award } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLang } from '../../i18n';
import { formatDateLong } from '../../lib/format';
import type { EmployeeHistoryEntry, EmployeeEventType } from '../../lib/employeeHistory';

interface Props {
  supabase: SupabaseClient;
  employeeId: string;
}

const ICONS: Record<EmployeeEventType, typeof Briefcase> = {
  hired: Award,
  pay_change: DollarSign,
  role_change: Briefcase,
  terminated: UserX,
  rehired: UserCheck,
  note: FileText,
};

const COLORS: Record<EmployeeEventType, string> = {
  hired: '#059669',
  pay_change: '#0891B2',
  role_change: '#7C3AED',
  terminated: '#EF4444',
  rehired: '#059669',
  note: '#6B7280',
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

/**
 * Timeline of an employee's major milestones (newest first). Web variant of
 * EmployeeHistoryView — rendered inside the edit-employee modal.
 */
export function EmployeeHistoryView({ supabase, employeeId }: Props) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.employees;
  const th = t.history;
  const [entries, setEntries] = useState<EmployeeHistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('employee_history')
        .select('*')
        .eq('employee_id', employeeId)
        .order('effective_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (!cancelled) setEntries((data ?? []) as EmployeeHistoryEntry[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, employeeId]);

  if (entries === null) {
    return (
      <div className="py-8 flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-8 flex items-center justify-center">
        <p className="text-sm text-gray-400">{th.empty}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((e) => {
        const Icon = ICONS[e.event_type] ?? FileText;
        const color = COLORS[e.event_type] ?? '#6B7280';
        const label = labelFor(e.event_type, t);
        const summary = summaryFor(e, t);
        return (
          <div key={e.id} className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${color}1A` }}
            >
              <Icon size={16} color={color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{label}</span>
                <span className="text-xs text-gray-400 shrink-0">
                  {formatDateLong(e.effective_date, locale)}
                </span>
              </div>
              {summary ? <p className="text-sm text-gray-600 mt-0.5">{summary}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type EmployeesT = ReturnType<typeof useLang>['t']['dashboard']['employees'];

function labelFor(type: EmployeeEventType, t: EmployeesT): string {
  const ev = t.history.events;
  switch (type) {
    case 'hired': return ev.hired;
    case 'pay_change': return ev.payChange;
    case 'role_change': return ev.roleChange;
    case 'terminated': return ev.terminated;
    case 'rehired': return ev.rehired;
    case 'note': return ev.note;
  }
}

function summaryFor(e: EmployeeHistoryEntry, t: EmployeesT): string | null {
  const d = e.details ?? {};
  const ROLES = t.roles as Record<string, string>;
  const PAY_TYPES = t.payTypes as Record<string, string>;

  switch (e.event_type) {
    case 'pay_change': {
      const fromRate = typeof d.from_rate === 'number' ? d.from_rate : null;
      const toRate = typeof d.to_rate === 'number' ? d.to_rate : null;
      const fromType = typeof d.from_type === 'string' ? d.from_type : null;
      const toType = typeof d.to_type === 'string' ? d.to_type : null;
      const parts: string[] = [];
      if (fromRate !== null && toRate !== null && fromRate !== toRate) {
        parts.push(t.history.payChangeSummary
          .replace('{{from}}', fmtMoney(fromRate))
          .replace('{{to}}', fmtMoney(toRate)));
      }
      if (fromType && toType && fromType !== toType) {
        parts.push(t.history.payChangeTypeSummary
          .replace('{{fromType}}', PAY_TYPES[fromType] ?? fromType)
          .replace('{{toType}}', PAY_TYPES[toType] ?? toType));
      }
      return parts.join(' · ') || null;
    }
    case 'role_change': {
      const from = typeof d.from === 'string' ? d.from : '';
      const to = typeof d.to === 'string' ? d.to : '';
      return t.history.roleChangeSummary
        .replace('{{from}}', ROLES[from] ?? from)
        .replace('{{to}}', ROLES[to] ?? to);
    }
    case 'hired': {
      const role = typeof d.role === 'string' ? d.role : '';
      const rate = typeof d.rate === 'number' ? d.rate : 0;
      return t.history.hiredSummary
        .replace('{{role}}', ROLES[role] ?? role)
        .replace('{{rate}}', fmtMoney(rate));
    }
    case 'note': {
      return typeof d.text === 'string' ? d.text : null;
    }
    case 'terminated':
    case 'rehired':
      return null;
  }
}
