import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal as RNModal } from 'react-native';
import { ChevronLeft, ChevronRight, Check, Banknote, FileText, Landmark, X, Wrench, Truck, Clock } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { DatePicker } from '../../ui';
import type { PayrollFrequency, PayrollBreakdown } from '../../lib/payroll';

export type PayMethod = 'cash' | 'check' | 'wire';

export interface PayrollScreenRow {
  employeeId: string;
  name: string;
  hours: number;
  payRate: number;
  payType: string;
  pay: number;
  /** Present when the worker has been marked paid for this period. */
  payment: { method: PayMethod; checkNumber: string | null } | null;
  /** Where the worker's hours came from (jobs + worked/driven split). */
  breakdown?: PayrollBreakdown;
}

export interface PayrollScreenProps {
  loading: boolean;
  frequency: PayrollFrequency;
  onFrequencyChange: (f: PayrollFrequency) => void;
  /** Pay-period start date (YYYY-MM-DD) anchoring every period, or null for legacy defaults. */
  anchorDate: string | null;
  onAnchorChange: (date: string) => void;
  periodLabel: string;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  rows: PayrollScreenRow[];
  onMarkPaid: (employeeId: string, method: PayMethod, checkNumber: string) => void;
  onUnmark: (employeeId: string) => void;
  onBack: () => void;
  canManage: boolean;
  busy?: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const FREQS: PayrollFrequency[] = ['weekly', 'biweekly', 'monthly'];

export function PayrollScreen({
  loading,
  frequency,
  onFrequencyChange,
  anchorDate,
  onAnchorChange,
  periodLabel,
  onPrevPeriod,
  onNextPeriod,
  rows,
  onMarkPaid,
  onUnmark,
  onBack,
  canManage,
  busy,
}: PayrollScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.reports.payroll;

  // Mark-paid sheet state.
  const [payRow, setPayRow] = useState<PayrollScreenRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [checkNumber, setCheckNumber] = useState('');
  // Worker whose hours breakdown sheet is open.
  const [detailRow, setDetailRow] = useState<PayrollScreenRow | null>(null);

  const freqLabel: Record<PayrollFrequency, string> = {
    weekly: t.freqWeekly,
    biweekly: t.freqBiweekly,
    monthly: t.freqMonthly,
  };

  const methodLabel: Record<PayMethod, string> = {
    cash: t.methodCash,
    check: t.methodCheck,
    wire: t.methodWire,
  };

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const totalPay = rows.reduce((s, r) => s + r.pay, 0);
  const paidCount = rows.filter(r => r.payment).length;
  // Unpaid first, paid sink to the bottom (stable — keeps pay-desc within group).
  const sortedRows = [...rows].sort((a, b) => (a.payment ? 1 : 0) - (b.payment ? 1 : 0));

  const openPay = (row: PayrollScreenRow) => {
    setPayRow(row);
    setEditing(false);
    setMethod('cash');
    setCheckNumber('');
  };
  const openEdit = (row: PayrollScreenRow) => {
    if (!row.payment) return;
    setPayRow(row);
    setEditing(true);
    setMethod(row.payment.method);
    setCheckNumber(row.payment.checkNumber ?? '');
  };
  const confirmPay = () => {
    if (!payRow) return;
    onMarkPaid(payRow.employeeId, method, method === 'check' ? checkNumber.trim() : '');
    setPayRow(null);
  };
  const removePay = () => {
    if (!payRow) return;
    onUnmark(payRow.employeeId);
    setPayRow(null);
  };

  const paymentBadgeLabel = (payment: NonNullable<PayrollScreenRow['payment']>) =>
    payment.method === 'check' && payment.checkNumber
      ? `${t.checkPrefix}${payment.checkNumber}`
      : methodLabel[payment.method];

  return (
    <View className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center px-2 pt-2 pb-3 border-b border-gray-100">
        <Pressable onPress={onBack} hitSlop={12} className="p-2 rounded-lg active:bg-gray-100">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="ml-1 flex-1">
          <Text className="text-base font-semibold text-gray-900">{t.title}</Text>
          <Text className="text-xs text-gray-400">{t.subtitle}</Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="px-5 py-5 pb-32 gap-4">
        {/* Frequency selector */}
        {canManage ? (
          <View>
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.freqLabel}</Text>
            <View className="flex-row gap-2">
              {FREQS.map(f => {
                const on = f === frequency;
                return (
                  <Pressable
                    key={f}
                    onPress={() => onFrequencyChange(f)}
                    className={`flex-1 py-2.5 rounded-xl items-center border ${on ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'}`}
                  >
                    <Text className={`text-sm font-semibold ${on ? 'text-primary' : 'text-gray-500'}`}>{freqLabel[f]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="mt-3">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.anchorLabel}</Text>
              <DatePicker value={anchorDate ?? ''} onChange={onAnchorChange} />
              <Text className="text-[11px] text-gray-400 mt-1.5">{t.anchorHint}</Text>
            </View>
          </View>
        ) : null}

        {/* Period navigator */}
        <View className="flex-row items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-2">
          <Pressable onPress={onPrevPeriod} hitSlop={8} className="p-2 rounded-xl active:bg-gray-100">
            <ChevronLeft size={20} color="#6B7280" />
          </Pressable>
          <Text className="text-sm font-semibold text-gray-900">{periodLabel}</Text>
          <Pressable onPress={onNextPeriod} hitSlop={8} className="p-2 rounded-xl active:bg-gray-100">
            <ChevronRight size={20} color="#6B7280" />
          </Pressable>
        </View>

        {/* Summary */}
        <View className="flex-row gap-3">
          <View className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <Text className="text-[11px] text-gray-400">{t.totalHours}</Text>
            <Text className="text-lg font-bold text-gray-900">{Math.round(totalHours * 100) / 100}</Text>
          </View>
          <View className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <Text className="text-[11px] text-gray-400">{t.totalPay}</Text>
            <Text className="text-lg font-bold text-primary">{fmt(totalPay)}</Text>
          </View>
        </View>
        {rows.length > 0 ? (
          <Text className="text-xs text-gray-400 -mt-1">
            {t.paidSummary.replace('{{paid}}', String(paidCount)).replace('{{total}}', String(rows.length))}
          </Text>
        ) : null}

        {/* Worker rows */}
        {loading ? (
          <View className="items-center py-10">
            <View className="flex-row gap-1">
              {[0, 1, 2].map(i => <View key={i} className="w-2 h-2 rounded-full bg-primary" />)}
            </View>
          </View>
        ) : rows.length === 0 ? (
          <Text className="text-sm text-gray-400 text-center py-10">{t.empty}</Text>
        ) : (
          <View className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {sortedRows.map((r, i) => (
              <View
                key={r.employeeId}
                className={`px-4 py-3.5 flex-row items-center gap-3 ${i < sortedRows.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                {/* Name/hours area opens the hours breakdown. */}
                <Pressable onPress={() => setDetailRow(r)} className="flex-1 min-w-0 flex-row items-center gap-1.5 active:opacity-60">
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{r.name}</Text>
                    <Text className="text-xs text-gray-400">
                      {Math.round(r.hours * 100) / 100} h · {fmt(r.payRate)}{r.payType === 'hourly' ? '/h' : ''}
                    </Text>
                  </View>
                  <ChevronRight size={14} color="#D1D5DB" />
                </Pressable>
                <View className="items-end">
                  <Text className="text-sm font-bold text-gray-900">{fmt(r.pay)}</Text>
                  {r.payment ? (
                    <Pressable onPress={() => canManage && openEdit(r)} disabled={!canManage}>
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <View className="px-2 py-0.5 rounded-full bg-emerald-100 flex-row items-center gap-1">
                          <Check size={11} color="#047857" />
                          <Text className="text-[11px] font-semibold text-emerald-700">
                            {paymentBadgeLabel(r.payment)}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  ) : canManage ? (
                    <Pressable onPress={() => openPay(r)} disabled={busy} className="mt-0.5">
                      <Text className="text-xs font-semibold text-primary">{t.markPaid}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Mark-paid sheet */}
      <RNModal visible={!!payRow} transparent animationType="fade" onRequestClose={() => setPayRow(null)}>
        <Pressable onPress={() => setPayRow(null)} className="flex-1 bg-black/40 justify-end">
          <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <Text className="text-lg font-bold text-gray-900">{payRow?.name}</Text>
            <Text className="text-sm text-gray-500 mb-4">{fmt(payRow?.pay ?? 0)} · {Math.round((payRow?.hours ?? 0) * 100) / 100} h</Text>

            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.methodHeading}</Text>
            <View className="flex-row gap-2 mb-4">
              {([['cash', Banknote, t.methodCash], ['check', FileText, t.methodCheck], ['wire', Landmark, t.methodWire]] as const).map(([m, Icon, label]) => {
                const on = method === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    className={`flex-1 py-3 rounded-2xl items-center gap-1 border ${on ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'}`}
                  >
                    <Icon size={16} color={on ? '#4F46E5' : '#9CA3AF'} />
                    <Text className={`text-xs font-semibold ${on ? 'text-primary' : 'text-gray-500'}`}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {method === 'check' ? (
              <View className="mb-4">
                <Text className="text-sm font-semibold text-gray-700 mb-2">{t.checkNumberLabel}</Text>
                <TextInput
                  value={checkNumber}
                  onChangeText={setCheckNumber}
                  placeholder={t.checkNumberPlaceholder}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                />
              </View>
            ) : null}

            <Pressable onPress={confirmPay} disabled={busy} className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
              <Text className="text-sm font-semibold text-white">{editing ? t.saveBtn : t.confirmBtn}</Text>
            </Pressable>
            {editing ? (
              <Pressable onPress={removePay} disabled={busy} className="py-3.5 mt-2 rounded-2xl items-center active:opacity-70 disabled:opacity-50">
                <Text className="text-sm font-semibold text-red-600">{t.removePayment}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </RNModal>

      {/* Worker hours breakdown sheet */}
      <RNModal visible={!!detailRow} transparent animationType="fade" onRequestClose={() => setDetailRow(null)}>
        <Pressable onPress={() => setDetailRow(null)} className="flex-1 bg-black/40 justify-end">
          <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[85%]">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-bold text-gray-900">{detailRow?.name}</Text>
                <Text className="text-sm text-gray-500">
                  {fmt(detailRow?.pay ?? 0)} · {Math.round((detailRow?.hours ?? 0) * 100) / 100} h
                </Text>
              </View>
              <Pressable onPress={() => setDetailRow(null)} hitSlop={10} className="p-1">
                <X size={20} color="#9CA3AF" />
              </Pressable>
            </View>

            {/* Worked vs driven vs logged */}
            <View className="flex-row gap-2 mb-4">
              {([[Wrench, t.hoursWorked, detailRow?.breakdown?.workedHours ?? 0], [Truck, t.hoursDriven, detailRow?.breakdown?.drivenHours ?? 0], [Clock, t.hoursLogged, detailRow?.breakdown?.loggedHours ?? 0]] as const).map(([Icon, label, val], i) => (
                <View key={i} className="flex-1 rounded-2xl border border-gray-100 bg-gray-50 p-3 items-center">
                  <Icon size={15} color="#9CA3AF" />
                  <Text className="text-base font-bold text-gray-900 mt-1">{val}</Text>
                  <Text className="text-[11px] text-gray-400">{label}</Text>
                </View>
              ))}
            </View>

            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.projectsHeading}</Text>
            {detailRow?.breakdown && detailRow.breakdown.jobs.length > 0 ? (
              <ScrollView className="max-h-72">
                <View className="gap-2">
                  {detailRow.breakdown.jobs.map((j, i) => (
                    <View key={j.jobId ?? i} className="flex-row items-center gap-3 rounded-2xl border border-gray-100 px-3 py-2.5">
                      <View className="flex-1 min-w-0">
                        <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{j.title || t.untitledJob}</Text>
                        {j.date ? <Text className="text-[11px] text-gray-400">{j.date}</Text> : null}
                      </View>
                      <View className="items-end">
                        {j.workedHours > 0 ? (
                          <View className="flex-row items-center gap-1">
                            <Wrench size={11} color="#9CA3AF" />
                            <Text className="text-xs text-gray-600">{j.workedHours} h</Text>
                          </View>
                        ) : null}
                        {j.drivenHours > 0 ? (
                          <View className="flex-row items-center gap-1">
                            <Truck size={11} color="#9CA3AF" />
                            <Text className="text-xs text-gray-600">{j.drivenHours} h</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text className="text-sm text-gray-400 py-4 text-center">{t.noBreakdown}</Text>
            )}
          </Pressable>
        </Pressable>
      </RNModal>
    </View>
  );
}
