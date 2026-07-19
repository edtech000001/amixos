import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Briefcase, DollarSign, UserCheck, UserX, FileText, Award } from 'lucide-react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
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
 * Timeline of an employee's major milestones. Renders newest first.
 * Used by both mobile (inside a bottom sheet) and web (inside the
 * edit-employee modal).
 */
export function EmployeeHistoryView({ supabase, employeeId }: Props) {
  const { t: full, locale } = useLang();
  const c = useThemeColors();
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
      <View className="py-8 items-center">
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View className="py-8 items-center">
        <Text className="text-sm text-faint">{th.empty}</Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {entries.map((e) => {
        const Icon = ICONS[e.event_type] ?? FileText;
        const color = COLORS[e.event_type] ?? '#6B7280';
        const label = labelFor(e.event_type, t);
        const summary = summaryFor(e, t, locale);
        return (
          <View key={e.id} className="flex-row items-start gap-3">
            <View
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: `${color}1A` }}
            >
              <Icon size={16} color={color} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-ink">{label}</Text>
                <Text className="text-xs text-faint">
                  {formatDateLong(e.effective_date, locale)}
                </Text>
              </View>
              {summary ? (
                <Text className="text-sm text-muted mt-0.5">{summary}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
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

function summaryFor(
  e: EmployeeHistoryEntry,
  t: EmployeesT,
  _locale: string,
): string | null {
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
