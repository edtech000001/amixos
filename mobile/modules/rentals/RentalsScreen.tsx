// Rental Properties module — mobile. Registered in
// mobile/app/dashboard/mas/modulos/[moduleId].tsx (no route file of its own).
//
// Mirrors web/src/modules/rentals: three top tabs (Resumen | Propiedades |
// Inquilinos), property detail as an internal full-screen state with section
// tabs, and bottom-sheet forms per the CLAUDE.md sheet contract (absolute
// backdrop Pressable FIRST child + sibling card; pickers inside a sheet render
// as in-modal overlays, never a nested RNModal). Ledger math lives in
// shared/lib/rentals.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Linking, Modal as RNModal,
  Platform, Pressable, ScrollView, Share, Text, TextInput, View, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import {
  Building2, Camera, ChevronDown, ChevronLeft, ChevronRight, FileText, Home,
  BadgeX, Download, ImagePlus, Pencil, Phone, Plus, RotateCw, Search, Star, Trash2, Users, Wrench, X,
} from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { DatePicker, Select } from '@amixos/shared/ui';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { swrRead, swrWrite } from '@amixos/shared/lib/swrCache';
import {
  agingBuckets,
  buildMonthlySeries,
  cashTotals,
  currentPeriod,
  depositsHeld,
  monthRange,
  monthSummary,
  monthToMonthCount,
  monthsBack,
  periodOf,
  propertyPerformance,
  shiftMonth,
  upcomingExpirations,
  vacantUnits,
  yearStart,
} from '@amixos/shared/lib/rentalsAnalytics';
import { expensesByCategory } from '@amixos/shared/lib/rentalsAnalytics';
import { buildRentalStatementHtml } from '@amixos/shared/lib/rentalsReportHtml';
import { csvCell } from '@amixos/shared/lib/clientShare';
import { secureShareToken } from '@amixos/shared/lib/shareToken';
import { WEB_APP_URL } from '@/lib/webUrl';
import { SignaturePad } from '@/components/SignaturePad';
import { signedUrl, useSignedUrls } from '@amixos/shared/lib/storageUrls';
import { logAudit } from '@amixos/shared/lib/audit';
import { can } from '@amixos/shared/lib/permissions';
import { formatDateLong, formatPhoneInput, formatDateTimeLong } from '@amixos/shared/lib/format';
import { toUsStateAbbr, usStateName } from '@amixos/shared/lib/usStates';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import {
  EXPENSE_CATEGORIES,
  LEASE_DOC_MAX_BYTES,
  MAX_DOCS_PER_LEASE,
  MAX_PHOTOS_PER_PROPERTY,
  PAY_TOLERANCE,
  PROPERTY_TYPES,
  RENTALS_BUCKET,
  chargeDaysLate,
  chargeStatus,
  leaseBalance,
  leaseExpirationDays,
  occupancy,
  rentalLeaseDocPath,
  rentalPaymentPhotoPath,
  rentalPropertyPhotoPath,
  rentalReceiptPath,
  rentalUid,
  tenantName,
  type ChargeStatus,
  type ExpenseCategory,
  type MaintenanceStatus,
  type RentalCharge,
  type RentalExpense,
  type RentalLease,
  type RentalLeaseDocument,
  type RentalMaintenance,
  type RentalPayment,
  type RentalProperty,
  type RentalPropertyPhoto,
  type RentalTenant,
} from '@amixos/shared/lib/rentals';
import {
  fetchAllLeases,
  fetchAllTenants,
  fetchChargesForProperty,
  fetchExpensesForProperty,
  fetchExpensesInRange,
  fetchMaintenanceForProperty,
  fetchPaymentsForLeases,
  fetchRentalPropertiesCount,
  fetchRentalPropertiesPage,
  generateChargesForLeases,
  generateLateFees,
  type RentalPropertyCursor, fetchChargesForLeases, fetchAllCharges, fetchAllPayments } from '@amixos/shared/lib/rentalsQuery';

type TabKey = 'overview' | 'properties' | 'tenants';
type DetailTab = 'overview' | 'leases' | 'ledger' | 'expenses' | 'maintenance' | 'photos';

interface EmployeeOption { id: string; first_name: string; last_name: string; active: boolean }

const cleanMoney = (s: string) => {
  let v = s.replace(/[^0-9.]/g, '');
  const dot = v.indexOf('.');
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return v;
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const EMPTY_PROP_FORM = {
  name: '', address: '', city: '', state: '', zip: '', property_type: '',
  unit_count: '', purchase_date: '', purchase_price: '', notes: '',
  status: 'active' as 'active' | 'inactive', location_id: '',
};
const EMPTY_TENANT_FORM = {
  first_name: '', last_name: '', phone: '', email: '',
  emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relation: '', notes: '',
};
const EMPTY_LEASE_FORM = {
  tenant_id: '', unit_label: '', start_date: '', end_date: '',
  monthly_rent: '', due_day: '1', deposit_amount: '', notes: '',
  late_fee_amount: '', late_fee_grace_days: '5', prorate_partial: false,
};
const EMPTY_EXPENSE_FORM = {
  expense_date: '', amount: '', category: 'repairs' as ExpenseCategory, vendor: '', note: '',
};
const EMPTY_MAINT_FORM = {
  title: '', description: '', status: 'open' as MaintenanceStatus, reported_on: '',
  completed_on: '', cost: '', fixed_by: '', employee_id: '', createExpense: true,
};

export default function RentalsScreen() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, locations, activeLocationId, myHomeLocationId, currentRole } = useApp();
  const canEdit = can.editRentals(currentRole);
  const canCreate = can.createRentals(currentRole);
  const canDelete = can.deleteRentals(currentRole);
  const multiLocation = (locations?.length ?? 0) > 1;
  const { t: full, locale } = useLang();
  const dateLoc = full.dashboard.dateLocale;
  const t = full.dashboard.modules.rentals;
  const tc = full.common;
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<TabKey>('overview');
  const [detail, setDetail] = useState<RentalProperty | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');

  const monthLabel = useCallback((periodStart: string) => {
    const [y, m] = periodStart.split('-').map(Number);
    const s = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-MX', { month: 'long', year: 'numeric' })
      .format(new Date(y, (m ?? 1) - 1, 1));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [locale]);

  /** Three-letter month for the trend axis. */
  const shortMonthLabel = useCallback((periodStart: string) => {
    const [y, m] = periodStart.split('-').map(Number);
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-MX', { month: 'short' })
      .format(new Date(y, (m ?? 1) - 1, 1));
  }, [locale]);

  // ── Properties list ─────────────────────────────────────────────────────────
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverTotal, setServerTotal] = useState(0);
  const [cursor, setCursor] = useState<RentalPropertyCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [coverPhotos, setCoverPhotos] = useState<Record<string, RentalPropertyPhoto>>({});
  const [loadSeq, setLoadSeq] = useState(0);

  const loadCovers = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data } = await supabase.from('rental_property_photos').select('*')
      .in('property_id', ids).order('is_cover', { ascending: false }).order('created_at');
    setCoverPhotos(prev => {
      const next = { ...prev };
      for (const p of (data as RentalPropertyPhoto[] | null) ?? []) {
        if (!next[p.property_id]) next[p.property_id] = p;
      }
      return next;
    });
  }, [supabase]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    const base = { businessId: business.id, locationId: activeLocationId ?? null, search: debouncedSearch };
    const cacheKey = `rentals_props_${business.id}_${activeLocationId ?? 'all'}`;
    (async () => {
      if (!debouncedSearch.trim()) {
        const cached = await swrRead<{ items: RentalProperty[]; total: number }>(cacheKey);
        if (cached?.data && !cancelled) {
          setProperties(prev => (prev.length ? prev : cached.data.items));
          setServerTotal(prev => prev || cached.data.total);
          setLoading(false);
          void loadCovers(cached.data.items.map(r => r.id));
        }
      }
      try {
        const [page, total] = await Promise.all([
          fetchRentalPropertiesPage<RentalProperty>(supabase, '*', { ...base, pageSize: 50 }),
          fetchRentalPropertiesCount(supabase, base),
        ]);
        if (cancelled) return;
        setProperties(page.items);
        setCursor(page.nextCursor);
        setServerTotal(total);
        if (!debouncedSearch.trim()) void swrWrite(cacheKey, { items: page.items.slice(0, 50), total });
        await loadCovers(page.items.map(r => r.id));
      } catch { /* offline — keep cache */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, debouncedSearch, activeLocationId, loadSeq]);

  const reRun = () => setLoadSeq(n => n + 1);

  const loadMore = async () => {
    if (!business || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchRentalPropertiesPage<RentalProperty>(supabase, '*', {
        businessId: business.id, locationId: activeLocationId ?? null, search: debouncedSearch,
        cursor, pageSize: 50,
      });
      setProperties(prev => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      await loadCovers(page.items.map(r => r.id));
    } catch { /* offline */ }
    finally { setLoadingMore(false); }
  };

  // ── Tenants + leases (module-wide) ──────────────────────────────────────────
  const [tenants, setTenants] = useState<RentalTenant[]>([]);
  const [leases, setLeases] = useState<RentalLease[]>([]);

  // ── Tenant detail (contact + lease history + quick totals) ────────────────
  const [tenantDetail, setTenantDetail] = useState<RentalTenant | null>(null);
  const [tdPropNames, setTdPropNames] = useState<Record<string, string>>({});
  const [tdCharges, setTdCharges] = useState<RentalCharge[]>([]);
  const [tdPayments, setTdPayments] = useState<RentalPayment[]>([]);
  const tdLeases = useMemo(
    () => (tenantDetail ? leases.filter(l => l.tenant_id === tenantDetail.id)
      .sort((a, b) => (a.status === b.status ? b.start_date.localeCompare(a.start_date) : a.status === 'active' ? -1 : 1)) : []),
    [tenantDetail, leases],
  );
  useEffect(() => {
    if (!tenantDetail) return;
    let cancelled = false;
    const mine = leases.filter(l => l.tenant_id === tenantDetail.id);
    const leaseIds = mine.map(l => l.id);
    const propIds = Array.from(new Set(mine.map(l => l.property_id)));
    void (async () => {
      const [propsRes, charges, payments] = await Promise.all([
        propIds.length
          ? supabase.from('rental_properties').select('id, name').in('id', propIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        fetchChargesForLeases(supabase, leaseIds),
        fetchPaymentsForLeases(supabase, leaseIds),
      ]);
      if (cancelled) return;
      const names: Record<string, string> = {};
      for (const pr of (propsRes.data as { id: string; name: string }[] | null) ?? []) names[pr.id] = pr.name;
      setTdPropNames(names);
      setTdCharges(charges);
      setTdPayments(payments);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantDetail?.id, leases]);
  const tdTotalPaid = useMemo(() => tdPayments.reduce((s2, pmt) => s2 + pmt.amount, 0), [tdPayments]);
  const tdBalance = useMemo(
    () => Math.max(0, tdCharges.reduce((s2, ch) => s2 + ch.amount, 0) - tdTotalPaid),
    [tdCharges, tdTotalPaid],
  );
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleSeq, setPeopleSeq] = useState(0);

  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    const cacheKey = `rentals_people_${business.id}`;
    (async () => {
      const cached = await swrRead<{ tenants: RentalTenant[]; leases: RentalLease[] }>(cacheKey);
      if (cached?.data && !cancelled) {
        setTenants(prev => (prev.length ? prev : cached.data.tenants));
        setLeases(prev => (prev.length ? prev : cached.data.leases));
        setPeopleLoading(false);
      }
      try {
        const [tn, ls] = await Promise.all([
          fetchAllTenants(supabase, business.id),
          fetchAllLeases(supabase, business.id),
        ]);
        if (cancelled) return;
        setTenants(tn);
        setLeases(ls);
        void swrWrite(cacheKey, { tenants: tn, leases: ls });
        if (canEdit) {
          // Rent first, then fees (a fee is only owed on an unpaid rent row).
          const changed = await generateChargesForLeases(supabase, ls).catch(() => false);
          const feesChanged = await generateLateFees(supabase, business.id, ls).catch(() => false);
          if ((changed || feesChanged) && !cancelled) {
            const fresh = await fetchAllLeases(supabase, business.id);
            if (!cancelled) {
              setLeases(fresh);
              void swrWrite(cacheKey, { tenants: tn, leases: fresh });
            }
          }
        }
      } catch { /* offline */ }
      finally { if (!cancelled) setPeopleLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, canEdit, peopleSeq]);

  const reloadPeople = () => setPeopleSeq(n => n + 1);
  const activeLeases = useMemo(() => leases.filter(l => l.status === 'active'), [leases]);
  const tenantOf = useCallback((id: string) => tenants.find(x => x.id === id) ?? null, [tenants]);

  // ── Overview data (month-navigable + portfolio analytics) ───────────────────
  // Charges and payments load WHOLE (paginated) so aging, all-time balances,
  // the 12-month trend and YTD all resolve without extra round trips — same
  // shape as the web Overview so both platforms show identical numbers.
  const [period, setPeriod] = useState(() => currentPeriod());
  const [allCharges, setAllCharges] = useState<RentalCharge[]>([]);
  const [allPayments, setAllPayments] = useState<RentalPayment[]>([]);
  const [overviewExpenses, setOverviewExpenses] = useState<RentalExpense[]>([]);
  const [monthLoading, setMonthLoading] = useState(true);

  const trendPeriods = useMemo(() => monthsBack(period, 12), [period]);
  const monthBounds = useMemo(() => monthRange(period), [period]);
  const ytdFrom = useMemo(() => yearStart(period), [period]);

  // Deliberately NOT keyed on the selected month — stepping months must not
  // refetch the whole ledger or flash the spinner.
  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    setMonthLoading(true);
    (async () => {
      try {
        const [ch, pays] = await Promise.all([
          fetchAllCharges(supabase, business.id),
          fetchAllPayments(supabase, business.id),
        ]);
        if (cancelled) return;
        setAllCharges(ch);
        setAllPayments(pays);
      } catch { /* offline */ }
      finally { if (!cancelled) setMonthLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, leases]);

  // Expenses cover only the window the selected month needs — follows the
  // stepper, silently.
  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    const expFrom = trendPeriods[0] < ytdFrom ? trendPeriods[0] : ytdFrom;
    fetchExpensesInRange(supabase, business.id, expFrom, monthBounds.to)
      .then(exp => { if (!cancelled) setOverviewExpenses(exp); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, trendPeriods[0], ytdFrom, monthBounds.to]);

  const monthCharges = useMemo(
    () => allCharges.filter(ch => periodOf(ch.period_start) === period),
    [allCharges, period],
  );
  const monthPayments = allPayments;
  const summary = useMemo(() => monthSummary(monthCharges, allPayments), [monthCharges, allPayments]);
  const held = useMemo(() => depositsHeld(leases), [leases]);
  const ytd = useMemo(
    () => cashTotals(ytdFrom, monthBounds.to, allPayments, overviewExpenses),
    [ytdFrom, monthBounds.to, allPayments, overviewExpenses],
  );
  const series = useMemo(
    () => buildMonthlySeries(trendPeriods, allCharges, allPayments, overviewExpenses),
    [trendPeriods, allCharges, allPayments, overviewExpenses],
  );
  const aging = useMemo(() => agingBuckets(allCharges, allPayments), [allCharges, allPayments]);
  const perf = useMemo(
    () => propertyPerformance(properties, leases, allCharges, allPayments, overviewExpenses, period, ytdFrom, monthBounds.to),
    [properties, leases, allCharges, allPayments, overviewExpenses, period, ytdFrom, monthBounds.to],
  );
  const expiringSoon = useMemo(() => upcomingExpirations(leases, 60), [leases]);
  const vacant = useMemo(() => vacantUnits(properties, activeLeases), [properties, activeLeases]);
  const mtmCount = useMemo(() => monthToMonthCount(leases), [leases]);
  const monthExpensesTotal = useMemo(
    () => overviewExpenses
      .filter(e => e.expense_date >= monthBounds.from && e.expense_date <= monthBounds.to)
      .reduce((sum, e) => sum + e.amount, 0),
    [overviewExpenses, monthBounds],
  );

  // ── Property detail data ────────────────────────────────────────────────────
  const [propLeases, setPropLeases] = useState<RentalLease[]>([]);
  const [propCharges, setPropCharges] = useState<RentalCharge[]>([]);
  const [propPayments, setPropPayments] = useState<RentalPayment[]>([]);
  const [propExpenses, setPropExpenses] = useState<RentalExpense[]>([]);
  const [propMaint, setPropMaint] = useState<RentalMaintenance[]>([]);
  const [propPhotos, setPropPhotos] = useState<RentalPropertyPhoto[]>([]);
  const [docsByLease, setDocsByLease] = useState<Record<string, RentalLeaseDocument[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const reloadDetail = useCallback(async (propertyId: string) => {
    if (!business) return;
    const [ls, ch, ex, mt, phRes] = await Promise.all([
      fetchAllLeases(supabase, business.id, { propertyId }),
      fetchChargesForProperty(supabase, propertyId),
      fetchExpensesForProperty(supabase, propertyId),
      fetchMaintenanceForProperty(supabase, propertyId),
      supabase.from('rental_property_photos').select('*').eq('property_id', propertyId).order('created_at'),
    ]);
    const pays = await fetchPaymentsForLeases(supabase, ls.map(l => l.id));
    const { data: docRows } = ls.length
      ? await supabase.from('rental_lease_documents').select('*').in('lease_id', ls.map(l => l.id)).order('created_at')
      : { data: [] };
    setPropLeases(ls);
    setPropCharges(ch);
    setPropPayments(pays);
    setPropExpenses(ex.sort((a, b) => b.expense_date.localeCompare(a.expense_date)));
    setPropMaint(mt.sort((a, b) => b.reported_on.localeCompare(a.reported_on)));
    setPropPhotos((phRes.data as RentalPropertyPhoto[] | null) ?? []);
    const byLease: Record<string, RentalLeaseDocument[]> = {};
    for (const d of (docRows as RentalLeaseDocument[] | null) ?? []) (byLease[d.lease_id] ??= []).push(d);
    setDocsByLease(byLease);
    setDetailLoading(false);
  }, [business, supabase]);

  const openDetail = (p: RentalProperty) => {
    setDetail(p);
    setDetailTab('overview');
    setDetailLoading(true);
    void reloadDetail(p.id);
  };

  useEffect(() => {
    if (!business) return;
    void fetchAllById<EmployeeOption>((afterId, pageSize) => {
      let q = supabase.from('employees_roster').select('id, first_name, last_name, active')
        .eq('business_id', business.id).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    }).then(setEmployees).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const paymentsByCharge = useMemo(() => {
    const m = new Map<string, RentalPayment[]>();
    for (const p of propPayments) (m.get(p.charge_id) ?? m.set(p.charge_id, []).get(p.charge_id)!).push(p);
    return m;
  }, [propPayments]);
  const paidOn = useCallback(
    (chargeId: string) => (paymentsByCharge.get(chargeId) ?? []).reduce((s, p) => s + p.amount, 0),
    [paymentsByCharge],
  );
  const chargesByLease = useMemo(() => {
    const m = new Map<string, RentalCharge[]>();
    for (const ch of propCharges) (m.get(ch.lease_id) ?? m.set(ch.lease_id, []).get(ch.lease_id)!).push(ch);
    m.forEach(arr => arr.sort((a, b) => b.period_start.localeCompare(a.period_start)));
    return m;
  }, [propCharges]);

  // ── Photo helpers (camera/library chooser as in-modal overlay in sheets;
  //    standalone RNModal chooser when no sheet is open) ──────────────────────
  const pickImage = async (source: 'camera' | 'library'): Promise<string | null> => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const r = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    return !r.canceled && r.assets[0] ? r.assets[0].uri : null;
  };

  const uploadImage = async (uri: string, path: string): Promise<boolean> => {
    try {
      const blob = await fetch(uri).then(r => r.blob());
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const { error } = await supabase.storage.from(RENTALS_BUCKET)
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
      return !error;
    } catch { return false; }
  };

  const removeStorage = (paths: Array<string | null | undefined>) => {
    const clean = paths.filter((p): p is string => !!p);
    if (clean.length) void supabase.storage.from(RENTALS_BUCKET).remove(clean).then(() => {}, () => {});
  };

  // ── Property form sheet ─────────────────────────────────────────────────────
  const [propFormOpen, setPropFormOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<RentalProperty | null>(null);
  const [propForm, setPropForm] = useState(EMPTY_PROP_FORM);
  const [savingProp, setSavingProp] = useState(false);

  // Photos queued while ADDING (no property row yet) — uploaded after insert.
  const [pendingPhotoUris, setPendingPhotoUris] = useState<string[]>([]);
  const [propPhotoChooserOpen, setPropPhotoChooserOpen] = useState(false);

  const openAddProp = () => {
    setEditingProp(null);
    setPropForm({ ...EMPTY_PROP_FORM, location_id: activeLocationId ?? myHomeLocationId ?? '' });
    setPendingPhotoUris([]);
    setPropPhotoChooserOpen(false);
    setPropFormOpen(true);
  };
  const openEditProp = (p: RentalProperty) => {
    setEditingProp(p);
    setPropForm({
      // Legacy free-text states ("Nebraska") normalize into the picker's
      // 2-letter values; unknown text passes through untouched.
      name: p.name, address: p.address ?? '', city: p.city ?? '', state: toUsStateAbbr(p.state),
      zip: p.zip ?? '', property_type: p.property_type ?? '',
      unit_count: p.unit_count ? String(p.unit_count) : '',
      purchase_date: p.purchase_date ?? '',
      purchase_price: p.purchase_price != null ? String(p.purchase_price) : '',
      notes: p.notes ?? '', status: p.status, location_id: p.location_id ?? '',
    });
    setPendingPhotoUris([]);
    setPropPhotoChooserOpen(false);
    setPropFormOpen(true);
  };

  const pickPropFormPhoto = async (source: 'camera' | 'library') => {
    setPropPhotoChooserOpen(false);
    if (pendingPhotoUris.length >= MAX_PHOTOS_PER_PROPERTY) {
      Alert.alert('', t.photos.limitHit.replace('{{max}}', String(MAX_PHOTOS_PER_PROPERTY)));
      return;
    }
    const uri = await pickImage(source);
    if (uri) setPendingPhotoUris(prev => [...prev, uri]);
  };

  const saveProp = async () => {
    if (!business || !propForm.name.trim()) return;
    setSavingProp(true);
    const payload = {
      business_id: business.id,
      name: propForm.name.trim(),
      address: propForm.address.trim() || null,
      city: propForm.city.trim() || null,
      state: propForm.state.trim() || null,
      zip: propForm.zip.trim() || null,
      property_type: propForm.property_type || null,
      unit_count: propForm.unit_count ? parseInt(propForm.unit_count, 10) : null,
      purchase_date: propForm.purchase_date || null,
      purchase_price: propForm.purchase_price ? Number(propForm.purchase_price) : null,
      notes: propForm.notes.trim() || null,
      status: propForm.status,
      ...(multiLocation ? { location_id: propForm.location_id || null } : {}),
    };
    if (!editingProp) {
      const { data, error } = await supabase.from('rental_properties')
        .insert({ ...payload, created_by: user?.id ?? null }).select().single();
      if (error) { Alert.alert('', t.saveError); setSavingProp(false); return; }
      const created = data as RentalProperty;
      // Flush photos queued while adding, now that the row exists.
      let photoFailed = false;
      for (const uri of pendingPhotoUris) {
        const path = rentalPropertyPhotoPath(business.id, created.id, rentalUid());
        if (await uploadImage(uri, path)) {
          const { error: insErr } = await supabase.from('rental_property_photos').insert({
            business_id: business.id, property_id: created.id, storage_path: path,
            created_by: user?.id ?? null,
          });
          if (insErr) photoFailed = true;
        } else photoFailed = true;
      }
      if (photoFailed) Alert.alert('', t.photos.uploadError);
      setPendingPhotoUris([]);
      if (pendingPhotoUris.length) { setCoverPhotos({}); void loadCovers([created.id]); }
      void logAudit(supabase, business.id, 'rental_property.created', 'rental_property', created.id, { name: payload.name });
    } else {
      const { error } = await supabase.from('rental_properties').update(payload).eq('id', editingProp.id);
      if (error) { Alert.alert('', t.saveError); setSavingProp(false); return; }
      if (detail?.id === editingProp.id) setDetail({ ...detail, ...payload } as RentalProperty);
      void logAudit(supabase, business.id, 'rental_property.updated', 'rental_property', editingProp.id, { name: payload.name });
    }
    setSavingProp(false);
    setPropFormOpen(false);
    reRun();
  };

  const deleteProp = async (p: RentalProperty) => {
    if (!business) return;
    if (!(await confirm({ title: t.deleteConfirmTitle, message: t.deleteConfirmBody, destructive: true }))) return;
    const { data: leaseRows } = await supabase.from('rental_leases').select('id').eq('property_id', p.id);
    const leaseIds = ((leaseRows as { id: string }[] | null) ?? []).map(r => r.id);
    const empty = Promise.resolve({ data: [] });
    const [ph, docs, pays, exps, maintPh] = await Promise.all([
      supabase.from('rental_property_photos').select('storage_path').eq('property_id', p.id),
      leaseIds.length ? supabase.from('rental_lease_documents').select('storage_path').in('lease_id', leaseIds) : empty,
      leaseIds.length ? supabase.from('rental_payments').select('photo_path').in('lease_id', leaseIds) : empty,
      supabase.from('rental_expenses').select('receipt_path').eq('property_id', p.id),
      supabase.from('rental_maintenance_photos').select('storage_path, rental_maintenance!inner(property_id)').eq('rental_maintenance.property_id', p.id),
    ]);
    const { error } = await supabase.from('rental_properties').delete().eq('id', p.id);
    if (error) return;
    removeStorage([
      ...(((ph as { data: { storage_path: string }[] | null }).data) ?? []).map(r => r.storage_path),
      ...(((docs as { data: { storage_path: string }[] | null }).data) ?? []).map(r => r.storage_path),
      ...(((pays as { data: { photo_path: string | null }[] | null }).data) ?? []).map(r => r.photo_path),
      ...(((exps as { data: { receipt_path: string | null }[] | null }).data) ?? []).map(r => r.receipt_path),
      ...(((maintPh as { data: { storage_path: string }[] | null }).data) ?? []).map(r => r.storage_path),
    ]);
    void logAudit(supabase, business.id, 'rental_property.deleted', 'rental_property', p.id, { name: p.name });
    setDetail(null);
    reloadPeople();
    reRun();
  };

  // ── Tenant form sheet ───────────────────────────────────────────────────────
  const [tenantFormOpen, setTenantFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<RentalTenant | null>(null);
  const [tenantForm, setTenantForm] = useState(EMPTY_TENANT_FORM);
  const [savingTenant, setSavingTenant] = useState(false);

  const openAddTenant = () => { setEditingTenant(null); setTenantForm(EMPTY_TENANT_FORM); setTenantFormOpen(true); };
  const openEditTenant = (tn: RentalTenant) => {
    setEditingTenant(tn);
    setTenantForm({
      first_name: tn.first_name, last_name: tn.last_name ?? '', phone: tn.phone ?? '',
      email: tn.email ?? '', emergency_contact_name: tn.emergency_contact_name ?? '',
      emergency_contact_phone: tn.emergency_contact_phone ?? '',
      emergency_contact_relation: tn.emergency_contact_relation ?? '', notes: tn.notes ?? '',
    });
    setTenantFormOpen(true);
  };

  const saveTenant = async () => {
    if (!business || !tenantForm.first_name.trim()) return;
    setSavingTenant(true);
    const payload = {
      first_name: tenantForm.first_name.trim(),
      last_name: tenantForm.last_name.trim() || null,
      phone: tenantForm.phone.trim() || null,
      email: tenantForm.email.trim() || null,
      emergency_contact_name: tenantForm.emergency_contact_name.trim() || null,
      emergency_contact_phone: tenantForm.emergency_contact_phone.trim() || null,
      emergency_contact_relation: tenantForm.emergency_contact_relation.trim() || null,
      notes: tenantForm.notes.trim() || null,
    };
    if (editingTenant) {
      const { error } = await supabase.from('rental_tenants').update(payload).eq('id', editingTenant.id);
      if (error) { Alert.alert('', t.saveError); setSavingTenant(false); return; }
      if (tenantDetail?.id === editingTenant.id) setTenantDetail({ ...tenantDetail, ...payload, updated_at: new Date().toISOString() });
      void logAudit(supabase, business.id, 'rental_tenant.updated', 'rental_tenant', editingTenant.id, { name: payload.first_name });
    } else {
      const { data, error } = await supabase.from('rental_tenants')
        .insert({ business_id: business.id, ...payload, created_by: user?.id ?? null }).select().single();
      if (error) { Alert.alert('', t.saveError); setSavingTenant(false); return; }
      void logAudit(supabase, business.id, 'rental_tenant.created', 'rental_tenant', (data as RentalTenant).id, { name: payload.first_name });
    }
    setSavingTenant(false);
    setTenantFormOpen(false);
    reloadPeople();
  };

  const deleteTenant = async (tn: RentalTenant) => {
    if (!business) return;
    if (!(await confirm({ title: t.tenants.deleteConfirmTitle, message: t.tenants.deleteConfirmBody, destructive: true }))) return;
    await supabase.from('rental_tenants').delete().eq('id', tn.id);
    if (tenantDetail?.id === tn.id) setTenantDetail(null);
    void logAudit(supabase, business.id, 'rental_tenant.deleted', 'rental_tenant', tn.id, { name: tn.first_name });
    reloadPeople();
  };

  // ── Lease form sheet ────────────────────────────────────────────────────────
  const [leaseFormOpen, setLeaseFormOpen] = useState(false);
  const [editingLease, setEditingLease] = useState<RentalLease | null>(null);
  // Set → the form creates a NEW lease pre-filled from this one, and (if the
  // source is still active) ends it when the renewal saves.
  const [renewSource, setRenewSource] = useState<RentalLease | null>(null);
  const [leaseForm, setLeaseForm] = useState(EMPTY_LEASE_FORM);
  const [savingLease, setSavingLease] = useState(false);

  const openAddLease = () => {
    setEditingLease(null);
    setRenewSource(null);
    setLeaseForm({ ...EMPTY_LEASE_FORM, start_date: todayISO() });
    setLeaseFormOpen(true);
  };
  const openRenewLease = (l: RentalLease) => {
    setEditingLease(null);
    setRenewSource(l);
    // New term starts the day after the old one ends (or today for
    // month-to-month); end date left open for the new agreement.
    let start = todayISO();
    if (l.end_date) {
      const [y, m, d] = l.end_date.split('-').map(Number);
      const next = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1);
      start = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    }
    setLeaseForm({
      tenant_id: l.tenant_id, unit_label: l.unit_label ?? '', start_date: start,
      end_date: '', monthly_rent: String(l.monthly_rent), due_day: String(l.due_day),
      deposit_amount: l.deposit_amount != null ? String(l.deposit_amount) : '', notes: '',
      late_fee_amount: l.late_fee_amount != null ? String(l.late_fee_amount) : '',
      late_fee_grace_days: l.late_fee_grace_days != null ? String(l.late_fee_grace_days) : '5',
      prorate_partial: l.prorate_partial,
    });
    setLeaseFormOpen(true);
  };
  const openEditLease = (l: RentalLease) => {
    setRenewSource(null);
    setEditingLease(l);
    setLeaseForm({
      tenant_id: l.tenant_id, unit_label: l.unit_label ?? '', start_date: l.start_date,
      end_date: l.end_date ?? '', monthly_rent: String(l.monthly_rent), due_day: String(l.due_day),
      deposit_amount: l.deposit_amount != null ? String(l.deposit_amount) : '', notes: l.notes ?? '',
      late_fee_amount: l.late_fee_amount != null ? String(l.late_fee_amount) : '',
      late_fee_grace_days: l.late_fee_grace_days != null ? String(l.late_fee_grace_days) : '5',
      prorate_partial: l.prorate_partial,
    });
    setLeaseFormOpen(true);
  };

  const saveLease = async () => {
    if (!business || !detail) return;
    if (!leaseForm.tenant_id || !leaseForm.start_date || !Number(leaseForm.monthly_rent)) return;
    setSavingLease(true);
    const payload = {
      business_id: business.id,
      property_id: detail.id,
      tenant_id: leaseForm.tenant_id,
      unit_label: leaseForm.unit_label.trim() || null,
      start_date: leaseForm.start_date,
      end_date: leaseForm.end_date || null,
      monthly_rent: Number(leaseForm.monthly_rent),
      due_day: Math.min(31, Math.max(1, parseInt(leaseForm.due_day, 10) || 1)),
      deposit_amount: leaseForm.deposit_amount ? Number(leaseForm.deposit_amount) : null,
      notes: leaseForm.notes.trim() || null,
      late_fee_amount: leaseForm.late_fee_amount ? Number(leaseForm.late_fee_amount) : null,
      late_fee_grace_days: leaseForm.late_fee_amount
        ? Math.max(0, parseInt(leaseForm.late_fee_grace_days, 10) || 0)
        : null,
      // Stamped once so enabling fees today can't retro-charge old months.
      late_fee_since: leaseForm.late_fee_amount
        ? (editingLease?.late_fee_since ?? todayISO())
        : null,
      prorate_partial: leaseForm.prorate_partial,
    };
    let leaseRow: RentalLease | null = null;
    if (!editingLease) {
      const { data, error } = await supabase.from('rental_leases')
        .insert({ ...payload, created_by: user?.id ?? null }).select().single();
      if (error) { Alert.alert('', t.saveError); setSavingLease(false); return; }
      leaseRow = data as RentalLease;
      void logAudit(supabase, business.id, 'rental_lease.created', 'rental_lease', leaseRow.id, { property: detail.name });
      // Renewal: retire the old term. If it was month-to-month, close it the
      // day before the new term starts; a dated term keeps its own end date.
      if (renewSource && renewSource.status === 'active') {
        let endDate = renewSource.end_date;
        if (!endDate) {
          const [y, m, d] = payload.start_date.split('-').map(Number);
          const prev = new Date(y, (m ?? 1) - 1, (d ?? 1) - 1);
          endDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
        }
        await supabase.from('rental_leases')
          .update({ status: 'ended', end_date: endDate }).eq('id', renewSource.id);
      }
    } else {
      const { data, error } = await supabase.from('rental_leases')
        .update(payload).eq('id', editingLease.id).select().single();
      if (error) { Alert.alert('', t.saveError); setSavingLease(false); return; }
      leaseRow = data as RentalLease;
      void logAudit(supabase, business.id, 'rental_lease.updated', 'rental_lease', leaseRow.id, { property: detail.name });
    }
    if (leaseRow) await generateChargesForLeases(supabase, [leaseRow]).catch(() => false);
    setSavingLease(false);
    setLeaseFormOpen(false);
    setRenewSource(null);
    await reloadDetail(detail.id);
    reloadPeople();
  };

  const endLease = async (l: RentalLease) => {
    if (!detail) return;
    if (!(await confirm({ title: t.leases.endConfirmTitle, message: t.leases.endConfirmBody, destructive: true }))) return;
    await supabase.from('rental_leases').update({ status: 'ended', end_date: l.end_date ?? todayISO() }).eq('id', l.id);
    await reloadDetail(detail.id);
    reloadPeople();
  };

  const deleteLease = async (l: RentalLease) => {
    if (!business || !detail) return;
    if (!(await confirm({ title: t.leases.deleteConfirmTitle, message: t.leases.deleteConfirmBody, destructive: true }))) return;
    const docPaths = (docsByLease[l.id] ?? []).map(d => d.storage_path);
    const payPaths = propPayments.filter(p => p.lease_id === l.id && p.photo_path).map(p => p.photo_path as string);
    await supabase.from('rental_leases').delete().eq('id', l.id);
    removeStorage([...docPaths, ...payPaths]);
    void logAudit(supabase, business.id, 'rental_lease.deleted', 'rental_lease', l.id, { property: detail.name });
    await reloadDetail(detail.id);
    reloadPeople();
  };

  // ── Lease documents ─────────────────────────────────────────────────────────
  const [uploadingDocLease, setUploadingDocLease] = useState<string | null>(null);

  const pickLeaseDoc = async (leaseId: string) => {
    if (!business || !detail || uploadingDocLease) return;
    if ((docsByLease[leaseId] ?? []).length >= MAX_DOCS_PER_LEASE) {
      Alert.alert('', t.leases.docs.limitHit.replace('{{max}}', String(MAX_DOCS_PER_LEASE)));
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled) return;
    const f = res.assets[0];
    if (f.size != null && f.size > LEASE_DOC_MAX_BYTES) { Alert.alert('', t.leases.docs.tooLarge); return; }
    setUploadingDocLease(leaseId);
    try {
      const path = rentalLeaseDocPath(business.id, leaseId, rentalUid(), f.name);
      const blob = await fetch(f.uri).then(r => r.blob());
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const { error: upErr } = await supabase.storage.from(RENTALS_BUCKET)
        .upload(path, arrayBuffer, { contentType: f.mimeType ?? undefined, upsert: false });
      if (upErr) { Alert.alert('', t.saveError); return; }
      const { error: insErr } = await supabase.from('rental_lease_documents').insert({
        business_id: business.id, lease_id: leaseId, storage_path: path,
        file_name: f.name, file_size: f.size ?? null, mime_type: f.mimeType ?? null,
        created_by: user?.id ?? null,
      });
      if (insErr) { Alert.alert('', t.saveError); return; }
      await reloadDetail(detail.id);
    } finally {
      setUploadingDocLease(null);
    }
  };

  const openLeaseDoc = async (d: RentalLeaseDocument) => {
    const url = await signedUrl(supabase, d.storage_path);
    if (url) void Linking.openURL(url);
  };

  const deleteLeaseDoc = async (d: RentalLeaseDocument) => {
    if (!detail) return;
    if (!(await confirm({ message: t.leases.docs.deleteConfirm, destructive: true }))) return;
    await supabase.from('rental_lease_documents').delete().eq('id', d.id);
    removeStorage([d.storage_path]);
    await reloadDetail(detail.id);
  };

  // ── Payment sheet ───────────────────────────────────────────────────────────
  const [payOpen, setPayOpen] = useState(false);
  const [payCharge, setPayCharge] = useState<RentalCharge | null>(null);
  const [payEditId, setPayEditId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payPhotoUri, setPayPhotoUri] = useState<string | null>(null);
  const [payPhotoPath, setPayPhotoPath] = useState<string | null>(null);
  const [payPhotoRemoved, setPayPhotoRemoved] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payChooserOpen, setPayChooserOpen] = useState(false);

  const openRecordPayment = (charge: RentalCharge) => {
    const remaining = Math.max(0, charge.amount - paidOn(charge.id));
    setPayCharge(charge);
    setPayEditId(null);
    setPayAmount(remaining > 0 ? String(Math.round(remaining * 100) / 100) : '');
    setPayMethod('');
    setPayDate(todayISO());
    setPayNote('');
    setPayPhotoUri(null);
    setPayPhotoPath(null);
    setPayPhotoRemoved(false);
    setPayChooserOpen(false);
    setPayOpen(true);
  };
  const openEditPayment = (charge: RentalCharge, p: RentalPayment) => {
    setPayCharge(charge);
    setPayEditId(p.id);
    setPayAmount(String(p.amount));
    setPayMethod(p.method ?? '');
    setPayDate(p.paid_on);
    setPayNote(p.note ?? '');
    setPayPhotoUri(null);
    setPayPhotoPath(p.photo_path);
    setPayPhotoRemoved(false);
    setPayChooserOpen(false);
    setPayOpen(true);
  };

  const pickPayPhoto = async (source: 'camera' | 'library') => {
    setPayChooserOpen(false);
    const uri = await pickImage(source);
    if (uri) { setPayPhotoUri(uri); setPayPhotoRemoved(false); }
  };

  const submitPayment = async () => {
    if (!business || !payCharge || !detail) return;
    const amount = Number(payAmount);
    if (!(amount >= 0) || payAmount === '') return;
    setPayBusy(true);
    let photoPath: string | null = payPhotoPath;
    if (payPhotoUri) {
      const path = rentalPaymentPhotoPath(business.id, rentalUid());
      if (await uploadImage(payPhotoUri, path)) photoPath = path;
    }
    const prevPath = payEditId ? (propPayments.find(p => p.id === payEditId)?.photo_path ?? null) : null;
    const row = {
      amount,
      method: payMethod.trim() || null,
      paid_on: payDate || todayISO(),
      note: payNote.trim() || null,
      photo_path: payPhotoRemoved && !payPhotoUri ? null : photoPath,
    };
    if (payEditId) {
      const { error } = await supabase.from('rental_payments').update(row).eq('id', payEditId);
      if (!error && prevPath && prevPath !== row.photo_path) removeStorage([prevPath]);
    } else {
      await supabase.from('rental_payments').insert({
        business_id: business.id, charge_id: payCharge.id, lease_id: payCharge.lease_id,
        ...row, created_by: user?.id ?? null,
      });
      void logAudit(supabase, business.id, 'rental_payment.recorded', 'rental_payment', payCharge.id, { amount });
    }
    setPayBusy(false);
    setPayOpen(false);
    await reloadDetail(detail.id);
  };

  const deletePayment = async (p: RentalPayment) => {
    if (!detail) return;
    if (!(await confirm({ title: t.payments.deleteConfirmTitle, message: t.payments.deleteConfirmBody, destructive: true }))) return;
    await supabase.from('rental_payments').delete().eq('id', p.id);
    if (p.photo_path) removeStorage([p.photo_path]);
    await reloadDetail(detail.id);
  };

  const viewPayPhoto = async (p: RentalPayment) => {
    if (!p.photo_path) return;
    const url = await signedUrl(supabase, p.photo_path);
    if (url) void Linking.openURL(url);
  };

  // ── Charge edit sheet ───────────────────────────────────────────────────────
  const [chargeEdit, setChargeEdit] = useState<RentalCharge | null>(null);
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeBusy, setChargeBusy] = useState(false);
  const [expandedCharge, setExpandedCharge] = useState<string | null>(null);

  const saveCharge = async () => {
    if (!chargeEdit || !detail || !Number(chargeAmount)) return;
    setChargeBusy(true);
    await supabase.from('rental_charges').update({ amount: Number(chargeAmount) }).eq('id', chargeEdit.id);
    setChargeBusy(false);
    setChargeEdit(null);
    await reloadDetail(detail.id);
  };

  // ── Expense sheet ───────────────────────────────────────────────────────────
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<RentalExpense | null>(null);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptRemoved, setReceiptRemoved] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [receiptChooserOpen, setReceiptChooserOpen] = useState(false);

  const openAddExpense = () => {
    setEditingExpense(null);
    setExpenseForm({ ...EMPTY_EXPENSE_FORM, expense_date: todayISO() });
    setReceiptUri(null);
    setReceiptRemoved(false);
    setReceiptChooserOpen(false);
    setExpenseFormOpen(true);
  };
  const openEditExpense = (e: RentalExpense) => {
    setEditingExpense(e);
    setExpenseForm({
      expense_date: e.expense_date, amount: String(e.amount), category: e.category,
      vendor: e.vendor ?? '', note: e.note ?? '',
    });
    setReceiptUri(null);
    setReceiptRemoved(false);
    setReceiptChooserOpen(false);
    setExpenseFormOpen(true);
  };

  const pickReceipt = async (source: 'camera' | 'library') => {
    setReceiptChooserOpen(false);
    const uri = await pickImage(source);
    if (uri) { setReceiptUri(uri); setReceiptRemoved(false); }
  };

  const saveExpense = async () => {
    if (!business || !detail || !Number(expenseForm.amount)) return;
    setSavingExpense(true);
    let receiptPath: string | null = editingExpense?.receipt_path ?? null;
    if (receiptUri) {
      const path = rentalReceiptPath(business.id, rentalUid());
      if (await uploadImage(receiptUri, path)) receiptPath = path;
    }
    const row = {
      expense_date: expenseForm.expense_date || todayISO(),
      amount: Number(expenseForm.amount),
      category: expenseForm.category,
      vendor: expenseForm.vendor.trim() || null,
      note: expenseForm.note.trim() || null,
      receipt_path: receiptRemoved && !receiptUri ? null : receiptPath,
    };
    if (editingExpense) {
      const prev = editingExpense.receipt_path;
      const { error } = await supabase.from('rental_expenses').update(row).eq('id', editingExpense.id);
      if (!error && prev && prev !== row.receipt_path) removeStorage([prev]);
    } else {
      await supabase.from('rental_expenses').insert({
        business_id: business.id, property_id: detail.id, ...row, created_by: user?.id ?? null,
      });
    }
    setSavingExpense(false);
    setExpenseFormOpen(false);
    await reloadDetail(detail.id);
  };

  const deleteExpense = async (e: RentalExpense) => {
    if (!detail) return;
    if (!(await confirm({ title: t.expenses.deleteConfirmTitle, message: t.expenses.deleteConfirmBody, destructive: true }))) return;
    await supabase.from('rental_expenses').delete().eq('id', e.id);
    if (e.receipt_path) removeStorage([e.receipt_path]);
    await reloadDetail(detail.id);
  };

  const viewReceipt = async (e: RentalExpense) => {
    if (!e.receipt_path) return;
    const url = await signedUrl(supabase, e.receipt_path);
    if (url) void Linking.openURL(url);
  };

  // ── Maintenance sheet ───────────────────────────────────────────────────────
  const [maintFormOpen, setMaintFormOpen] = useState(false);
  const [editingMaint, setEditingMaint] = useState<RentalMaintenance | null>(null);
  const [maintForm, setMaintForm] = useState(EMPTY_MAINT_FORM);
  const [savingMaint, setSavingMaint] = useState(false);

  const openAddMaint = () => {
    setEditingMaint(null);
    setMaintForm({ ...EMPTY_MAINT_FORM, reported_on: todayISO() });
    setMaintFormOpen(true);
  };
  const openEditMaint = (m: RentalMaintenance) => {
    setEditingMaint(m);
    setMaintForm({
      title: m.title, description: m.description ?? '', status: m.status,
      reported_on: m.reported_on, completed_on: m.completed_on ?? '',
      cost: m.cost != null ? String(m.cost) : '', fixed_by: m.fixed_by ?? '',
      employee_id: m.employee_id ?? '', createExpense: true,
    });
    setMaintFormOpen(true);
  };

  const saveMaint = async () => {
    if (!business || !detail || !maintForm.title.trim()) return;
    setSavingMaint(true);
    const done = maintForm.status === 'done';
    const row = {
      title: maintForm.title.trim(),
      description: maintForm.description.trim() || null,
      status: maintForm.status,
      reported_on: maintForm.reported_on || todayISO(),
      completed_on: done ? (maintForm.completed_on || todayISO()) : (maintForm.completed_on || null),
      cost: maintForm.cost ? Number(maintForm.cost) : null,
      fixed_by: maintForm.fixed_by.trim() || null,
      employee_id: maintForm.employee_id || null,
    };
    let maintId = editingMaint?.id ?? null;
    if (editingMaint) {
      await supabase.from('rental_maintenance').update(row).eq('id', editingMaint.id);
    } else {
      const { data } = await supabase.from('rental_maintenance').insert({
        business_id: business.id, property_id: detail.id, ...row, created_by: user?.id ?? null,
      }).select().single();
      maintId = (data as RentalMaintenance | null)?.id ?? null;
    }
    if (maintId && done && row.cost != null && maintForm.createExpense) {
      const already = propExpenses.some(e => e.maintenance_id === maintId);
      if (!already) {
        await supabase.from('rental_expenses').insert({
          business_id: business.id, property_id: detail.id,
          expense_date: row.completed_on ?? todayISO(), amount: row.cost,
          category: 'repairs', vendor: row.fixed_by, note: row.title,
          maintenance_id: maintId, created_by: user?.id ?? null,
        });
      }
    }
    setSavingMaint(false);
    setMaintFormOpen(false);
    await reloadDetail(detail.id);
  };

  const deleteMaint = async (m: RentalMaintenance) => {
    if (!detail) return;
    if (!(await confirm({ title: t.maintenance.deleteConfirmTitle, message: t.maintenance.deleteConfirmBody, destructive: true }))) return;
    const { data: mp } = await supabase.from('rental_maintenance_photos').select('storage_path').eq('maintenance_id', m.id);
    await supabase.from('rental_maintenance').delete().eq('id', m.id);
    removeStorage((((mp as { storage_path: string }[] | null) ?? []).map(r => r.storage_path)));
    await reloadDetail(detail.id);
  };

  // ── Property photos ─────────────────────────────────────────────────────────
  const [photoChooserOpen, setPhotoChooserOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Upload category: '' = general, '<leaseId>|before' / '<leaseId>|after'
  // (damage documentation per tenant stay, migration 203).
  const [photoCat, setPhotoCat] = useState('');
  const photoCatOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: '', label: t.photos.catGeneral }];
    for (const l of propLeases) {
      const tn = tenants.find(x => x.id === l.tenant_id);
      const name = tn ? tenantName(tn) : '—';
      opts.push({ value: `${l.id}|before`, label: `${name} · ${t.photos.catBefore}` });
      opts.push({ value: `${l.id}|after`, label: `${name} · ${t.photos.catAfter}` });
    }
    return opts;
  }, [propLeases, tenants, t]);
  const photoGroups = useMemo(() => {
    const byKey = new Map<string, { p: RentalPropertyPhoto; index: number }[]>();
    propPhotos.forEach((p, index) => {
      const key = p.lease_id && p.phase ? `${p.lease_id}|${p.phase}` : '';
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push({ p, index });
    });
    const groups: { key: string; label: string | null; items: { p: RentalPropertyPhoto; index: number }[] }[] = [];
    for (const opt of photoCatOptions) {
      const items = byKey.get(opt.value);
      if (items?.length) groups.push({ key: opt.value, label: opt.value ? opt.label : (byKey.size > 1 ? opt.label : null), items });
      byKey.delete(opt.value);
    }
    byKey.forEach(items => { if (items.length) groups.push({ key: 'orphan', label: t.photos.catGeneral, items }); });
    return groups;
  }, [propPhotos, photoCatOptions, t]);

  const addPropertyPhoto = async (source: 'camera' | 'library') => {
    setPhotoChooserOpen(false);
    if (!business || !detail) return;
    if (propPhotos.length >= MAX_PHOTOS_PER_PROPERTY) {
      Alert.alert('', t.photos.limitHit.replace('{{max}}', String(MAX_PHOTOS_PER_PROPERTY)));
      return;
    }
    const uri = await pickImage(source);
    if (!uri) return;
    setUploadingPhoto(true);
    const path = rentalPropertyPhotoPath(business.id, detail.id, rentalUid());
    if (await uploadImage(uri, path)) {
      const [catLease, catPhase] = photoCat ? photoCat.split('|') : [null, null];
      await supabase.from('rental_property_photos').insert({
        business_id: business.id, property_id: detail.id, storage_path: path,
        lease_id: catLease, phase: catPhase,
        created_by: user?.id ?? null,
      });
      await reloadDetail(detail.id);
      setCoverPhotos({});
      void loadCovers([detail.id]);
    } else {
      Alert.alert('', t.photos.uploadError);
    }
    setUploadingPhoto(false);
  };

  // Backfill helper: record one full payment per unpaid month of a lease
  // (dated its due date) — for importing historical leases without tapping
  // "Registrar pago" month by month.
  // ── Lease e-signing ───────────────────────────────────────────────────────
  const [signatureView, setSignatureView] = useState<RentalLease | null>(null);
  const [signLease, setSignLease] = useState<RentalLease | null>(null);
  const [signName, setSignName] = useState('');
  const [signData, setSignData] = useState<string | null>(null);
  const [signBusy, setSignBusy] = useState(false);

  /** Mint the token on first use, then hand the link to the OS share sheet. */
  const shareSignLink = async (l: RentalLease) => {
    if (!detail) return;
    let token = l.share_token;
    if (!token) {
      token = secureShareToken();
      const { error } = await supabase.from('rental_leases').update({ share_token: token }).eq('id', l.id);
      if (error) { Alert.alert('', t.saveError); return; }
      await reloadDetail(detail.id);
    }
    try {
      await Share.share({ message: `${WEB_APP_URL}/contrato/${token}` });
    } catch { /* user dismissed */ }
  };

  const openSignInPerson = (l: RentalLease) => {
    const tn = tenantOf(l.tenant_id);
    setSignLease(l);
    setSignName(tn ? tenantName(tn) : '');
    setSignData(null);
  };

  const saveInPersonSignature = async () => {
    if (!signLease || !signData || !signName.trim() || !detail) return;
    setSignBusy(true);
    await supabase.from('rental_leases').update({
      tenant_signature: signData,
      tenant_signer_name: signName.trim(),
      tenant_signed_at: new Date().toISOString(),
    }).eq('id', signLease.id);
    setSignBusy(false);
    setSignLease(null);
    await reloadDetail(detail.id);
  };

  // ── Deposit return ────────────────────────────────────────────────────────
  const [depositLease, setDepositLease] = useState<RentalLease | null>(null);
  const [depositDate, setDepositDate] = useState(todayISO());
  const [depositWithheld, setDepositWithheld] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [depositBusy, setDepositBusy] = useState(false);

  const openReturnDeposit = (l: RentalLease) => {
    setDepositLease(l);
    setDepositDate(todayISO());
    setDepositWithheld(l.deposit_withheld != null ? String(l.deposit_withheld) : '');
    setDepositNote(l.deposit_note ?? '');
  };

  const saveDepositReturn = async () => {
    if (!depositLease || !detail) return;
    setDepositBusy(true);
    await supabase.from('rental_leases').update({
      deposit_returned_on: depositDate,
      deposit_withheld: depositWithheld ? Number(depositWithheld) : null,
      deposit_note: depositNote.trim() || null,
    }).eq('id', depositLease.id);
    setDepositBusy(false);
    setDepositLease(null);
    await reloadDetail(detail.id);
    reloadPeople();
  };

  const undoDepositReturn = async (l: RentalLease) => {
    if (!detail) return;
    await supabase.from('rental_leases').update({ deposit_returned_on: null }).eq('id', l.id);
    await reloadDetail(detail.id);
    reloadPeople();
  };

  const waiveCharge = async (ch: RentalCharge) => {
    if (!detail) return;
    if (!(await confirm({ title: t.ledger.waiveConfirmTitle, message: t.ledger.waiveConfirmBody }))) return;
    await supabase.from('rental_charges').update({ amount: 0 }).eq('id', ch.id);
    await reloadDetail(detail.id);
  };

  const deleteCharge = async (ch: RentalCharge) => {
    if (!detail) return;
    if (!(await confirm({ title: t.ledger.deleteChargeConfirmTitle, message: t.ledger.deleteChargeConfirmBody, destructive: true }))) return;
    await supabase.from('rental_charges').delete().eq('id', ch.id);
    await reloadDetail(detail.id);
  };

  // ── One-off charge sheet (utility, damage, manual late fee) ───────────────
  const [addChargeLease, setAddChargeLease] = useState<RentalLease | null>(null);
  const [newChargeKind, setNewChargeKind] = useState<'late_fee' | 'other'>('other');
  const [newChargeAmount, setNewChargeAmount] = useState('');
  const [newChargeDue, setNewChargeDue] = useState(todayISO());
  const [newChargeNote, setNewChargeNote] = useState('');
  const [addChargeBusy, setAddChargeBusy] = useState(false);

  const openAddCharge = (l: RentalLease) => {
    setAddChargeLease(l);
    setNewChargeKind('other');
    setNewChargeAmount('');
    setNewChargeDue(todayISO());
    setNewChargeNote('');
  };

  const saveNewCharge = async () => {
    if (!business || !detail || !addChargeLease || !Number(newChargeAmount)) return;
    setAddChargeBusy(true);
    // Random dedupe_key → a month can hold any number of manual charges while
    // rent and auto fees stay one-per-month (migration 204).
    await supabase.from('rental_charges').insert({
      business_id: business.id,
      lease_id: addChargeLease.id,
      property_id: addChargeLease.property_id,
      period_start: `${newChargeDue.slice(0, 7)}-01`,
      due_date: newChargeDue,
      amount: Number(newChargeAmount),
      kind: newChargeKind,
      dedupe_key: rentalUid(),
      note: newChargeNote.trim() || null,
    });
    setAddChargeBusy(false);
    setAddChargeLease(null);
    await reloadDetail(detail.id);
  };

  const markAllPaid = async (l: RentalLease) => {
    if (!business) return;
    const lCharges = chargesByLease.get(l.id) ?? [];
    const open = lCharges
      .map(ch => ({ ch, remaining: ch.amount - paidOn(ch.id) }))
      .filter(x => x.remaining > PAY_TOLERANCE);
    if (open.length === 0) return;
    const total = open.reduce((s2, x) => s2 + x.remaining, 0);
    const ok = await confirm({
      title: t.ledger.markAllConfirmTitle,
      message: t.ledger.markAllConfirmBody
        .replace('{{count}}', String(open.length))
        .replace('{{total}}', fmtMoney(total)),
    });
    if (!ok) return;
    await supabase.from('rental_payments').insert(open.map(x => ({
      business_id: business.id,
      charge_id: x.ch.id,
      lease_id: l.id,
      amount: x.remaining,
      method: null,
      paid_on: x.ch.due_date,
      note: null,
      created_by: user?.id ?? null,
    })));
    void logAudit(supabase, business.id, 'rental_payment.recorded', 'rental_payment', l.id, { bulk: open.length, total });
    if (detail) await reloadDetail(detail.id);
  };

  const deletePropertyPhoto = async (p: RentalPropertyPhoto) => {
    if (!detail) return;
    if (!(await confirm({ message: t.photos.deleteConfirm, destructive: true }))) return;
    setPhotoViewer(null);
    await supabase.from('rental_property_photos').delete().eq('id', p.id);
    removeStorage([p.storage_path]);
    await reloadDetail(detail.id);
    setCoverPhotos({});
    void loadCovers([detail.id]);
  };

  // ── Fullscreen property-photo viewer: swipe pages, native pinch-zoom
  //    (zoomable ScrollView per page), rotate + cover + delete ─────────────
  const [photoViewer, setPhotoViewer] = useState<number | null>(null);
  const photoViewerListRef = useRef<FlatList<RentalPropertyPhoto>>(null);
  const viewerPhoto = photoViewer !== null ? propPhotos[photoViewer] : null;

  const rotateViewerPhoto = async () => {
    if (!viewerPhoto) return;
    const rotation = ((viewerPhoto.rotation ?? 0) + 90) % 360;
    setPropPhotos(prev => prev.map(p => (p.id === viewerPhoto.id ? { ...p, rotation } : p)));
    await supabase.from('rental_property_photos').update({ rotation }).eq('id', viewerPhoto.id);
    if (tenantDetail) {
    const td = t.tenants.detail;
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-border-soft">
          <Pressable onPress={() => setTenantDetail(null)} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
            <ChevronLeft size={22} color={c.ink} />
          </Pressable>
          <View className="flex-row gap-1">
            {canEdit ? (
              <Pressable onPress={() => openEditTenant(tenantDetail)} hitSlop={8} className="p-2 rounded-lg active:bg-border-soft">
                <Pencil size={18} color={c.muted} />
              </Pressable>
            ) : null}
            {canDelete ? (
              <Pressable onPress={() => deleteTenant(tenantDetail)} hitSlop={8} className="p-2 rounded-lg active:bg-red-500/10">
                <Trash2 size={18} color={c.danger} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }}>
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center">
              <Text className="text-lg font-bold text-primary">{tenantDetail.first_name.charAt(0).toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-ink">{tenantName(tenantDetail)}</Text>
              {activeTenantIds.has(tenantDetail.id) ? (
                <View className="bg-emerald-500/10 px-1.5 py-0.5 rounded-full self-start mt-0.5">
                  <Text className="text-[9px] font-semibold text-emerald-700">{t.tenants.activeLease}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View className="flex-row gap-3">
            {[
              { label: td.statLeases, value: String(tdLeases.length) },
              { label: td.statTotalPaid, value: fmtMoney(tdTotalPaid) },
              { label: td.statBalance, value: fmtMoney(tdBalance) },
            ].map(sd => (
              <View key={sd.label} className="flex-1 bg-card rounded-2xl border border-border-soft p-3">
                <Text className="text-base font-bold text-ink" numberOfLines={1} adjustsFontSizeToFit>{sd.value}</Text>
                <Text className="text-[10px] text-faint mt-0.5">{sd.label}</Text>
              </View>
            ))}
          </View>

          <View className="bg-card rounded-2xl border border-border-soft p-4 gap-2.5">
            <Text className="text-[11px] font-semibold text-faint uppercase">{td.contactHeading}</Text>
            {tenantDetail.phone ? (
              <Pressable onPress={() => Linking.openURL(`tel:${tenantDetail.phone}`)} className="flex-row items-center gap-2.5 active:opacity-60">
                <Phone size={14} color={c.faint} />
                <Text className="text-sm text-ink">{formatPhoneInput(tenantDetail.phone)}</Text>
              </Pressable>
            ) : null}
            {tenantDetail.email ? (
              <Pressable onPress={() => Linking.openURL(`mailto:${tenantDetail.email}`)} className="flex-row items-center gap-2.5 active:opacity-60">
                <FileText size={14} color={c.faint} />
                <Text className="text-sm text-ink">{tenantDetail.email}</Text>
              </Pressable>
            ) : null}
            {!tenantDetail.phone && !tenantDetail.email ? <Text className="text-sm text-faint">—</Text> : null}
            {tenantDetail.emergency_contact_name || tenantDetail.emergency_contact_phone ? (
              <>
                <Text className="text-[11px] font-semibold text-faint uppercase mt-2">{td.emergencyHeading}</Text>
                <Text className="text-sm text-ink">
                  {[tenantDetail.emergency_contact_name, tenantDetail.emergency_contact_relation ? `(${tenantDetail.emergency_contact_relation})` : null].filter(Boolean).join(' ')}
                </Text>
                {tenantDetail.emergency_contact_phone ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${tenantDetail.emergency_contact_phone}`)} className="active:opacity-60">
                    <Text className="text-sm text-muted">{formatPhoneInput(tenantDetail.emergency_contact_phone)}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
            {tenantDetail.notes ? (
              <>
                <Text className="text-[11px] font-semibold text-faint uppercase mt-2">{td.notesHeading}</Text>
                <Text className="text-sm text-muted">{tenantDetail.notes}</Text>
              </>
            ) : null}
          </View>

          <View className="bg-card rounded-2xl border border-border-soft p-4">
            <Text className="text-[11px] font-semibold text-faint uppercase mb-2">{td.leasesHeading}</Text>
            {tdLeases.length === 0 ? (
              <Text className="text-sm text-faint">{td.noLeases}</Text>
            ) : tdLeases.map((l, li) => (
              <View key={l.id} className={`py-2.5 flex-row items-center gap-3 ${li > 0 ? 'border-t border-border-soft' : ''}`}>
                <FileText size={15} color={c.faint} />
                <View className="flex-1">
                  <Text className="text-sm font-medium text-ink" numberOfLines={1}>
                    {tdPropNames[l.property_id] ?? '—'}{l.unit_label ? ` · ${l.unit_label}` : ''}
                  </Text>
                  <Text className="text-[11px] text-muted">
                    {formatDateLong(`${l.start_date}T00:00:00`, dateLoc)}
                    {l.end_date ? ` – ${formatDateLong(`${l.end_date}T00:00:00`, dateLoc)}` : ` · ${t.leases.monthToMonth}`}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-semibold text-ink">{fmtMoney(l.monthly_rent)}</Text>
                  <View className={`px-1.5 py-0.5 rounded-full ${l.status === 'active' ? 'bg-emerald-500/10' : 'bg-border-soft'}`}>
                    <Text className={`text-[9px] font-semibold ${l.status === 'active' ? 'text-emerald-700' : 'text-muted'}`}>
                      {l.status === 'active' ? t.tenants.activeLease : t.leases.endedBadge}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          <View>
            <Text className="text-xs text-faint">{td.addedOn.replace('{{date}}', formatDateLong(tenantDetail.created_at, dateLoc))}</Text>
            {tenantDetail.updated_at && tenantDetail.updated_at !== tenantDetail.created_at ? (
              <Text className="text-xs text-faint">{td.editedOn.replace('{{date}}', formatDateLong(tenantDetail.updated_at, dateLoc))}</Text>
            ) : null}
          </View>
        </ScrollView>
        {renderTenantFormSheet()}
      </SafeAreaView>
    );
  }

  if (detail) { setCoverPhotos({}); void loadCovers([detail.id]); }
  };

  const setCoverPropertyPhoto = async (photo: RentalPropertyPhoto) => {
    if (!detail) return;
    setPropPhotos(prev => prev.map(p => ({ ...p, is_cover: p.id === photo.id })));
    await supabase.from('rental_property_photos').update({ is_cover: false })
      .eq('property_id', detail.id).neq('id', photo.id);
    await supabase.from('rental_property_photos').update({ is_cover: true }).eq('id', photo.id);
    setCoverPhotos({});
    void loadCovers([detail.id]);
  };

  const photoViewerGoTo = (delta: number) => {
    if (photoViewer === null) return;
    const next = Math.min(Math.max(photoViewer + delta, 0), propPhotos.length - 1);
    if (next === photoViewer) return;
    setPhotoViewer(next);
    photoViewerListRef.current?.scrollToIndex({ index: next, animated: true });
  };

  const detailPhotoUrls = useSignedUrls(supabase, [
    ...Object.values(coverPhotos).map(p => p.storage_path),
    ...propPhotos.map(p => p.storage_path),
  ]);

  // ── Small UI helpers ────────────────────────────────────────────────────────
  const statusChip = (status: ChargeStatus, daysLate: number) => {
    const bg = status === 'paid' ? 'bg-emerald-500/10' : status === 'partial' ? 'bg-amber-500/10' : status === 'late' ? 'bg-red-500/10' : 'bg-border-soft';
    const fg = status === 'paid' ? 'text-emerald-700' : status === 'partial' ? 'text-amber-700' : status === 'late' ? 'text-red-700' : 'text-muted';
    const label = status === 'paid' ? t.ledger.statusPaid : status === 'partial' ? t.ledger.statusPartial : status === 'late' ? t.ledger.statusLate : t.ledger.statusUnpaid;
    return (
      <View className={`px-2 py-0.5 rounded-full ${bg}`}>
        <Text className={`text-[10px] font-semibold ${fg}`}>
          {label}{status === 'late' && daysLate > 0 ? ` · ${t.ledger.daysLate.replace('{{days}}', String(daysLate))}` : ''}
        </Text>
      </View>
    );
  };

  const sheetScrim = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' };

  const fieldCls = 'bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-ink';
  const labelCls = 'text-sm font-semibold text-ink mb-1.5';

  const moneyInput = (value: string, onChange: (v: string) => void, placeholder?: string) => (
    <View className="relative justify-center">
      <Text className="absolute left-3 z-10 text-faint">$</Text>
      <TextInput value={value} onChangeText={v => onChange(cleanMoney(v))} keyboardType="decimal-pad"
        placeholder={placeholder} placeholderTextColor={c.faint}
        className={`${fieldCls} pl-6`} />
    </View>
  );

  /** Camera/library chooser as an in-modal absolute overlay (never a nested
   *  RNModal — iOS silently refuses to present a second one). */
  const chooserOverlay = (open: boolean, onClose: () => void, onPick: (s: 'camera' | 'library') => void) =>
    open ? (
      <View className="justify-end" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Pressable onPress={onClose} style={sheetScrim} />
        <View className="bg-card rounded-t-3xl px-4 pb-8 pt-4">
          <View className="items-center mb-3"><View className="w-10 h-1 bg-border rounded-full" /></View>
          <View className="bg-surface rounded-2xl overflow-hidden">
            <Pressable onPress={() => onPick('camera')} className="flex-row items-center gap-3 px-5 py-4 active:bg-border-soft border-b border-border-soft">
              <Camera size={18} color={c.primary} />
              <Text className="text-sm font-semibold text-ink">{t.photos.takePhoto}</Text>
            </Pressable>
            <Pressable onPress={() => onPick('library')} className="flex-row items-center gap-3 px-5 py-4 active:bg-border-soft">
              <ImagePlus size={18} color={c.primary} />
              <Text className="text-sm font-semibold text-ink">{t.photos.chooseFromLibrary}</Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} className="mt-3 items-center py-3.5 rounded-2xl bg-border-soft active:bg-border">
            <Text className="text-sm font-semibold text-ink">{tc.buttons.cancel}</Text>
          </Pressable>
        </View>
      </View>
    ) : null;

  // ── Rent roll derived ───────────────────────────────────────────────────────
  const monthPaidByCharge = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of monthPayments) m.set(p.charge_id, (m.get(p.charge_id) ?? 0) + p.amount);
    return m;
  }, [monthPayments]);

  const rollRows = useMemo(() => {
    const propOf = new Map(properties.map(p => [p.id, p]));
    const leaseOf = new Map(leases.map(l => [l.id, l]));
    return monthCharges
      .map(ch => {
        const lease = leaseOf.get(ch.lease_id);
        const paid = monthPaidByCharge.get(ch.id) ?? 0;
        return {
          charge: ch,
          lease,
          property: propOf.get(ch.property_id),
          tenant: lease ? tenantOf(lease.tenant_id) : null,
          paid,
          status: chargeStatus(ch, paid),
          daysLate: chargeDaysLate(ch),
        };
      })
      .sort((a, b) => {
        const rank = (s: string) => (s === 'late' ? 0 : s === 'partial' ? 1 : s === 'unpaid' ? 2 : 3);
        if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
        return (a.property?.name ?? '').localeCompare(b.property?.name ?? '', 'es', { sensitivity: 'base' });
      });
  }, [monthCharges, properties, leases, tenantOf, monthPaidByCharge]);

  const occ = occupancy(properties, activeLeases);

  // ═══════════════════════════ RENDER ═══════════════════════════
  const statTile = (label: string, value: string, sub?: string, valueCls = 'text-ink') => (
    <View className="flex-1 bg-card rounded-2xl border border-border-soft p-3.5">
      <Text className="text-[11px] text-muted">{label}</Text>
      <Text className={`text-lg font-bold mt-0.5 ${valueCls}`}>{value}</Text>
      {sub ? <Text className="text-[10px] text-faint mt-0.5">{sub}</Text> : null}
    </View>
  );

  // ── Detail screen ───────────────────────────────────────────────────────────
  if (detail) {
    const detailTabs: { key: DetailTab; label: string }[] = [
      { key: 'overview', label: t.detailTabs.overview },
      { key: 'leases', label: t.detailTabs.leases },
      { key: 'ledger', label: t.detailTabs.ledger },
      { key: 'expenses', label: t.detailTabs.expenses },
      { key: 'maintenance', label: t.detailTabs.maintenance },
      { key: 'photos', label: t.detailTabs.photos },
    ];
    const dActiveLeases = propLeases.filter(l => l.status === 'active');
    const dBalance = leaseBalance(propCharges, propPayments);
    const dExpensesTotal = propExpenses.reduce((s, e) => s + e.amount, 0);
    const dOpenMaint = propMaint.filter(m => m.status !== 'done').length;
    const sortedLeases = [...propLeases].sort((a, b) =>
      a.status === b.status ? b.start_date.localeCompare(a.start_date) : a.status === 'active' ? -1 : 1);

    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
          <Pressable onPress={() => setDetail(null)} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
            <ChevronLeft size={22} color={c.ink} />
          </Pressable>
          <View className="ml-1 flex-1">
            <Text className="text-lg font-semibold text-ink" numberOfLines={1}>{detail.name}</Text>
            <Text className="text-xs text-muted" numberOfLines={1}>
              {[detail.address, detail.city].filter(Boolean).join(', ') || '—'}
              {detail.status === 'inactive' ? ` · ${t.propertyStatus.inactive}` : ''}
            </Text>
          </View>
          {canEdit ? (
            <Pressable onPress={() => openEditProp(detail)} hitSlop={8} className="p-2 rounded-lg active:bg-border-soft">
              <Pencil size={18} color={c.muted} />
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable onPress={() => deleteProp(detail)} hitSlop={8} className="p-2 rounded-lg active:bg-border-soft">
              <Trash2 size={18} color={c.danger} />
            </Pressable>
          ) : null}
        </View>

        {/* Section tabs */}
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
            {detailTabs.map(({ key, label }) => (
              <Pressable key={key} onPress={() => setDetailTab(key)}
                className={`px-3.5 py-2 rounded-full border ${detailTab === key ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                <Text className={`text-sm font-medium ${detailTab === key ? 'text-white' : 'text-ink'}`}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {detailLoading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color={c.primary} /></View>
        ) : (
          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 220 }}>
            {detailTab === 'overview' ? (
              <View className="gap-3">
                <View className="flex-row gap-3">
                  {statTile(t.detailTabs.leases, String(dActiveLeases.length))}
                  {statTile(t.ledger.balanceLabel, fmtMoney(Math.max(0, dBalance)), undefined, dBalance > PAY_TOLERANCE ? 'text-red-600' : 'text-emerald-600')}
                </View>
                <View className="flex-row gap-3">
                  {statTile(t.overview.expensesLabel, fmtMoney(dExpensesTotal))}
                  {statTile(t.detailTabs.maintenance, String(dOpenMaint))}
                </View>
                {detail.notes ? (
                  <View className="bg-card rounded-2xl border border-border-soft p-4">
                    <Text className="text-xs font-medium text-muted mb-1">{t.propertyForm.notesLabel}</Text>
                    <Text className="text-sm text-ink">{detail.notes}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {detailTab === 'leases' ? (
              <View className="gap-3">
                {sortedLeases.length === 0 ? (
                  <View className="bg-card rounded-2xl border border-border-soft p-8 items-center">
                    <Text className="text-sm text-muted">{t.leases.empty}</Text>
                  </View>
                ) : sortedLeases.map(l => {
                  const tn = tenantOf(l.tenant_id);
                  const expDays = l.status === 'active' ? leaseExpirationDays(l.end_date) : null;
                  const docs = docsByLease[l.id] ?? [];
                  return (
                    <View key={l.id} className="bg-card rounded-2xl border border-border-soft p-4">
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                            {tn ? tenantName(tn) : '—'}{l.unit_label ? ` · ${l.unit_label}` : ''}
                          </Text>
                          <Text className="text-xs text-muted mt-0.5">
                            {formatDateLong(`${l.start_date}T00:00:00`, locale)} → {l.end_date ? formatDateLong(`${l.end_date}T00:00:00`, locale) : t.leases.monthToMonth}
                          </Text>
                          <Text className="text-xs text-muted mt-0.5">
                            {fmtMoney(l.monthly_rent)} · {t.leases.form.dueDayLabel}: {l.due_day}
                            {l.deposit_amount != null ? ` · ${t.ledger.depositLabel}: ${fmtMoney(l.deposit_amount)}` : ''}
                          </Text>
                        </View>
                        {l.status === 'ended' ? (
                          <View className="bg-border-soft px-2 py-0.5 rounded-full"><Text className="text-[10px] font-semibold text-muted">{t.leases.endedBadge}</Text></View>
                        ) : expDays !== null && expDays < 0 ? (
                          <View className="bg-red-500/10 px-2 py-0.5 rounded-full"><Text className="text-[10px] font-semibold text-red-700">{t.leases.expiredBadge}</Text></View>
                        ) : expDays !== null && expDays <= 60 ? (
                          <View className={`px-2 py-0.5 rounded-full ${expDays <= 30 ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                            <Text className={`text-[10px] font-semibold ${expDays <= 30 ? 'text-red-700' : 'text-amber-700'}`}>
                              {t.leases.endsInDays.replace('{{days}}', String(expDays))}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Docs */}
                      <View className="mt-3 border-t border-border-soft pt-3">
                        <View className="flex-row items-center justify-between mb-1.5">
                          <Text className="text-[11px] font-bold text-muted uppercase tracking-wide">{t.leases.docs.heading}</Text>
                          {canEdit ? (
                            <Pressable onPress={() => pickLeaseDoc(l.id)} disabled={!!uploadingDocLease} className="active:opacity-60">
                              <Text className="text-xs font-semibold text-primary">
                                {uploadingDocLease === l.id ? t.leases.docs.uploading : t.leases.docs.addBtn}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                        {docs.length === 0 ? (
                          <Text className="text-xs text-faint">{t.leases.docs.empty}</Text>
                        ) : docs.map(d => (
                          <View key={d.id} className="flex-row items-center gap-2 bg-surface rounded-lg px-2.5 py-2 mb-1">
                            <FileText size={14} color={c.muted} />
                            <Pressable onPress={() => openLeaseDoc(d)} className="flex-1 active:opacity-60">
                              <Text className="text-xs text-ink" numberOfLines={1}>{d.file_name}</Text>
                            </Pressable>
                            {canEdit ? (
                              <Pressable onPress={() => deleteLeaseDoc(d)} hitSlop={8} className="active:opacity-60">
                                <Trash2 size={13} color={c.danger} />
                              </Pressable>
                            ) : null}
                          </View>
                        ))}
                      </View>

                      {/* Deposit — held vs returned */}
                      {l.deposit_amount != null ? (
                        <View className="mt-3 rounded-xl bg-surface px-3 py-2.5">
                          <View className="flex-row items-center justify-between gap-2">
                            <View className="flex-1">
                              <Text className="text-[10px] font-bold text-faint uppercase">{t.leases.depositHeading}</Text>
                              <View className="flex-row items-center gap-2 mt-0.5">
                                <Text className="text-sm font-semibold text-ink">{fmtMoney(l.deposit_amount)}</Text>
                                <View className={`px-1.5 py-0.5 rounded-full ${l.deposit_returned_on ? 'bg-border-soft' : 'bg-emerald-500/10'}`}>
                                  <Text className={`text-[9px] font-semibold ${l.deposit_returned_on ? 'text-muted' : 'text-emerald-700'}`}>
                                    {l.deposit_returned_on
                                      ? t.leases.depositReturned.replace('{{date}}', formatDateLong(`${l.deposit_returned_on}T00:00:00`, dateLoc))
                                      : t.leases.depositHeld}
                                  </Text>
                                </View>
                              </View>
                              {l.deposit_withheld ? (
                                <Text className="text-[11px] text-muted mt-0.5" numberOfLines={2}>
                                  {t.leases.depositWithheldLabel}: {fmtMoney(l.deposit_withheld)}{l.deposit_note ? ` · ${l.deposit_note}` : ''}
                                </Text>
                              ) : l.deposit_note ? (
                                <Text className="text-[11px] text-muted mt-0.5" numberOfLines={2}>{l.deposit_note}</Text>
                              ) : null}
                            </View>
                            {canEdit ? (
                              l.deposit_returned_on ? (
                                <Pressable onPress={() => void undoDepositReturn(l)} hitSlop={6} className="active:opacity-60">
                                  <Text className="text-xs font-semibold text-muted">{t.leases.undoReturnBtn}</Text>
                                </Pressable>
                              ) : (
                                <Pressable onPress={() => openReturnDeposit(l)} hitSlop={6} className="active:opacity-60">
                                  <Text className="text-xs font-semibold text-primary">{t.leases.returnDepositBtn}</Text>
                                </Pressable>
                              )
                            ) : null}
                          </View>
                        </View>
                      ) : null}

                      {/* Tenant signature */}
                      <View className="mt-3 rounded-xl bg-surface px-3 py-2.5">
                        <Text className="text-[10px] font-bold text-faint uppercase">{t.leases.signHeading}</Text>
                        {l.tenant_signed_at ? (
                          <Text className="text-xs font-semibold text-emerald-700 mt-0.5">
                            {t.leases.signedBy
                              .replace('{{name}}', l.tenant_signer_name ?? '')
                              .replace('{{date}}', formatDateTimeLong(l.tenant_signed_at, dateLoc))}
                          </Text>
                        ) : (
                          <Text className="text-xs text-muted mt-0.5">{t.leases.unsignedBadge}</Text>
                        )}
                        {canEdit ? (
                          <View className="flex-row flex-wrap gap-4 mt-2">
                            {l.tenant_signature ? (
                              <Pressable onPress={() => setSignatureView(l)} hitSlop={6} className="active:opacity-60">
                                <Text className="text-xs font-semibold text-muted">{t.leases.viewSignatureBtn}</Text>
                              </Pressable>
                            ) : null}
                            {!l.tenant_signed_at ? (
                              <>
                                <Pressable onPress={() => void shareSignLink(l)} hitSlop={6} className="active:opacity-60">
                                  <Text className="text-xs font-semibold text-primary">
                                    {l.share_token ? t.leases.copyLinkBtn : t.leases.signLinkBtn}
                                  </Text>
                                </Pressable>
                                <Pressable onPress={() => openSignInPerson(l)} hitSlop={6} className="active:opacity-60">
                                  <Text className="text-xs font-semibold text-primary">{t.leases.signInPersonBtn}</Text>
                                </Pressable>
                              </>
                            ) : null}
                          </View>
                        ) : null}
                      </View>

                      {/* Actions */}
                      {canEdit ? (
                        <View className="mt-3 flex-row justify-end gap-4">
                          {canCreate ? (
                            <Pressable onPress={() => openRenewLease(l)} className="active:opacity-60">
                              <Text className="text-xs font-semibold text-emerald-600">{t.leases.renewBtn}</Text>
                            </Pressable>
                          ) : null}
                          {l.status === 'active' ? (
                            <Pressable onPress={() => endLease(l)} className="active:opacity-60">
                              <Text className="text-xs font-semibold text-red-600">{t.leases.endBtn}</Text>
                            </Pressable>
                          ) : null}
                          <Pressable onPress={() => openEditLease(l)} className="active:opacity-60">
                            <Text className="text-xs font-semibold text-primary">{tc.buttons.edit}</Text>
                          </Pressable>
                          {canDelete ? (
                            <Pressable onPress={() => deleteLease(l)} className="active:opacity-60">
                              <Text className="text-xs font-semibold text-red-600">{tc.buttons.delete}</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {detailTab === 'ledger' ? (
              <View className="gap-3">
                {sortedLeases.length === 0 ? (
                  <View className="bg-card rounded-2xl border border-border-soft p-8 items-center">
                    <Text className="text-sm text-muted">{t.leases.empty}</Text>
                  </View>
                ) : sortedLeases.map(l => {
                  const tn = tenantOf(l.tenant_id);
                  const lCharges = chargesByLease.get(l.id) ?? [];
                  const lPays = propPayments.filter(p => p.lease_id === l.id);
                  const balance = leaseBalance(lCharges, lPays);
                  return (
                    <View key={l.id} className="bg-card rounded-2xl border border-border-soft p-4">
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-sm font-semibold text-ink flex-1" numberOfLines={1}>
                          {tn ? tenantName(tn) : '—'}{l.unit_label ? ` · ${l.unit_label}` : ''}
                        </Text>
                        <Text className={`text-sm font-bold ${balance > PAY_TOLERANCE ? 'text-red-600' : 'text-emerald-600'}`}>
                          {fmtMoney(Math.max(0, balance))}
                        </Text>
                      </View>
                      <View className="flex-row gap-2 mb-1">
                        {canCreate ? (
                          <Pressable onPress={() => openAddCharge(l)}
                            className="px-3 py-1.5 rounded-full bg-primary/10 active:opacity-70">
                            <Text className="text-xs font-semibold text-primary">{t.ledger.addChargeBtn}</Text>
                          </Pressable>
                        ) : null}
                        {canCreate && balance > PAY_TOLERANCE ? (
                          <Pressable onPress={() => void markAllPaid(l)}
                            className="px-3 py-1.5 rounded-full bg-emerald-500/10 active:opacity-70">
                            <Text className="text-xs font-semibold text-emerald-700">{t.ledger.markAllPaidBtn}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {lCharges.length === 0 ? (
                        <Text className="text-xs text-faint">{t.ledger.noCharges}</Text>
                      ) : lCharges.map(ch => {
                        const paid = paidOn(ch.id);
                        const st = chargeStatus(ch, paid);
                        const cPays = paymentsByCharge.get(ch.id) ?? [];
                        const expanded = expandedCharge === ch.id;
                        const waived = ch.kind === 'late_fee' && ch.amount <= PAY_TOLERANCE;
                        return (
                          <View key={ch.id} className="border-t border-border-soft py-2.5">
                            <View className="flex-row items-center gap-2">
                              <Pressable onPress={() => setExpandedCharge(expanded ? null : ch.id)} hitSlop={6} disabled={cPays.length === 0}>
                                {cPays.length > 0
                                  ? (expanded ? <ChevronDown size={15} color={c.muted} /> : <ChevronRight size={15} color={c.muted} />)
                                  : <View style={{ width: 15 }} />}
                              </Pressable>
                              <View className="flex-1">
                                <View className="flex-row items-center gap-1.5">
                                  <Text className="text-sm text-ink">{monthLabel(ch.period_start)}</Text>
                                  {ch.kind !== 'rent' ? (
                                    <View className={`px-1.5 py-0.5 rounded-full ${ch.kind === 'late_fee' ? 'bg-orange-500/10' : 'bg-indigo-500/10'}`}>
                                      <Text className={`text-[9px] font-semibold ${ch.kind === 'late_fee' ? 'text-orange-700' : 'text-indigo-600'}`}>
                                        {ch.kind === 'late_fee' ? t.ledger.kindLateFee : t.ledger.kindOther}
                                      </Text>
                                    </View>
                                  ) : null}
                                  {waived ? (
                                    <View className="px-1.5 py-0.5 rounded-full bg-border-soft">
                                      <Text className="text-[9px] font-semibold text-muted">{t.ledger.waivedBadge}</Text>
                                    </View>
                                  ) : null}
                                </View>
                                <Text className="text-[11px] text-faint" numberOfLines={1}>
                                  {st === 'paid' || paid <= PAY_TOLERANCE
                                    ? fmtMoney(ch.amount)
                                    : t.ledger.paidOfAmount.replace('{{paid}}', fmtMoney(paid)).replace('{{total}}', fmtMoney(ch.amount))}
                                  {ch.note ? ` · ${ch.note}` : ''}
                                </Text>
                              </View>
                              {waived ? null : statusChip(st, chargeDaysLate(ch))}
                              {canEdit ? (
                                <Pressable onPress={() => { setChargeEdit(ch); setChargeAmount(String(ch.amount)); }} hitSlop={6} className="active:opacity-60">
                                  <Pencil size={13} color={c.muted} />
                                </Pressable>
                              ) : null}
                              {canEdit && ch.kind === 'late_fee' && !waived ? (
                                <Pressable onPress={() => void waiveCharge(ch)} hitSlop={6} className="active:opacity-60">
                                  <BadgeX size={13} color={c.muted} />
                                </Pressable>
                              ) : null}
                              {canEdit && ch.kind === 'other' ? (
                                <Pressable onPress={() => void deleteCharge(ch)} hitSlop={6} className="active:opacity-60">
                                  <Trash2 size={13} color={c.danger} />
                                </Pressable>
                              ) : null}
                            </View>
                            {canEdit && st !== 'paid' && !waived ? (
                              <Pressable onPress={() => openRecordPayment(ch)}
                                className="mt-2 ml-6 self-start px-3 py-1.5 rounded-full bg-primary/10 active:opacity-70">
                                <Text className="text-xs font-semibold text-primary">{t.ledger.recordPaymentBtn}</Text>
                              </Pressable>
                            ) : null}
                            {expanded && cPays.length > 0 ? (
                              <View className="ml-6 mt-2 gap-1">
                                {cPays.map(p => (
                                  <View key={p.id} className="flex-row items-center gap-2 bg-surface rounded-lg px-2.5 py-2">
                                    <Text className="text-xs font-semibold text-ink">{fmtMoney(p.amount)}</Text>
                                    <Text className="text-[11px] text-muted flex-1" numberOfLines={1}>
                                      {[p.method, formatDateLong(`${p.paid_on}T00:00:00`, locale)].filter(Boolean).join(' · ')}
                                    </Text>
                                    {p.photo_path ? (
                                      <Pressable onPress={() => viewPayPhoto(p)} hitSlop={6} className="active:opacity-60">
                                        <Camera size={13} color={c.muted} />
                                      </Pressable>
                                    ) : null}
                                    {canEdit ? (
                                      <>
                                        <Pressable onPress={() => openEditPayment(ch, p)} hitSlop={6} className="active:opacity-60">
                                          <Pencil size={13} color={c.muted} />
                                        </Pressable>
                                        <Pressable onPress={() => deletePayment(p)} hitSlop={6} className="active:opacity-60">
                                          <Trash2 size={13} color={c.danger} />
                                        </Pressable>
                                      </>
                                    ) : null}
                                  </View>
                                ))}
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {detailTab === 'expenses' ? (
              <View className="gap-3">
                <View className="bg-card rounded-2xl border border-border-soft px-4 py-3 flex-row justify-between">
                  <Text className="text-sm font-semibold text-ink">{t.expenses.totalLabel}</Text>
                  <Text className="text-sm font-bold text-ink">{fmtMoney(dExpensesTotal)}</Text>
                </View>
                {propExpenses.length === 0 ? (
                  <View className="bg-card rounded-2xl border border-border-soft p-8 items-center">
                    <Text className="text-sm text-muted">{t.expenses.empty}</Text>
                  </View>
                ) : propExpenses.map(e => (
                  <View key={e.id} className="bg-card rounded-2xl border border-border-soft px-4 py-3 flex-row items-center gap-2">
                    <View className="flex-1">
                      <Text className="text-sm text-ink" numberOfLines={1}>
                        {t.expenses.categories[e.category]}{e.vendor ? ` · ${e.vendor}` : ''}
                      </Text>
                      <Text className="text-[11px] text-muted" numberOfLines={1}>
                        {formatDateLong(`${e.expense_date}T00:00:00`, locale)}{e.note ? ` · ${e.note}` : ''}
                        {e.maintenance_id ? ` · ${t.expenses.fromMaintenance}` : ''}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-ink">{fmtMoney(e.amount)}</Text>
                    {e.receipt_path ? (
                      <Pressable onPress={() => viewReceipt(e)} hitSlop={6} className="active:opacity-60">
                        <Camera size={14} color={c.muted} />
                      </Pressable>
                    ) : null}
                    {canEdit ? (
                      <Pressable onPress={() => openEditExpense(e)} hitSlop={6} className="active:opacity-60">
                        <Pencil size={14} color={c.muted} />
                      </Pressable>
                    ) : null}
                    {canDelete ? (
                      <Pressable onPress={() => deleteExpense(e)} hitSlop={6} className="active:opacity-60">
                        <Trash2 size={14} color={c.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {detailTab === 'maintenance' ? (
              <View className="gap-3">
                {propMaint.length === 0 ? (
                  <View className="bg-card rounded-2xl border border-border-soft p-8 items-center">
                    <Wrench size={26} color={c.faint} />
                    <Text className="text-sm text-muted mt-2">{t.maintenance.empty}</Text>
                  </View>
                ) : propMaint.map(m => {
                  const stBg = m.status === 'done' ? 'bg-emerald-500/10' : m.status === 'in_progress' ? 'bg-amber-500/10' : 'bg-red-500/10';
                  const stFg = m.status === 'done' ? 'text-emerald-700' : m.status === 'in_progress' ? 'text-amber-700' : 'text-red-700';
                  const stLabel = m.status === 'done' ? t.maintenance.statusDone : m.status === 'in_progress' ? t.maintenance.statusInProgress : t.maintenance.statusOpen;
                  const emp = m.employee_id ? employees.find(e => e.id === m.employee_id) : null;
                  return (
                    <View key={m.id} className="bg-card rounded-2xl border border-border-soft px-4 py-3 flex-row items-center gap-2">
                      <View className="flex-1">
                        <Text className="text-sm text-ink" numberOfLines={1}>{m.title}</Text>
                        <Text className="text-[11px] text-muted" numberOfLines={1}>
                          {formatDateLong(`${m.reported_on}T00:00:00`, locale)}
                          {m.cost != null ? ` · ${fmtMoney(m.cost)}` : ''}
                          {emp ? ` · ${emp.first_name} ${emp.last_name}` : m.fixed_by ? ` · ${m.fixed_by}` : ''}
                        </Text>
                      </View>
                      <View className={`px-2 py-0.5 rounded-full ${stBg}`}>
                        <Text className={`text-[10px] font-semibold ${stFg}`}>{stLabel}</Text>
                      </View>
                      {canEdit ? (
                        <Pressable onPress={() => openEditMaint(m)} hitSlop={6} className="active:opacity-60">
                          <Pencil size={14} color={c.muted} />
                        </Pressable>
                      ) : null}
                      {canDelete ? (
                        <Pressable onPress={() => deleteMaint(m)} hitSlop={6} className="active:opacity-60">
                          <Trash2 size={14} color={c.danger} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {detailTab === 'photos' ? (
              // Explicit pixel tiles (equipment pattern): % width + aspectRatio
              // never resolves a height for an empty box, which collapsed the
              // Add tile and mis-centered its icon. 16px screen padding, 12px
              // gap, two columns. Grouped by category (general / tenant stay
              // before-after) — the Add tile uploads into the selected category.
              (() => {
                const tileW = (Dimensions.get('window').width - 32 - 12) / 2;
                const tileH = Math.round(tileW * 10 / 16);
                const tile = (p: RentalPropertyPhoto, i: number) => (
                  <Pressable key={p.id} onPress={() => setPhotoViewer(i)}
                    className="rounded-xl overflow-hidden border border-border-soft" style={{ width: tileW, height: tileH }}>
                    <Image source={{ uri: detailPhotoUrls[p.storage_path] }}
                      style={{ width: '100%', height: '100%', transform: [{ rotate: `${p.rotation ?? 0}deg` }] }} resizeMode="cover" />
                    {p.is_cover ? (
                      <View className="absolute top-1.5 left-1.5 flex-row items-center gap-1 px-2 py-0.5 rounded-full bg-black/55">
                        <Star size={10} color="#FBBF24" fill="#FBBF24" />
                        <Text className="text-[10px] font-semibold text-white">{t.photos.coverBadge}</Text>
                      </View>
                    ) : null}
                    {canEdit ? (
                      <Pressable onPress={() => deletePropertyPhoto(p)} hitSlop={8}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 items-center justify-center active:opacity-70">
                        <X size={14} color="#fff" />
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
                return (
                  <View className="gap-4">
                    {canEdit && photoCatOptions.length > 1 ? (
                      <Select label={t.photos.categoryLabel} value={photoCat} onValueChange={setPhotoCat} options={photoCatOptions} />
                    ) : null}
                    {photoGroups.map(g => (
                      <View key={g.key} className="gap-2">
                        {g.label ? (
                          <Text className="text-xs font-semibold text-faint uppercase">{g.label}</Text>
                        ) : null}
                        <View className="flex-row flex-wrap gap-3">
                          {g.items.map(({ p, index }) => tile(p, index))}
                        </View>
                      </View>
                    ))}
                    {canEdit ? (
                      <View className="flex-row flex-wrap gap-3">
                        <Pressable onPress={() => setPhotoChooserOpen(true)} disabled={uploadingPhoto}
                          className="rounded-xl border-2 border-dashed border-border items-center justify-center active:bg-card"
                          style={{ width: tileW, height: tileH }}>
                          {uploadingPhoto ? <ActivityIndicator color={c.primary} /> : (
                            <>
                              <ImagePlus size={22} color={c.faint} />
                              <Text className="text-[11px] text-muted mt-1.5 font-medium">{t.photos.addBtn}</Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })()
            ) : null}
          </ScrollView>
        )}

        {/* Contextual FAB */}
        {canCreate && !detailLoading && (detailTab === 'leases' || detailTab === 'expenses' || detailTab === 'maintenance') ? (
          <Pressable
            onPress={detailTab === 'leases' ? openAddLease : detailTab === 'expenses' ? openAddExpense : openAddMaint}
            hitSlop={8}
            className="absolute right-5 w-14 h-14 rounded-full bg-primary items-center justify-center active:opacity-80"
            style={{ bottom: 148, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 }}
          >
            <Plus size={26} color="#fff" />
          </Pressable>
        ) : null}

        {/* Fullscreen photo viewer — swipe pages, native pinch-zoom */}
        <RNModal visible={viewerPhoto !== null} transparent animationType="fade" onRequestClose={() => setPhotoViewer(null)}>
          {(() => {
            const { width: screenW, height: screenH } = Dimensions.get('window');
            const availH = screenH - insets.top - insets.bottom - 120;
            return (
              <View style={{ flex: 1, backgroundColor: '#000' }}>
                <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Pressable onPress={() => setPhotoViewer(null)} hitSlop={10}>
                    <X size={26} color="#FFFFFF" />
                  </Pressable>
                  <Text className="text-sm font-medium text-white/80">
                    {photoViewer !== null ? `${photoViewer + 1} / ${propPhotos.length}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                    {canEdit && viewerPhoto ? (
                      <Pressable onPress={() => void setCoverPropertyPhoto(viewerPhoto)} hitSlop={10} accessibilityLabel={t.photos.setCoverBtn}>
                        <Star size={22} color="#FBBF24" fill={viewerPhoto.is_cover ? '#FBBF24' : 'transparent'} />
                      </Pressable>
                    ) : null}
                    {canEdit ? (
                      <Pressable onPress={() => void rotateViewerPhoto()} hitSlop={10}>
                        <RotateCw size={22} color="#FFFFFF" />
                      </Pressable>
                    ) : null}
                    {canEdit && viewerPhoto ? (
                      <Pressable onPress={() => void deletePropertyPhoto(viewerPhoto)} hitSlop={10}>
                        <Trash2 size={22} color={c.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <FlatList
                    ref={photoViewerListRef}
                    data={propPhotos}
                    keyExtractor={p => p.id}
                    extraData={propPhotos}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    initialScrollIndex={photoViewer ?? 0}
                    getItemLayout={(_, index) => ({ length: screenW, offset: screenW * index, index })}
                    onMomentumScrollEnd={e => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / screenW);
                      setPhotoViewer(prev => (prev === idx ? prev : idx));
                    }}
                    renderItem={({ item }) => {
                      const r = (item.rotation ?? 0) % 360;
                      const swap = r === 90 || r === 270;
                      return (
                        <ScrollView
                          style={{ width: screenW, height: availH }}
                          contentContainerStyle={{ width: screenW, height: availH, alignItems: 'center', justifyContent: 'center' }}
                          maximumZoomScale={4}
                          minimumZoomScale={1}
                          bouncesZoom
                          showsHorizontalScrollIndicator={false}
                          showsVerticalScrollIndicator={false}
                        >
                          <Image
                            source={{ uri: detailPhotoUrls[item.storage_path] }}
                            style={{ width: swap ? availH : screenW, height: swap ? screenW : availH, transform: [{ rotate: `${r}deg` }] }}
                            resizeMode="contain"
                          />
                        </ScrollView>
                      );
                    }}
                  />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: insets.bottom + 12 }}>
                  <Pressable onPress={() => photoViewerGoTo(-1)} disabled={photoViewer === 0} hitSlop={10}
                    className="w-12 h-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.12)', opacity: photoViewer === 0 ? 0.3 : 1 }}>
                    <ChevronLeft size={24} color="#FFFFFF" />
                  </Pressable>
                  <Pressable onPress={() => photoViewerGoTo(1)} disabled={photoViewer === propPhotos.length - 1} hitSlop={10}
                    className="w-12 h-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.12)', opacity: photoViewer === propPhotos.length - 1 ? 0.3 : 1 }}>
                    <ChevronRight size={24} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
            );
          })()}
        </RNModal>

        {/* ── Sheets (rendered on the detail screen) ── */}
        {renderPropFormSheet()}
        {renderLeaseFormSheet()}
        {renderPaymentSheet()}
        {renderChargeEditSheet()}
        {renderAddChargeSheet()}
        {renderDepositSheet()}
        {renderSignSheet()}
        {renderSignatureViewSheet()}
        {renderExpenseSheet()}
        {renderMaintSheet()}

        {/* Property-photo chooser (own modal — nothing else is open) */}
        <RNModal visible={photoChooserOpen} transparent animationType="fade" onRequestClose={() => setPhotoChooserOpen(false)}>
          <View className="flex-1 justify-end">
            <Pressable onPress={() => setPhotoChooserOpen(false)} style={sheetScrim} />
            <View className="bg-card rounded-t-3xl px-4 pb-8 pt-4">
              <View className="items-center mb-3"><View className="w-10 h-1 bg-border rounded-full" /></View>
              <View className="bg-surface rounded-2xl overflow-hidden">
                <Pressable onPress={() => addPropertyPhoto('camera')} className="flex-row items-center gap-3 px-5 py-4 active:bg-border-soft border-b border-border-soft">
                  <Camera size={18} color={c.primary} />
                  <Text className="text-sm font-semibold text-ink">{t.photos.takePhoto}</Text>
                </Pressable>
                <Pressable onPress={() => addPropertyPhoto('library')} className="flex-row items-center gap-3 px-5 py-4 active:bg-border-soft">
                  <ImagePlus size={18} color={c.primary} />
                  <Text className="text-sm font-semibold text-ink">{t.photos.chooseFromLibrary}</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => setPhotoChooserOpen(false)} className="mt-3 items-center py-3.5 rounded-2xl bg-border-soft active:bg-border">
                <Text className="text-sm font-semibold text-ink">{tc.buttons.cancel}</Text>
              </Pressable>
            </View>
          </View>
        </RNModal>
      </SafeAreaView>
    );
  }

  // ── Root screen ─────────────────────────────────────────────────────────────
  const rootTabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: t.tabs.overview },
    { key: 'properties', label: t.tabs.properties },
    { key: 'tenants', label: t.tabs.tenants },
  ];

  // ── Overview exports (same documents the web Overview produces) ────────────
  const exportRentRollCsv = async () => {
    const head = [t.overview.propertyColumn, t.overview.tenantColumn, t.overview.rentColumn,
      t.overview.collectedColumn, t.overview.outstandingColumn, t.overview.statusColumn];
    const body = rollRows.map(r => [
      `${r.property?.name ?? ''}${r.lease?.unit_label ? ` · ${r.lease.unit_label}` : ''}`,
      r.tenant ? tenantName(r.tenant) : '',
      String(r.charge.amount),
      String(Math.min(r.paid, r.charge.amount)),
      String(Math.max(0, r.charge.amount - r.paid)),
      r.status,
    ]);
    const csv = [head, ...body].map(cols => cols.map(csvCell).join(',')).join('\r\n');
    try {
      const path = `${FileSystem.cacheDirectory}rent-roll-${period.slice(0, 7)}.csv`;
      await FileSystem.writeAsStringAsync(path, `\ufeff${csv}`, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
      }
    } catch { Alert.alert('', t.saveError); }
  };

  const exportStatement = async () => {
    const catLabels = t.expenses.categories as unknown as Record<string, string>;
    const income = perf
      .map(pf => ({ label: properties.find(pr => pr.id === pf.propertyId)?.name ?? '—', amount: pf.collected }))
      .filter(r => r.amount > PAY_TOLERANCE)
      .sort((a, b) => b.amount - a.amount);
    const html = buildRentalStatementHtml({
      businessName: business?.name ?? '',
      logoUrl: business?.logo_url ?? null,
      businessLines: [
        [business?.address, business?.city, business?.state].filter(Boolean).join(', '),
        [business?.phone, business?.email].filter(Boolean).join(' · '),
      ].filter(Boolean),
      income,
      expenses: expensesByCategory(overviewExpenses, monthBounds.from, monthBounds.to)
        .map(r => ({ label: catLabels[r.category] ?? r.category, amount: r.amount })),
      labels: {
        title: t.overview.statementTitle.replace('{{month}}', monthLabel(period)),
        incomeHeading: t.overview.statementIncomeHeading,
        expensesHeading: t.overview.statementExpensesHeading,
        categoryColumn: t.overview.statementCategoryColumn,
        amountColumn: t.overview.statementAmountColumn,
        totalIncome: t.overview.statementTotalIncome,
        totalExpenses: t.overview.statementTotalExpenses,
        net: t.overview.statementNet,
        generatedOn: t.overview.statementGeneratedOn.replace('{{date}}', formatDateLong(new Date(), dateLoc)),
      },
    });
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      }
    } catch { Alert.alert('', t.saveError); }
  };

  const sortedTenants = [...tenants].sort((a, b) =>
    tenantName(a).localeCompare(tenantName(b), 'es', { sensitivity: 'base' }));
  const activeTenantIds = new Set(activeLeases.map(l => l.tenant_id));

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable onPress={() => router.navigate('/dashboard/mas' as never)} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <View className="ml-1 flex-1">
          <Text className="text-lg font-semibold text-ink">{t.title}</Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {t.propertiesCount.replace('{{count}}', String(serverTotal))} · {t.subtitle}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row px-4 pt-3 gap-2">
        {rootTabs.map(({ key, label }) => (
          <Pressable key={key} onPress={() => setTab(key)}
            className={`px-3.5 py-2 rounded-full border ${tab === key ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
            <Text className={`text-sm font-medium ${tab === key ? 'text-white' : 'text-ink'}`}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'overview' ? (
        monthLoading || peopleLoading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color={c.primary} /></View>
        ) : (
          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 220 }}>
            {/* Month stepper */}
            <View className="flex-row items-center justify-between mb-3">
              <Pressable onPress={() => setPeriod(p => shiftMonth(p, -1))} hitSlop={10}
                className="w-9 h-9 rounded-full bg-card border border-border-soft items-center justify-center active:opacity-70">
                <ChevronLeft size={18} color={c.muted} />
              </Pressable>
              <View className="items-center">
                <Text className="text-base font-bold text-ink">{monthLabel(period)}</Text>
                {period !== currentPeriod() ? (
                  <Pressable onPress={() => setPeriod(currentPeriod())} hitSlop={8}>
                    <Text className="text-[11px] font-semibold text-primary">{t.overview.todayBtn}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable onPress={() => setPeriod(p => shiftMonth(p, 1))} hitSlop={10}
                className="w-9 h-9 rounded-full bg-card border border-border-soft items-center justify-center active:opacity-70">
                <ChevronRight size={18} color={c.muted} />
              </Pressable>
            </View>

            <View className="flex-row gap-2 mb-3">
              <Pressable onPress={() => void exportRentRollCsv()}
                className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-xl border border-border-soft bg-card active:opacity-70">
                <Download size={14} color={c.muted} />
                <Text className="text-xs font-semibold text-muted">{t.overview.exportCsvBtn}</Text>
              </Pressable>
              <Pressable onPress={() => void exportStatement()}
                className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-xl border border-border-soft bg-card active:opacity-70">
                <FileText size={14} color={c.muted} />
                <Text className="text-xs font-semibold text-muted">{t.overview.statementBtn}</Text>
              </Pressable>
            </View>

            <View className="flex-row gap-3">
              {statTile(t.overview.collectedLabel, fmtMoney(summary.collected), undefined, 'text-emerald-600')}
              {statTile(t.overview.billedLabel, fmtMoney(summary.billed))}
            </View>
            <View className="flex-row gap-3 mt-3">
              {statTile(t.overview.outstandingLabel, fmtMoney(summary.outstanding), undefined, summary.outstanding > PAY_TOLERANCE ? 'text-red-600' : 'text-ink')}
              {statTile(t.overview.overdueAmountLabel, fmtMoney(summary.overdueAmount),
                `${summary.overdueCount} ${t.overview.overdueLabel.toLowerCase()}`,
                summary.overdueAmount > PAY_TOLERANCE ? 'text-red-600' : 'text-ink')}
            </View>
            <View className="flex-row gap-3 mt-3">
              {statTile(
                t.overview.occupancyLabel,
                occ.capacity > 0 ? `${Math.round((occ.occupied / occ.capacity) * 100)}%` : '—',
                t.overview.occupiedOf.replace('{{occupied}}', String(occ.occupied)).replace('{{capacity}}', String(occ.capacity)),
              )}
              {statTile(t.overview.depositsHeldLabel, fmtMoney(held))}
            </View>

            {/* Month income vs expenses */}
            <View className="bg-card rounded-2xl border border-border-soft p-4 mt-3 flex-row justify-between">
              <View>
                <Text className="text-[11px] text-muted">{t.overview.incomeLabel}</Text>
                <Text className="text-sm font-bold text-emerald-600 mt-0.5">{fmtMoney(summary.collected)}</Text>
              </View>
              <View>
                <Text className="text-[11px] text-muted">{t.overview.expensesLabel}</Text>
                <Text className="text-sm font-bold text-red-600 mt-0.5">{fmtMoney(monthExpensesTotal)}</Text>
              </View>
              <View>
                <Text className="text-[11px] text-muted">{t.overview.netLabel}</Text>
                <Text className={`text-sm font-bold mt-0.5 ${summary.collected - monthExpensesTotal >= 0 ? 'text-ink' : 'text-red-600'}`}>
                  {fmtMoney(summary.collected - monthExpensesTotal)}
                </Text>
              </View>
            </View>

            {/* Year to date */}
            <View className="bg-card rounded-2xl border border-border-soft p-4 mt-3">
              <Text className="text-[11px] font-bold text-faint uppercase mb-2">{t.overview.ytdHeading}</Text>
              <View className="flex-row justify-between">
                <View>
                  <Text className="text-[11px] text-muted">{t.overview.ytdIncomeLabel}</Text>
                  <Text className="text-base font-bold text-emerald-600">{fmtMoney(ytd.income)}</Text>
                </View>
                <View>
                  <Text className="text-[11px] text-muted">{t.overview.ytdExpensesLabel}</Text>
                  <Text className="text-base font-bold text-red-600">{fmtMoney(ytd.expenses)}</Text>
                </View>
                <View>
                  <Text className="text-[11px] text-muted">{t.overview.ytdNetLabel}</Text>
                  <Text className={`text-base font-bold ${ytd.net >= 0 ? 'text-ink' : 'text-red-600'}`}>{fmtMoney(ytd.net)}</Text>
                </View>
              </View>
            </View>

            {/* 12-month trend — paired bars scaled to the window's max
               (the ReportsScreen pattern; no chart lib on mobile). */}
            {(() => {
              const max = Math.max(1, ...series.map(sp => Math.max(sp.income, sp.expenses)));
              return (
                <View className="bg-card rounded-2xl border border-border-soft p-4 mt-3">
                  <Text className="text-sm font-bold text-ink">{t.overview.trendHeading}</Text>
                  <Text className="text-[10px] text-faint mb-3">{t.overview.trendHint}</Text>
                  <View className="flex-row items-end justify-between" style={{ height: 110 }}>
                    {series.map(sp => (
                      <View key={sp.period} className="flex-1 items-center justify-end">
                        <View className="flex-row items-end gap-0.5" style={{ height: 90 }}>
                          <View className="w-1.5 rounded-t bg-teal-500"
                            style={{ height: Math.max(2, (sp.income / max) * 90) }} />
                          <View className="w-1.5 rounded-t bg-orange-500"
                            style={{ height: Math.max(2, (sp.expenses / max) * 90) }} />
                        </View>
                        <Text className="text-[8px] text-faint mt-1">{shortMonthLabel(sp.period)}</Text>
                      </View>
                    ))}
                  </View>
                  <View className="flex-row gap-4 mt-2">
                    <View className="flex-row items-center gap-1.5">
                      <View className="w-2 h-2 rounded-full bg-teal-500" />
                      <Text className="text-[10px] text-muted">{t.overview.incomeLabel}</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <View className="w-2 h-2 rounded-full bg-orange-500" />
                      <Text className="text-[10px] text-muted">{t.overview.expensesLabel}</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* Needs attention */}
            <View className="bg-card rounded-2xl border border-border-soft p-4 mt-3">
              <Text className="text-[11px] font-bold text-faint uppercase mb-2">{t.overview.attentionHeading}</Text>
              {expiringSoon.length === 0 && vacant === 0 && mtmCount === 0 ? (
                <Text className="text-sm text-muted">{t.overview.allGood}</Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {expiringSoon.length > 0 ? (
                    <View className="bg-amber-500/10 px-2.5 py-1 rounded-full">
                      <Text className="text-[11px] font-semibold text-amber-700">
                        {t.overview.expiringSoon.replace('{{count}}', String(expiringSoon.length))}
                      </Text>
                    </View>
                  ) : null}
                  {vacant > 0 ? (
                    <View className="bg-blue-500/10 px-2.5 py-1 rounded-full">
                      <Text className="text-[11px] font-semibold text-blue-700">
                        {t.overview.vacantUnits.replace('{{count}}', String(vacant))}
                      </Text>
                    </View>
                  ) : null}
                  {mtmCount > 0 ? (
                    <View className="bg-border-soft px-2.5 py-1 rounded-full">
                      <Text className="text-[11px] font-semibold text-muted">
                        {t.overview.monthToMonth.replace('{{count}}', String(mtmCount))}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            {/* Delinquency aging */}
            <Text className="text-xs font-bold text-muted uppercase tracking-wide mt-5 mb-2.5">
              {t.overview.agingHeading}
            </Text>
            {aging.length === 0 ? (
              <View className="bg-card rounded-2xl border border-border-soft p-6 items-center">
                <Text className="text-sm text-muted text-center">{t.overview.agingEmpty}</Text>
              </View>
            ) : (
              <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
                {aging.map((a, i) => {
                  const lease = leases.find(l => l.id === a.leaseId);
                  const tn = lease ? tenantOf(lease.tenant_id) : null;
                  const prop = lease ? properties.find(pr => pr.id === lease.property_id) : null;
                  const bucket = a.d60plus > 0 ? t.overview.aging60plus
                    : a.d31_60 > 0 ? t.overview.aging31_60
                    : a.d1_30 > 0 ? t.overview.aging1_30
                    : t.overview.agingCurrent;
                  const tone = a.d60plus > 0 ? 'text-red-700'
                    : a.d31_60 > 0 ? 'text-orange-700'
                    : a.d1_30 > 0 ? 'text-amber-700' : 'text-muted';
                  return (
                    <Pressable key={a.leaseId} onPress={() => { if (prop) openDetail(prop); }}
                      className={`px-4 py-3 active:bg-surface ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="text-sm font-medium text-ink flex-1" numberOfLines={1}>
                          {tn ? tenantName(tn) : '—'}
                        </Text>
                        <Text className="text-sm font-bold text-ink">{fmtMoney(a.total)}</Text>
                      </View>
                      <View className="flex-row items-center justify-between mt-0.5">
                        <Text className="text-[11px] text-faint flex-1" numberOfLines={1}>
                          {prop?.name ?? '—'}{lease?.unit_label ? ` · ${lease.unit_label}` : ''}
                        </Text>
                        <Text className={`text-[11px] font-semibold ${tone}`}>{bucket}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Per-property performance */}
            {perf.length > 0 ? (
              <>
                <Text className="text-xs font-bold text-muted uppercase tracking-wide mt-5 mb-2.5">
                  {t.overview.propertiesHeading}
                </Text>
                <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
                  {perf.map((pf, i) => {
                    const prop = properties.find(pr => pr.id === pf.propertyId);
                    return (
                      <Pressable key={pf.propertyId} onPress={() => { if (prop) openDetail(prop); }}
                        className={`px-4 py-3 active:bg-surface ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                        <View className="flex-row items-center justify-between gap-2">
                          <Text className="text-sm font-medium text-ink flex-1" numberOfLines={1}>{prop?.name ?? '—'}</Text>
                          <Text className="text-[11px] text-muted">{pf.occupied}/{pf.units}</Text>
                        </View>
                        <View className="flex-row items-center justify-between mt-1">
                          <Text className="text-[11px] text-muted">
                            {t.overview.collectedColumn}: <Text className="text-emerald-600 font-semibold">{fmtMoney(pf.collected)}</Text>
                          </Text>
                          <Text className="text-[11px] text-muted">
                            {t.overview.outstandingColumn}: <Text className={pf.outstanding > PAY_TOLERANCE ? 'text-red-600 font-semibold' : 'text-ink'}>{fmtMoney(pf.outstanding)}</Text>
                          </Text>
                          <Text className="text-[11px] text-muted">
                            {t.overview.ytdNetColumn}: <Text className={pf.ytdNet >= 0 ? 'text-ink font-semibold' : 'text-red-600 font-semibold'}>{fmtMoney(pf.ytdNet)}</Text>
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text className="text-xs font-bold text-muted uppercase tracking-wide mt-5 mb-2.5">
              {t.overview.monthTitle.replace('{{month}}', monthLabel(period))}
            </Text>
            {rollRows.length === 0 ? (
              <View className="bg-card rounded-2xl border border-border-soft p-8 items-center">
                <Home size={26} color={c.faint} />
                <Text className="text-sm text-muted mt-2">{t.overview.noLeases}</Text>
              </View>
            ) : (
              <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
                {rollRows.map((r, i) => (
                  <Pressable key={r.charge.id}
                    onPress={() => { if (r.property) openDetail(r.property); }}
                    className={`px-4 py-3 active:bg-surface ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-sm font-medium text-ink flex-1" numberOfLines={1}>
                        {r.property?.name ?? '—'}{r.lease?.unit_label ? ` · ${r.lease.unit_label}` : ''}
                      </Text>
                      {statusChip(r.status, r.daysLate)}
                    </View>
                    <View className="flex-row items-center justify-between mt-0.5">
                      <Text className="text-xs text-muted flex-1" numberOfLines={1}>
                        {r.tenant ? tenantName(r.tenant) : '—'}
                      </Text>
                      <Text className="text-xs text-ink">
                        {r.status === 'partial'
                          ? t.ledger.paidOfAmount.replace('{{paid}}', fmtMoney(r.paid)).replace('{{total}}', fmtMoney(r.charge.amount))
                          : fmtMoney(r.charge.amount)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        )
      ) : null}

      {tab === 'properties' ? (
        <>
          <View className="px-4 pt-3">
            <View className="flex-row items-center rounded-2xl border border-border bg-card px-3">
              <Search size={14} color={c.faint} />
              <TextInput value={search} onChangeText={setSearch} placeholder={t.searchPlaceholder}
                placeholderTextColor={c.faint} className="flex-1 py-2.5 pl-2 text-sm text-ink" />
              {search.length > 0 ? (
                <Pressable onPress={() => setSearch('')} hitSlop={8} className="pl-1">
                  <X size={16} color={c.faint} />
                </Pressable>
              ) : null}
            </View>
          </View>
          {loading && properties.length === 0 ? (
            <View className="flex-1 items-center justify-center"><ActivityIndicator color={c.primary} /></View>
          ) : properties.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <Building2 size={36} color={c.faint} />
              <Text className="text-sm font-semibold text-ink mt-3">{t.emptyTitle}</Text>
              <Text className="text-xs text-muted mt-1 text-center">{t.emptyHint}</Text>
            </View>
          ) : (
            <FlatList
              className="flex-1"
              data={properties}
              keyExtractor={p => p.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 220, gap: 12 }}
              onEndReached={() => { if (cursor) void loadMore(); }}
              onEndReachedThreshold={0.4}
              ListFooterComponent={loadingMore ? <ActivityIndicator color={c.primary} /> : null}
              renderItem={({ item: p }) => {
                const cover = coverPhotos[p.id];
                const activeCount = activeLeases.filter(l => l.property_id === p.id).length;
                const capacity = Math.max(1, p.unit_count ?? 1);
                return (
                  <Pressable onPress={() => openDetail(p)}
                    className="bg-card rounded-2xl border border-border-soft overflow-hidden active:bg-surface">
                    {cover ? (
                      <Image source={{ uri: detailPhotoUrls[cover.storage_path] }} style={{ width: '100%', height: 150 }} resizeMode="cover" />
                    ) : (
                      <View style={{ height: 150 }} className="bg-surface items-center justify-center">
                        <Home size={38} color={c.faint} />
                      </View>
                    )}
                    <View className="p-4">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="text-base font-semibold text-ink flex-1" numberOfLines={1}>{p.name}</Text>
                        {p.status === 'inactive' ? (
                          <View className="bg-border-soft px-2 py-0.5 rounded-full">
                            <Text className="text-[10px] font-semibold text-muted">{t.propertyStatus.inactive}</Text>
                          </View>
                        ) : activeCount < capacity ? (
                          <View className="bg-amber-500/10 px-2 py-0.5 rounded-full">
                            <Text className="text-[10px] font-semibold text-amber-700">
                              {t.overview.occupiedOf.replace('{{occupied}}', String(activeCount)).replace('{{capacity}}', String(capacity))}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>
                        {[p.address, p.city].filter(Boolean).join(', ') || (p.property_type ? t.propertyTypes[p.property_type] : '—')}
                      </Text>
                      <View className="flex-row items-center gap-1.5 mt-1">
                        <Users size={12} color={c.muted} />
                        <Text className="text-xs text-muted">{activeCount}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </>
      ) : null}

      {tab === 'tenants' ? (
        peopleLoading && tenants.length === 0 ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color={c.primary} /></View>
        ) : sortedTenants.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Users size={36} color={c.faint} />
            <Text className="text-sm text-muted mt-3">{t.tenants.empty}</Text>
          </View>
        ) : (
          <FlatList
            className="flex-1"
            data={sortedTenants}
            keyExtractor={tn => tn.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 220, gap: 10 }}
            renderItem={({ item: tn }) => (
              <View className="bg-card rounded-2xl border border-border-soft px-4 py-3 flex-row items-center gap-3">
                <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
                  <Text className="text-sm font-bold text-primary">{tn.first_name.charAt(0).toUpperCase()}</Text>
                </View>
                <Pressable className="flex-1" onPress={() => setTenantDetail(tn)}>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-medium text-ink" numberOfLines={1}>{tenantName(tn)}</Text>
                    {activeTenantIds.has(tn.id) ? (
                      <View className="bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                        <Text className="text-[9px] font-semibold text-emerald-700">{t.tenants.activeLease}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="text-[11px] text-muted" numberOfLines={1}>
                    {[tn.phone ? formatPhoneInput(tn.phone) : null, tn.email].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </Pressable>
                {tn.phone ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${tn.phone}`)} hitSlop={6} className="active:opacity-60">
                    <Phone size={15} color={c.muted} />
                  </Pressable>
                ) : null}
                {canEdit ? (
                  <Pressable onPress={() => openEditTenant(tn)} hitSlop={6} className="active:opacity-60">
                    <Pencil size={15} color={c.muted} />
                  </Pressable>
                ) : null}
                {canDelete ? (
                  <Pressable onPress={() => deleteTenant(tn)} hitSlop={6} className="active:opacity-60">
                    <Trash2 size={15} color={c.danger} />
                  </Pressable>
                ) : null}
              </View>
            )}
          />
        )
      ) : null}

      {/* FAB — add property / tenant per tab */}
      {canCreate && (tab === 'properties' || tab === 'tenants') ? (
        <Pressable
          onPress={tab === 'properties' ? openAddProp : openAddTenant}
          hitSlop={8}
          className="absolute right-5 w-14 h-14 rounded-full bg-primary items-center justify-center active:opacity-80"
          style={{ bottom: 148, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 }}
        >
          <Plus size={26} color="#fff" />
        </Pressable>
      ) : null}

      {renderPropFormSheet()}
      {renderTenantFormSheet()}
    </SafeAreaView>
  );

  // ═══════════════════════════ SHEETS ═══════════════════════════
  // Each follows the CLAUDE.md contract: root View flex-1 justify-end, an
  // absolutely-positioned backdrop Pressable FIRST, then the card as a plain
  // sibling. In-sheet pickers are absolute overlays, never nested RNModals.

  function sheetShell(visible: boolean, onClose: () => void, title: string, children: React.ReactNode, overlay?: React.ReactNode) {
    return (
      <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <View className="flex-1 justify-end">
            <Pressable onPress={onClose} style={sheetScrim} />
            <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10" style={{ maxHeight: '88%' }}>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-lg font-bold text-ink">{title}</Text>
                <Pressable onPress={onClose} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                  <X size={22} color={c.faint} />
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
            </View>
          </View>
          {overlay}
        </KeyboardAvoidingView>
      </RNModal>
    );
  }

  function renderPropFormSheet() {
    return sheetShell(propFormOpen, () => setPropFormOpen(false), editingProp ? t.editProperty : t.addProperty, (
      <View className="gap-3.5 pb-2">
        <View>
          <Text className={labelCls}>{t.propertyForm.nameLabel}</Text>
          <TextInput value={propForm.name} onChangeText={v => setPropForm(f => ({ ...f, name: v }))}
            placeholder={t.propertyForm.namePlaceholder} placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <View>
          <Text className={labelCls}>{t.propertyForm.addressLabel}</Text>
          <TextInput value={propForm.address} onChangeText={v => setPropForm(f => ({ ...f, address: v }))}
            placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <View>
          <Text className={labelCls}>{t.propertyForm.cityLabel}</Text>
          <TextInput value={propForm.city} onChangeText={v => setPropForm(f => ({ ...f, city: v }))}
            placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Select label={t.propertyForm.stateLabel} value={propForm.state}
              onValueChange={v => setPropForm(f => ({ ...f, state: v }))}
              options={[{ value: '', label: '—' }, ...US_STATES.map(s => ({ value: s, label: usStateName(s, locale) }))]}
              searchable />
          </View>
          <View className="w-28">
            <Text className={labelCls}>{t.propertyForm.zipLabel}</Text>
            <TextInput value={propForm.zip} onChangeText={v => setPropForm(f => ({ ...f, zip: v.replace(/[^0-9]/g, '').slice(0, 5) }))}
              keyboardType="numeric" placeholderTextColor={c.faint} className={fieldCls} />
          </View>
        </View>
        <Select label={t.propertyForm.typeLabel} value={propForm.property_type}
          onValueChange={v => setPropForm(f => ({ ...f, property_type: v }))}
          options={[{ value: '', label: '—' }, ...PROPERTY_TYPES.map(k => ({ value: k, label: t.propertyTypes[k] }))]} />
        <View>
          <Text className={labelCls}>{t.propertyForm.unitCountLabel}</Text>
          <TextInput value={propForm.unit_count} onChangeText={v => setPropForm(f => ({ ...f, unit_count: v.replace(/[^0-9]/g, '') }))}
            keyboardType="numeric" placeholderTextColor={c.faint} className={fieldCls} />
          <Text className="text-xs text-faint mt-1">{t.propertyForm.unitCountHint}</Text>
        </View>
        <DatePicker label={t.propertyForm.purchaseDateLabel} value={propForm.purchase_date}
          onChange={v => setPropForm(f => ({ ...f, purchase_date: v }))} />
        <View>
          <Text className={labelCls}>{t.propertyForm.purchasePriceLabel}</Text>
          {moneyInput(propForm.purchase_price, v => setPropForm(f => ({ ...f, purchase_price: v })))}
        </View>
        {multiLocation ? (
          <Select label={t.propertyForm.branchLabel} value={propForm.location_id}
            onValueChange={v => setPropForm(f => ({ ...f, location_id: v }))}
            options={[{ value: '', label: '—' }, ...(locations ?? []).map(l => ({ value: l.id, label: l.name }))]} />
        ) : null}
        {editingProp ? (
          <Select label={t.propertyForm.statusLabel} value={propForm.status}
            onValueChange={v => setPropForm(f => ({ ...f, status: v as 'active' | 'inactive' }))}
            options={[
              { value: 'active', label: t.propertyStatus.active },
              { value: 'inactive', label: t.propertyStatus.inactive },
            ]} />
        ) : null}
        <View>
          <Text className={labelCls}>{t.propertyForm.notesLabel}</Text>
          <TextInput value={propForm.notes} onChangeText={v => setPropForm(f => ({ ...f, notes: v }))}
            multiline numberOfLines={3} textAlignVertical="top"
            placeholderTextColor={c.faint} className={`${fieldCls} min-h-[72px]`} />
        </View>
        {/* Photos while ADDING (uploaded after the row is created). Editing an
            existing property manages photos from its Fotos tab. */}
        {!editingProp ? (
          <View>
            <Text className={labelCls}>{t.photos.heading}</Text>
            <View className="flex-row flex-wrap gap-2">
              {pendingPhotoUris.map((uri, i) => (
                <View key={uri} className="rounded-xl overflow-hidden" style={{ width: 72, height: 72 }}>
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
                  <Pressable onPress={() => setPendingPhotoUris(prev => prev.filter((_, j) => j !== i))} hitSlop={8}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 items-center justify-center active:opacity-70">
                    <X size={11} color="#fff" />
                  </Pressable>
                </View>
              ))}
              <Pressable onPress={() => setPropPhotoChooserOpen(true)}
                className="rounded-xl border-2 border-dashed border-border items-center justify-center active:bg-surface"
                style={{ width: 72, height: 72 }}>
                <ImagePlus size={20} color={c.faint} />
              </Pressable>
            </View>
          </View>
        ) : null}
        <Pressable onPress={saveProp} disabled={savingProp || !propForm.name.trim()}
          className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
          {savingProp ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{tc.buttons.save}</Text>}
        </Pressable>
      </View>
    ), chooserOverlay(propPhotoChooserOpen, () => setPropPhotoChooserOpen(false), pickPropFormPhoto));
  }

  function renderTenantFormSheet() {
    return sheetShell(tenantFormOpen, () => setTenantFormOpen(false), editingTenant ? t.tenants.editTitle : t.tenants.addBtn, (
      <View className="gap-3.5 pb-2">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className={labelCls}>{t.tenants.form.firstNameLabel}</Text>
            <TextInput value={tenantForm.first_name} onChangeText={v => setTenantForm(f => ({ ...f, first_name: v }))}
              placeholderTextColor={c.faint} className={fieldCls} />
          </View>
          <View className="flex-1">
            <Text className={labelCls}>{t.tenants.form.lastNameLabel}</Text>
            <TextInput value={tenantForm.last_name} onChangeText={v => setTenantForm(f => ({ ...f, last_name: v }))}
              placeholderTextColor={c.faint} className={fieldCls} />
          </View>
        </View>
        <View>
          <Text className={labelCls}>{t.tenants.form.phoneLabel}</Text>
          <TextInput value={formatPhoneInput(tenantForm.phone)} onChangeText={v => setTenantForm(f => ({ ...f, phone: formatPhoneInput(v) }))}
            keyboardType="phone-pad" placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <View>
          <Text className={labelCls}>{t.tenants.form.emailLabel}</Text>
          <TextInput value={tenantForm.email} onChangeText={v => setTenantForm(f => ({ ...f, email: v }))}
            keyboardType="email-address" autoCapitalize="none" placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className={labelCls}>{t.tenants.form.emergencyNameLabel}</Text>
            <TextInput value={tenantForm.emergency_contact_name} onChangeText={v => setTenantForm(f => ({ ...f, emergency_contact_name: v }))}
              placeholderTextColor={c.faint} className={fieldCls} />
          </View>
          <View className="flex-1">
            <Text className={labelCls}>{t.tenants.form.emergencyPhoneLabel}</Text>
            <TextInput value={formatPhoneInput(tenantForm.emergency_contact_phone)} onChangeText={v => setTenantForm(f => ({ ...f, emergency_contact_phone: formatPhoneInput(v) }))}
              keyboardType="phone-pad" placeholderTextColor={c.faint} className={fieldCls} />
          </View>
        </View>
        <View>
          <Text className={labelCls}>{t.tenants.form.emergencyRelationLabel}</Text>
          <TextInput value={tenantForm.emergency_contact_relation}
            onChangeText={v => setTenantForm(f => ({ ...f, emergency_contact_relation: v }))}
            placeholder={t.tenants.form.emergencyRelationPlaceholder}
            placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <View>
          <Text className={labelCls}>{t.tenants.form.notesLabel}</Text>
          <TextInput value={tenantForm.notes} onChangeText={v => setTenantForm(f => ({ ...f, notes: v }))}
            multiline numberOfLines={2} textAlignVertical="top"
            placeholderTextColor={c.faint} className={`${fieldCls} min-h-[56px]`} />
        </View>
        <Pressable onPress={saveTenant} disabled={savingTenant || !tenantForm.first_name.trim()}
          className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
          {savingTenant ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{tc.buttons.save}</Text>}
        </Pressable>
      </View>
    ));
  }

  function renderLeaseFormSheet() {
    return sheetShell(
      leaseFormOpen,
      () => setLeaseFormOpen(false),
      editingLease ? t.leases.editTitle : renewSource ? t.leases.renewTitle : t.leases.addBtn,
      (
      <View className="gap-3.5 pb-2">
        <Select label={t.leases.form.tenantLabel} value={leaseForm.tenant_id}
          onValueChange={v => setLeaseForm(f => ({ ...f, tenant_id: v }))}
          placeholder={t.leases.form.tenantPlaceholder}
          options={tenants.map(tn => ({ value: tn.id, label: tenantName(tn) }))} />
        <View>
          <Text className={labelCls}>{t.leases.form.unitLabel}</Text>
          <TextInput value={leaseForm.unit_label} onChangeText={v => setLeaseForm(f => ({ ...f, unit_label: v }))}
            placeholder={t.leases.form.unitPlaceholder} placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <DatePicker label={t.leases.form.startLabel} value={leaseForm.start_date}
          onChange={v => setLeaseForm(f => ({ ...f, start_date: v }))} />
        <View>
          <DatePicker label={t.leases.form.endLabel} value={leaseForm.end_date}
            onChange={v => setLeaseForm(f => ({ ...f, end_date: v }))} />
          <Text className="text-xs text-faint mt-1">{t.leases.form.endHint}</Text>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className={labelCls}>{t.leases.form.rentLabel}</Text>
            {moneyInput(leaseForm.monthly_rent, v => setLeaseForm(f => ({ ...f, monthly_rent: v })))}
          </View>
          <View className="w-24">
            <Text className={labelCls}>{t.leases.form.dueDayLabel}</Text>
            <TextInput value={leaseForm.due_day}
              onChangeText={v => setLeaseForm(f => ({ ...f, due_day: v.replace(/[^0-9]/g, '').slice(0, 2) }))}
              keyboardType="numeric" placeholderTextColor={c.faint} className={fieldCls} />
          </View>
        </View>
        <View>
          <Text className={labelCls}>{t.leases.form.depositLabel}</Text>
          {moneyInput(leaseForm.deposit_amount, v => setLeaseForm(f => ({ ...f, deposit_amount: v })))}
        </View>
        <Text className="text-[11px] font-bold text-faint uppercase mt-1">{t.leases.form.lateFeeHeading}</Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className={labelCls}>{t.leases.form.lateFeeAmountLabel}</Text>
            {moneyInput(leaseForm.late_fee_amount, v => setLeaseForm(f => ({ ...f, late_fee_amount: v })))}
          </View>
          <View className="flex-1">
            <Text className={labelCls}>{t.leases.form.lateFeeGraceLabel}</Text>
            <TextInput value={leaseForm.late_fee_grace_days}
              onChangeText={v => setLeaseForm(f => ({ ...f, late_fee_grace_days: v.replace(/[^0-9]/g, '').slice(0, 2) }))}
              keyboardType="number-pad" placeholderTextColor={c.faint} className={fieldCls} />
          </View>
        </View>
        {leaseForm.late_fee_amount ? (
          <Text className="text-[11px] text-faint -mt-1">
            {t.leases.form.lateFeeSinceHint.replace('{{date}}',
              formatDateLong(`${editingLease?.late_fee_since ?? todayISO()}T00:00:00`, dateLoc))}
          </Text>
        ) : null}
        <Pressable onPress={() => setLeaseForm(f => ({ ...f, prorate_partial: !f.prorate_partial }))}
          className="flex-row items-start gap-2.5 active:opacity-70">
          <View className={`w-5 h-5 rounded-md border items-center justify-center mt-0.5 ${leaseForm.prorate_partial ? 'bg-primary border-primary' : 'border-border'}`}>
            {leaseForm.prorate_partial ? <Text className="text-white text-xs font-bold">✓</Text> : null}
          </View>
          <View className="flex-1">
            <Text className="text-sm text-ink">{t.leases.form.prorateLabel}</Text>
            <Text className="text-[11px] text-faint">{t.leases.form.prorateHint}</Text>
          </View>
        </Pressable>
        <View>
          <Text className={labelCls}>{t.leases.form.notesLabel}</Text>
          <TextInput value={leaseForm.notes} onChangeText={v => setLeaseForm(f => ({ ...f, notes: v }))}
            multiline numberOfLines={2} textAlignVertical="top"
            placeholderTextColor={c.faint} className={`${fieldCls} min-h-[56px]`} />
        </View>
        <Pressable onPress={saveLease}
          disabled={savingLease || !leaseForm.tenant_id || !leaseForm.start_date || !Number(leaseForm.monthly_rent)}
          className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
          {savingLease ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{tc.buttons.save}</Text>}
        </Pressable>
      </View>
    ));
  }

  function renderPaymentSheet() {
    return sheetShell(
      payOpen,
      () => setPayOpen(false),
      payEditId ? t.payments.editTitle : t.payments.recordTitle,
      (
        <View className="gap-3.5 pb-2">
          <View>
            <Text className={labelCls}>{t.payments.amountLabel}</Text>
            <View className="relative justify-center">
              <Text className="absolute left-3 z-10 text-faint">$</Text>
              <TextInput value={payAmount} onChangeText={v => setPayAmount(cleanMoney(v))}
                keyboardType="decimal-pad" placeholderTextColor={c.faint} className={`${fieldCls} pl-6 pr-32`} />
              {payCharge ? (
                <Pressable
                  onPress={() => {
                    const others = (paymentsByCharge.get(payCharge.id) ?? []).filter(p => p.id !== payEditId);
                    const remaining = Math.max(0, payCharge.amount - others.reduce((s, p) => s + p.amount, 0));
                    setPayAmount(String(Math.round(remaining * 100) / 100));
                  }}
                  className="absolute right-2 rounded-full bg-primary/10 px-2.5 py-1 active:opacity-70">
                  <Text className="text-xs font-semibold text-primary">{t.payments.fullAmountBtn}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View>
            <Text className={labelCls}>{t.payments.methodLabel}</Text>
            <TextInput value={payMethod} onChangeText={setPayMethod}
              placeholder={t.payments.methodPlaceholder} placeholderTextColor={c.faint} className={fieldCls} />
          </View>
          <DatePicker label={t.payments.dateLabel} value={payDate} onChange={setPayDate} />
          <View>
            <Text className={labelCls}>{t.payments.noteLabel}</Text>
            <TextInput value={payNote} onChangeText={setPayNote} placeholderTextColor={c.faint} className={fieldCls} />
          </View>
          <View>
            <Text className={labelCls}>{t.payments.photoLabel}</Text>
            {payPhotoUri || (payPhotoPath && !payPhotoRemoved) ? (
              <View className="flex-row items-center gap-3">
                {payPhotoUri ? <Image source={{ uri: payPhotoUri }} style={{ width: 56, height: 56, borderRadius: 8 }} /> : <Camera size={20} color={c.muted} />}
                <Pressable onPress={() => setPayChooserOpen(true)} className="active:opacity-60">
                  <Text className="text-sm text-primary font-semibold">{t.payments.changePhoto}</Text>
                </Pressable>
                <Pressable onPress={() => { setPayPhotoUri(null); setPayPhotoRemoved(true); }} className="active:opacity-60">
                  <Text className="text-sm text-red-600 font-semibold">{t.payments.removePhoto}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setPayChooserOpen(true)}
                className="flex-row items-center gap-2 bg-border-soft rounded-xl py-2.5 px-3 active:opacity-80">
                <Camera size={18} color={c.muted} />
                <Text className="text-sm text-muted font-medium">{t.payments.addPhoto}</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={submitPayment} disabled={payBusy || payAmount === '' || !(Number(payAmount) >= 0)}
            className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
            {payBusy ? <ActivityIndicator color="#fff" /> : (
              <Text className="text-sm font-semibold text-white">{payEditId ? tc.buttons.save : t.payments.recordBtn}</Text>
            )}
          </Pressable>
        </View>
      ),
      chooserOverlay(payChooserOpen, () => setPayChooserOpen(false), pickPayPhoto),
    );
  }

  function renderChargeEditSheet() {
    return sheetShell(!!chargeEdit, () => setChargeEdit(null), t.ledger.editChargeTitle, (
      <View className="gap-3.5 pb-2">
        {chargeEdit ? <Text className="text-sm text-muted">{monthLabel(chargeEdit.period_start)}</Text> : null}
        <View>
          <Text className={labelCls}>{t.ledger.chargeAmountLabel}</Text>
          {moneyInput(chargeAmount, setChargeAmount)}
        </View>
        <Pressable onPress={saveCharge} disabled={chargeBusy || !Number(chargeAmount)}
          className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
          {chargeBusy ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{tc.buttons.save}</Text>}
        </Pressable>
      </View>
    ));
  }

  function renderSignSheet() {
    return sheetShell(!!signLease, () => setSignLease(null), t.leases.signInPersonBtn, (
      <View className="gap-3.5 pb-2">
        <SignaturePad hint={t.leases.signPadHint} clearLabel={tc.buttons.clear} onChange={setSignData} />
        <View>
          <Text className={labelCls}>{t.leases.signerNameLabel}</Text>
          <TextInput value={signName} onChangeText={setSignName}
            placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <Pressable onPress={saveInPersonSignature} disabled={signBusy || !signData || !signName.trim()}
          className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
          {signBusy ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{t.leases.signSubmitBtn}</Text>}
        </Pressable>
      </View>
    ));
  }

  function renderSignatureViewSheet() {
    return sheetShell(!!signatureView, () => setSignatureView(null), t.leases.signHeading, (
      <View className="items-center gap-2 pb-2">
        {signatureView?.tenant_signature ? (
          <Image source={{ uri: signatureView.tenant_signature }}
            style={{ width: '100%', height: 140 }} resizeMode="contain" />
        ) : null}
        {signatureView?.tenant_signed_at ? (
          <Text className="text-xs text-muted text-center">
            {t.leases.signedBy
              .replace('{{name}}', signatureView.tenant_signer_name ?? '')
              .replace('{{date}}', formatDateTimeLong(signatureView.tenant_signed_at, dateLoc))}
          </Text>
        ) : null}
      </View>
    ));
  }

  function renderDepositSheet() {
    return sheetShell(!!depositLease, () => setDepositLease(null), t.leases.returnDepositTitle, (
      <View className="gap-3.5 pb-2">
        <DatePicker label={t.leases.returnDateLabel} value={depositDate} onChange={setDepositDate} />
        <View>
          <Text className={labelCls}>{t.leases.depositWithheldLabel}</Text>
          {moneyInput(depositWithheld, setDepositWithheld)}
        </View>
        <View>
          <Text className={labelCls}>{t.leases.depositNoteLabel}</Text>
          <TextInput value={depositNote} onChangeText={setDepositNote}
            placeholder={t.leases.depositNotePlaceholder} placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <Pressable onPress={saveDepositReturn} disabled={depositBusy || !depositDate}
          className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
          {depositBusy ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{tc.buttons.save}</Text>}
        </Pressable>
      </View>
    ));
  }

  function renderAddChargeSheet() {
    return sheetShell(!!addChargeLease, () => setAddChargeLease(null), t.ledger.addChargeTitle, (
      <View className="gap-3.5 pb-2">
        <View>
          <Text className={labelCls}>{t.ledger.chargeKindLabel}</Text>
          <View className="flex-row gap-2">
            {(['other', 'late_fee'] as const).map(k => (
              <Pressable key={k} onPress={() => setNewChargeKind(k)}
                className={`px-3.5 py-2 rounded-full border ${newChargeKind === k ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                <Text className={`text-xs font-medium ${newChargeKind === k ? 'text-white' : 'text-ink'}`}>
                  {k === 'late_fee' ? t.ledger.kindLateFee : t.ledger.kindOther}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View>
          <Text className={labelCls}>{t.ledger.chargeAmountLabel}</Text>
          {moneyInput(newChargeAmount, setNewChargeAmount)}
        </View>
        <DatePicker label={t.ledger.chargeDueLabel} value={newChargeDue} onChange={setNewChargeDue} />
        <View>
          <Text className={labelCls}>{t.ledger.chargeNoteLabel}</Text>
          <TextInput value={newChargeNote} onChangeText={setNewChargeNote}
            placeholder={t.ledger.chargeNotePlaceholder} placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <Pressable onPress={saveNewCharge} disabled={addChargeBusy || !Number(newChargeAmount) || !newChargeDue}
          className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
          {addChargeBusy ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{tc.buttons.save}</Text>}
        </Pressable>
      </View>
    ));
  }

  function renderExpenseSheet() {
    return sheetShell(
      expenseFormOpen,
      () => setExpenseFormOpen(false),
      editingExpense ? t.expenses.editTitle : t.expenses.addBtn,
      (
        <View className="gap-3.5 pb-2">
          <DatePicker label={t.expenses.form.dateLabel} value={expenseForm.expense_date}
            onChange={v => setExpenseForm(f => ({ ...f, expense_date: v }))} />
          <View>
            <Text className={labelCls}>{t.expenses.form.amountLabel}</Text>
            {moneyInput(expenseForm.amount, v => setExpenseForm(f => ({ ...f, amount: v })))}
          </View>
          <View>
            <Text className={labelCls}>{t.expenses.form.categoryLabel}</Text>
            <View className="flex-row flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map(k => (
                <Pressable key={k} onPress={() => setExpenseForm(f => ({ ...f, category: k }))}
                  className={`px-3 py-1.5 rounded-full border ${expenseForm.category === k ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                  <Text className={`text-xs font-medium ${expenseForm.category === k ? 'text-white' : 'text-ink'}`}>
                    {t.expenses.categories[k]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View>
            <Text className={labelCls}>{t.expenses.form.vendorLabel}</Text>
            <TextInput value={expenseForm.vendor} onChangeText={v => setExpenseForm(f => ({ ...f, vendor: v }))}
              placeholder={t.expenses.form.vendorPlaceholder} placeholderTextColor={c.faint} className={fieldCls} />
          </View>
          <View>
            <Text className={labelCls}>{t.expenses.form.noteLabel}</Text>
            <TextInput value={expenseForm.note} onChangeText={v => setExpenseForm(f => ({ ...f, note: v }))}
              placeholderTextColor={c.faint} className={fieldCls} />
          </View>
          <View>
            <Text className={labelCls}>{t.expenses.form.receiptLabel}</Text>
            {receiptUri || (editingExpense?.receipt_path && !receiptRemoved) ? (
              <View className="flex-row items-center gap-3">
                {receiptUri ? <Image source={{ uri: receiptUri }} style={{ width: 56, height: 56, borderRadius: 8 }} /> : <Camera size={20} color={c.muted} />}
                <Pressable onPress={() => setReceiptChooserOpen(true)} className="active:opacity-60">
                  <Text className="text-sm text-primary font-semibold">{t.expenses.form.changeReceipt}</Text>
                </Pressable>
                <Pressable onPress={() => { setReceiptUri(null); setReceiptRemoved(true); }} className="active:opacity-60">
                  <Text className="text-sm text-red-600 font-semibold">{t.expenses.form.removeReceipt}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setReceiptChooserOpen(true)}
                className="flex-row items-center gap-2 bg-border-soft rounded-xl py-2.5 px-3 active:opacity-80">
                <Camera size={18} color={c.muted} />
                <Text className="text-sm text-muted font-medium">{t.expenses.form.addReceipt}</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={saveExpense} disabled={savingExpense || !Number(expenseForm.amount)}
            className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
            {savingExpense ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{tc.buttons.save}</Text>}
          </Pressable>
        </View>
      ),
      chooserOverlay(receiptChooserOpen, () => setReceiptChooserOpen(false), pickReceipt),
    );
  }

  function renderMaintSheet() {
    return sheetShell(maintFormOpen, () => setMaintFormOpen(false), editingMaint ? t.maintenance.editTitle : t.maintenance.addBtn, (
      <View className="gap-3.5 pb-2">
        <View>
          <Text className={labelCls}>{t.maintenance.form.titleLabel}</Text>
          <TextInput value={maintForm.title} onChangeText={v => setMaintForm(f => ({ ...f, title: v }))}
            placeholder={t.maintenance.form.titlePlaceholder} placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <View>
          <Text className={labelCls}>{t.maintenance.form.descriptionLabel}</Text>
          <TextInput value={maintForm.description} onChangeText={v => setMaintForm(f => ({ ...f, description: v }))}
            multiline numberOfLines={2} textAlignVertical="top"
            placeholderTextColor={c.faint} className={`${fieldCls} min-h-[56px]`} />
        </View>
        <Select label={t.maintenance.form.statusLabel} value={maintForm.status}
          onValueChange={v => setMaintForm(f => ({ ...f, status: v as MaintenanceStatus }))}
          options={[
            { value: 'open', label: t.maintenance.statusOpen },
            { value: 'in_progress', label: t.maintenance.statusInProgress },
            { value: 'done', label: t.maintenance.statusDone },
          ]} />
        <DatePicker label={t.maintenance.form.reportedLabel} value={maintForm.reported_on}
          onChange={v => setMaintForm(f => ({ ...f, reported_on: v }))} />
        <DatePicker label={t.maintenance.form.completedLabel} value={maintForm.completed_on}
          onChange={v => setMaintForm(f => ({ ...f, completed_on: v }))} />
        <View>
          <Text className={labelCls}>{t.maintenance.form.costLabel}</Text>
          {moneyInput(maintForm.cost, v => setMaintForm(f => ({ ...f, cost: v })))}
        </View>
        <View>
          <Text className={labelCls}>{t.maintenance.form.fixedByLabel}</Text>
          <TextInput value={maintForm.fixed_by} onChangeText={v => setMaintForm(f => ({ ...f, fixed_by: v }))}
            placeholder={t.maintenance.form.fixedByPlaceholder} placeholderTextColor={c.faint} className={fieldCls} />
        </View>
        <Select label={t.maintenance.form.employeeLabel} value={maintForm.employee_id}
          onValueChange={v => setMaintForm(f => ({ ...f, employee_id: v }))}
          options={[
            { value: '', label: '—' },
            ...employees.filter(e => e.active || e.id === maintForm.employee_id)
              .map(e => ({ value: e.id, label: `${e.first_name} ${e.last_name}` })),
          ]} />
        <Pressable onPress={() => setMaintForm(f => ({ ...f, createExpense: !f.createExpense }))}
          className="flex-row items-center justify-between bg-surface rounded-xl px-3.5 py-3 active:opacity-80">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-medium text-ink">{t.maintenance.createExpenseToggle}</Text>
            <Text className="text-xs text-muted mt-0.5">{t.maintenance.createExpenseHint}</Text>
          </View>
          <View className={`w-11 h-6 rounded-full ${maintForm.createExpense ? 'bg-primary' : 'bg-border'}`}>
            <View className="w-4 h-4 rounded-full bg-white absolute top-1"
              style={{ transform: [{ translateX: maintForm.createExpense ? 24 : 4 }] }} />
          </View>
        </Pressable>
        <Pressable onPress={saveMaint} disabled={savingMaint || !maintForm.title.trim()}
          className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
          {savingMaint ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{tc.buttons.save}</Text>}
        </Pressable>
      </View>
    ));
  }
}
