import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { ANDROID_BUSINESSES_KEY, ANDROID_WIDGET_KEY, loadSnapForWidget } from '@/widgets/widgetTaskHandler';
import { renderAmiWidget } from '@/widgets/AmiAndroidWidgets';
import { todayLocalISO, formatTime12h, formatMoneyInput } from '@amixos/shared/lib/format';
import { can, type Role } from '@amixos/shared/lib/permissions';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useAuthStore } from '@/lib/auth/store';
import { useLang } from '@/lib/i18n/LangProvider';

// Feeds the home-screen widgets ("Hoy", "Cobros"): a small JSON snapshot per
// business the user belongs to, refreshed when the app opens or comes to the
// foreground. Each widget shows the business picked in its settings, or the
// one last open in the app.
//   iOS:     App Group defaults → targets/ami-widget/AmiHomeWidgets.swift
//            keys: "today" (open business), "today.<id>", "businesses" [{id,name}]
//   Android: AsyncStorage → widgets/ (same keys, prefixed)
// KEEP the shape in sync with both.
export const APP_GROUP = 'group.com.amixos.app';
const iosStorage = Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null;
const ANDROID_WIDGETS = ['AmiToday', 'AmiMoney'];
/** Widgets are glances — don't fan out to dozens of businesses on every foreground. */
const MAX_BUSINESSES = 10;

type Labels = Record<string, string>;
type Biz = { id: string; name: string };

/** Today's numbers for one business, as the role in THAT business may see them. */
async function buildSnapshot(biz: Biz, role: Role | null, locationId: string | null, labels: Labels): Promise<string | null> {
  const supabase = createSupabaseClient();
  const today = todayLocalISO();
  const showInvoices = can.seeInvoices(role);
  const showMoney = can.seeReports(role);
  const monthStart = `${today.slice(0, 8)}01`;
  let jobsQ = supabase.from('jobs')
    .select('id, title, status, time_start, all_day, job_assignments(id)')
    .eq('business_id', biz.id).is('archived_at', null)
    .not('status', 'in', '("cancelled","declined","posible","proposal","sent","accepted")')
    .lte('scheduled_date', today)
    .or(`end_date.gte.${today},and(end_date.is.null,scheduled_date.eq.${today})`)
    .limit(100);
  if (locationId) jobsQ = jobsQ.eq('location_id', locationId);
  const [jobsRes, invRes, paidRes] = await Promise.all([
    jobsQ,
    showInvoices
      ? supabase.from('invoices').select('total_amount, amount_paid', { count: 'exact' })
        .eq('business_id', biz.id).in('status', ['sent', 'overdue']).lt('due_date', today).limit(500)
      : Promise.resolve(null),
    // "Cobros": invoices paid this month, own share (bill-through excluded, like Reports).
    showMoney
      ? supabase.from('invoices').select('total_amount, passthrough_amount')
        .eq('business_id', biz.id).eq('status', 'paid').gte('paid_at', `${monthStart}T00:00:00`).limit(1000)
      : Promise.resolve(null),
  ]);
  if (jobsRes.error) return null;
  type J = { title: string; status: string; time_start: string | null; all_day: boolean | null; job_assignments: unknown[] | null };
  const jobs = (jobsRes.data ?? []) as J[];
  const open = jobs.filter(j => j.status !== 'completed' && j.status !== 'invoiced')
    .sort((x, y) => (x.time_start ?? '99').localeCompare(y.time_start ?? '99'));
  const next = open[0];
  const inv = invRes && !invRes.error ? (invRes.data ?? []) as { total_amount: number; amount_paid: number | null }[] : null;
  const owed = inv ? inv.reduce((s, i) => s + Number(i.total_amount) - Number(i.amount_paid ?? 0), 0) : 0;
  return JSON.stringify({
    v: 1,
    date: today,
    business: biz.name,
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
    labels,
  });
}

/** Writes every snapshot + the business list, drops businesses no longer
 *  listed, and refreshes the widgets. `snaps` empty = clear everything. */
async function writeAll(active: string | null, snaps: Record<string, string>, list: Biz[]) {
  if (iosStorage) {
    const prev = JSON.parse(iosStorage.get('businesses') ?? '[]') as Biz[];
    for (const b of prev) if (!snaps[b.id]) iosStorage.remove(`today.${b.id}`);
    for (const [id, json] of Object.entries(snaps)) iosStorage.set(`today.${id}`, json);
    if (active) iosStorage.set('today', active); else iosStorage.remove('today');
    iosStorage.set('businesses', JSON.stringify(list));
    ExtensionStorage.reloadWidget();
  } else if (Platform.OS === 'android') {
    const prev = JSON.parse((await AsyncStorage.getItem(ANDROID_BUSINESSES_KEY)) ?? '[]') as Biz[];
    await AsyncStorage.multiRemove(prev.filter(b => !snaps[b.id]).map(b => `${ANDROID_WIDGET_KEY}.${b.id}`));
    await AsyncStorage.multiSet(Object.entries(snaps).map(([id, json]) => [`${ANDROID_WIDGET_KEY}.${id}`, json]));
    if (active) await AsyncStorage.setItem(ANDROID_WIDGET_KEY, active); else await AsyncStorage.removeItem(ANDROID_WIDGET_KEY);
    await AsyncStorage.setItem(ANDROID_BUSINESSES_KEY, JSON.stringify(list));
    for (const widgetName of ANDROID_WIDGETS) {
      await requestWidgetUpdate({
        widgetName,
        renderWidget: async info => renderAmiWidget(widgetName, await loadSnapForWidget(info.widgetId), info.width),
      }).catch(() => {});
    }
  }
}

export function useWidgetSnapshot() {
  const { business, businesses, currentRole, activeLocationId, impersonating } = useApp();
  // Caller's role in EVERY business (each widget's numbers follow that business's role).
  const roles = useAuthStore(s => s.roles);
  const { t: full } = useLang();
  const a = full.dashboard.assistant;
  const bizKey = businesses.map(b => `${b.id}:${b.name}:${roles[b.id] ?? ''}`).join('|');

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    // Signed out / viewing as someone else: never leave another view's data on the home screen.
    if (!business || impersonating) {
      void writeAll(null, {}, []);
      return;
    }
    let cancelled = false;
    const labels: Labels = {
      title: a.widgetToday, jobs: a.widgetJobs, done: a.widgetDone, next: a.widgetNext,
      none: a.widgetNoJobs, unassigned: a.widgetUnassigned, overdue: a.widgetOverdue, talk: a.widgetTalk,
      money: a.widgetMoney, paidMonth: a.widgetPaidMonth, owed: a.widgetOwed, noAccess: a.widgetNoAccess, open: a.widgetOpenApp,
    };
    const refresh = async () => {
      // The open business first (and its branch); the rest business-wide.
      const others = businesses.filter(b => b.id !== business.id).slice(0, MAX_BUSINESSES - 1);
      const list: Biz[] = [{ id: business.id, name: business.name }, ...others.map(b => ({ id: b.id, name: b.name }))];
      const built = await Promise.all(list.map((b, i) =>
        buildSnapshot(b, i === 0 ? currentRole : (roles[b.id] ?? null), i === 0 ? activeLocationId : null, labels).catch(() => null),
      ));
      if (cancelled) return;
      const snaps: Record<string, string> = {};
      list.forEach((b, i) => { if (built[i]) snaps[b.id] = built[i]!; });
      await writeAll(snaps[business.id] ?? null, snaps, list.filter(b => snaps[b.id]));
    };
    void refresh();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void refresh(); });
    return () => { cancelled = true; sub.remove(); };
  }, [business?.id, business?.name, bizKey, currentRole, activeLocationId, impersonating, a]); // eslint-disable-line react-hooks/exhaustive-deps
}
