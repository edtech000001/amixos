import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { ANDROID_WIDGET_KEY } from '@/widgets/widgetTaskHandler';
import { renderAmiWidget, type WidgetSnap } from '@/widgets/AmiAndroidWidgets';
import { todayLocalISO, formatTime12h, formatMoneyInput } from '@amixos/shared/lib/format';
import { can } from '@amixos/shared/lib/permissions';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';

// Feeds the home-screen widgets ("Hoy", "Cobros"): a small JSON snapshot,
// refreshed when the app opens or comes to the foreground.
//   iOS:     App Group defaults → targets/ami-widget/AmiHomeWidgets.swift
//   Android: AsyncStorage → widgets/AmiAndroidWidgets.tsx
// KEEP the shape in sync with both.
export const APP_GROUP = 'group.com.amixos.app';
const iosStorage = Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null;
const ANDROID_WIDGETS = ['AmiToday', 'AmiMoney'];

async function writeSnapshot(json: string | null) {
  if (iosStorage) {
    if (json) iosStorage.set('today', json);
    else iosStorage.remove('today');
    ExtensionStorage.reloadWidget();
  } else if (Platform.OS === 'android') {
    if (json) await AsyncStorage.setItem(ANDROID_WIDGET_KEY, json);
    else await AsyncStorage.removeItem(ANDROID_WIDGET_KEY);
    const snap = json ? (JSON.parse(json) as WidgetSnap) : null;
    for (const widgetName of ANDROID_WIDGETS) {
      await requestWidgetUpdate({ widgetName, renderWidget: info => renderAmiWidget(widgetName, snap, info.width) }).catch(() => {});
    }
  }
}

export function useWidgetSnapshot() {
  const { business, currentRole, activeLocationId, impersonating } = useApp();
  const { t: full } = useLang();
  const a = full.dashboard.assistant;

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    // Signed out / viewing as someone else: never leave another view's data on the home screen.
    if (!business || impersonating) {
      void writeSnapshot(null);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const supabase = createSupabaseClient();
      const today = todayLocalISO();
      const showInvoices = can.seeInvoices(currentRole);
      const showMoney = can.seeReports(currentRole);
      const monthStart = `${today.slice(0, 8)}01`;
      let jobsQ = supabase.from('jobs')
        .select('id, title, status, time_start, all_day, job_assignments(id)')
        .eq('business_id', business.id).is('archived_at', null)
        .not('status', 'in', '("cancelled","declined","posible","proposal","sent","accepted")')
        .lte('scheduled_date', today)
        .or(`end_date.gte.${today},and(end_date.is.null,scheduled_date.eq.${today})`)
        .limit(100);
      if (activeLocationId) jobsQ = jobsQ.eq('location_id', activeLocationId);
      const [jobsRes, invRes, paidRes] = await Promise.all([
        jobsQ,
        showInvoices
          ? supabase.from('invoices').select('total_amount, amount_paid', { count: 'exact' })
            .eq('business_id', business.id).in('status', ['sent', 'overdue']).lt('due_date', today).limit(500)
          : Promise.resolve(null),
        // "Cobros" widget: invoices paid this month, own share (bill-through excluded, like Reports).
        showMoney
          ? supabase.from('invoices').select('total_amount, passthrough_amount')
            .eq('business_id', business.id).eq('status', 'paid').gte('paid_at', `${monthStart}T00:00:00`).limit(1000)
          : Promise.resolve(null),
      ]);
      if (cancelled || jobsRes.error) return;
      type J = { title: string; status: string; time_start: string | null; all_day: boolean | null; job_assignments: unknown[] | null };
      const jobs = (jobsRes.data ?? []) as J[];
      const open = jobs.filter(j => j.status !== 'completed' && j.status !== 'invoiced')
        .sort((x, y) => (x.time_start ?? '99').localeCompare(y.time_start ?? '99'));
      const next = open[0];
      const inv = invRes && !invRes.error ? (invRes.data ?? []) as { total_amount: number; amount_paid: number | null }[] : null;
      const owed = inv ? inv.reduce((s, i) => s + Number(i.total_amount) - Number(i.amount_paid ?? 0), 0) : 0;
      await writeSnapshot(JSON.stringify({
        v: 1,
        date: today,
        business: business.name,
        jobs: jobs.length,
        done: jobs.length - open.length,
        unassigned: jobs.filter(j => !(j.job_assignments ?? []).length).length,
        next: next?.title ?? '',
        nextTime: next && !next.all_day ? formatTime12h(next.time_start) : '',
        // -1 = this role can't see invoices; the widget hides the row.
        overdue: inv ? (invRes?.count ?? inv.length) : -1,
        overdueAmount: inv ? `$${formatMoneyInput(owed.toFixed(0))}` : '',
        // Empty = this role can't see money; the Cobros widget says so.
        paidMonth: paidRes && !paidRes.error
          ? `$${formatMoneyInput(((paidRes.data ?? []) as { total_amount: number; passthrough_amount: number | null }[])
            .reduce((s, i) => s + Number(i.total_amount) - Number(i.passthrough_amount ?? 0), 0).toFixed(0))}`
          : '',
        labels: {
          title: a.widgetToday, jobs: a.widgetJobs, done: a.widgetDone, next: a.widgetNext,
          none: a.widgetNoJobs, unassigned: a.widgetUnassigned, overdue: a.widgetOverdue, talk: a.widgetTalk,
          money: a.widgetMoney, paidMonth: a.widgetPaidMonth, owed: a.widgetOwed, noAccess: a.widgetNoAccess, open: a.widgetOpenApp,
        },
      }));
    };
    void refresh();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void refresh(); });
    return () => { cancelled = true; sub.remove(); };
  }, [business?.id, business?.name, currentRole, activeLocationId, impersonating, a]); // eslint-disable-line react-hooks/exhaustive-deps
}
