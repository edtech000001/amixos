import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, Pressable, TextInput, ScrollView, Modal as RNModal } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { loadCached } from '@/lib/offline/cache';
import { queuedUpdate } from '@/lib/offline/mutate';
import { useApp } from '@/lib/AppContext';
import { LocationSwitcher } from '@/components/LocationSwitcher';
import {
  JobsListScreen,
  type JobListItem,
} from '@amixos/shared/screens/dashboard/JobsListScreen';
import { fetchJobsPage, fetchJobTabCounts, fetchJobGroupIndex, fetchAllJobsInGroup, LAZY_GROUP_DIMS, type JobsCursor, type JobsQueryParams, type JobGroup } from '@amixos/shared/lib/jobsQuery';
import { usStateName } from '@amixos/shared/lib/usStates';
import { can } from '@amixos/shared/lib/permissions';
import { normalizeJobAlertThresholds } from '@amixos/shared/lib/jobAlerts';
import { logAudit } from '@amixos/shared/lib/audit';
import { createInvoicesFromJobs } from '@amixos/shared/lib/invoicing';
import { useLang } from '@/lib/i18n/LangProvider';

interface RawJob {
  id: string;
  client_id: string | null;
  invoice_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  job_address: string | null;
  job_city: string | null;
  job_state: string | null;
  scheduled_date: string | null;
  time_start: string | null;
  end_date: string | null;
  estimated_hours: number | null;
  time_end: string | null;
  total_amount: number;
  estimate_number: string | null;
  external_ref?: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  delegated_to_business_id: string | null;
  delegated_from_business_id: string | null;
  published_to_crew: boolean;
  archived_at?: string | null;
  created_at: string;
  clients: { first_name: string; last_name: string; company: string | null } | null;
  job_assignments: {
    worker_name: string | null;
    is_lead: boolean | null;
  }[];
}

// worker_name is denormalized on the assignment, so the list reads it directly
// — no employees join. Avoids a per-assignment RLS-triggering nested join that
// made the list time out once a business had thousands of jobs.
function assignmentName(a: { worker_name: string | null }): string | null {
  return a.worker_name;
}

export default function TrabajosTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { t: full, locale } = useLang();
  const { business, businesses, currentRole, activeLocationId } = useApp();
  const [rawJobs, setRawJobs] = useState<RawJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Only the columns the list actually renders/searches — `*` was hauling
  // notes, custom fields, and every timestamp for hundreds of rows.
  const JOB_LIST_SELECT = `
    id, client_id, invoice_id, title, description, status, priority,
    job_address, job_city, job_state, scheduled_date, time_start, end_date,
    estimated_hours, time_end, total_amount, estimate_number, external_ref, issue_date,
    expiry_date, delegated_to_business_id, delegated_from_business_id,
    published_to_crew, created_at, archived_at,
    clients(first_name, last_name, company),
    job_assignments(worker_name, is_lead)
  `;

  // Guards against a stale slow load overwriting a newer one (e.g. branch switch).
  const loadSeqRef = useRef(0);
  // ── Server-side pagination (Phase 1) ──────────────────────────────────────
  // JobsListScreen reports its search/tab/date filters via onFiltersChange; we
  // fetch one page (newest-first, keyset), load more on scroll, and read counts
  // from the DB. loadCached serves the last page + counts offline.
  const COUNT_TABS = ['all', 'propuestas', 'posible', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled', 'delegated', 'archived'];
  const [serverCounts, setServerCounts] = useState<Record<string, number>>({});
  const [moveClientIds, setMoveClientIds] = useState<string[] | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<{ id: string; name: string }[]>([]);
  const [movingClient, setMovingClient] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<JobsCursor | null>(null);
  const paramsRef = useRef<JobsQueryParams | null>(null);
  // Whether the current view needs the FULL matching set (advanced sort/group).
  const loadAllRef = useRef(false);
  // Lazy group-by (Phase 2b): 'group' mode loads the group index then each
  // group's jobs on demand as the list reaches the bottom.
  const modeRef = useRef<'page' | 'all' | 'group'>('page');
  const groupIndexRef = useRef<JobGroup[]>([]);
  const loadedGroupsRef = useRef(0);
  const groupByRef = useRef<string>('none');

  const runQuery = async (params: JobsQueryParams, loadAll = false) => {
    const seq = ++loadSeqRef.current;
    paramsRef.current = params;
    loadAllRef.current = loadAll;
    modeRef.current = loadAll ? 'all' : 'page';
    setLoading(true);
    cursorRef.current = null;
    setHasMore(false);
    const cacheKey = `jobs_list_${params.businessId}_${params.locationId ?? 'all'}`;
    const res = await loadCached<{ jobs: RawJob[]; nextCursor: JobsCursor | null; counts: Record<string, number> }>(cacheKey, async () => {
      const countsP = fetchJobTabCounts(supabase, { businessId: params.businessId, locationId: params.locationId, search: params.search }, COUNT_TABS);
      if (loadAll) {
        // Load every matching row so sort/group is complete (fast when filtered).
        const acc: RawJob[] = [];
        let cursor: JobsCursor | null = null;
        for (let i = 0; i < 200; i++) {
          const page = await fetchJobsPage<RawJob>(supabase, JOB_LIST_SELECT, { ...params, cursor, pageSize: 1000 });
          acc.push(...page.jobs);
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }
        return { jobs: acc, nextCursor: null, counts: await countsP };
      }
      const [page, counts] = await Promise.all([
        fetchJobsPage<RawJob>(supabase, JOB_LIST_SELECT, { ...params, pageSize: 50 }),
        countsP,
      ]);
      return { jobs: page.jobs, nextCursor: page.nextCursor, counts };
    });
    if (seq !== loadSeqRef.current) return;
    const d = res.data;
    setRawJobs(d?.jobs ?? []);
    // Offline (served from cache) → no further pages to page through.
    cursorRef.current = res.fromCache ? null : (d?.nextCursor ?? null);
    setHasMore(!res.fromCache && !!d?.nextCursor);
    setServerCounts(d?.counts ?? {});
    setLoading(false);
  };

  // Order the group index to match groupJobs (alphabetical by displayed label,
  // empty bucket last) so groups load top-to-bottom.
  const orderGroups = (index: JobGroup[], groupBy: string): JobGroup[] => {
    const labelOf = (g: JobGroup) => (groupBy === 'state' ? usStateName(g.key, locale) : g.label);
    return index.slice().sort((a, b) => {
      const ae = a.key === '', be = b.key === '';
      if (ae !== be) return ae ? 1 : -1;
      return labelOf(a).localeCompare(labelOf(b));
    });
  };

  const loadNextGroup = async () => {
    const seq = loadSeqRef.current;
    const idx = loadedGroupsRef.current;
    const grp = groupIndexRef.current[idx];
    if (!grp || !paramsRef.current) { setHasMore(false); return; }
    setLoadingMore(true);
    try {
      const groupJobsData = await fetchAllJobsInGroup<RawJob>(supabase, JOB_LIST_SELECT, { ...paramsRef.current, groupBy: groupByRef.current, groupKey: grp.key });
      if (seq !== loadSeqRef.current) return;
      setRawJobs(prev => [...prev, ...groupJobsData]);
      loadedGroupsRef.current = idx + 1;
      setHasMore(loadedGroupsRef.current < groupIndexRef.current.length);
    } catch { /* offline / error — keep what's loaded */ }
    finally { setLoadingMore(false); }
  };

  const loadMore = async () => {
    if (loadingMore || !paramsRef.current) return;
    if (modeRef.current === 'group') { void loadNextGroup(); return; }
    if (!cursorRef.current) return;
    const seq = loadSeqRef.current;
    setLoadingMore(true);
    try {
      const page = await fetchJobsPage<RawJob>(supabase, JOB_LIST_SELECT, { ...paramsRef.current, cursor: cursorRef.current, pageSize: 50 });
      if (seq !== loadSeqRef.current) return;
      setRawJobs(prev => [...prev, ...page.jobs]);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
    } catch { /* offline / error — keep what's loaded */ }
    finally { setLoadingMore(false); }
  };

  // Lazy group-by: fetch the group index, then the first group (more on scroll).
  // Falls back to load-all + client grouping when the index can't be built.
  const runGroupLazy = async (params: JobsQueryParams, groupBy: string) => {
    const seq = ++loadSeqRef.current;
    paramsRef.current = params;
    groupByRef.current = groupBy;
    modeRef.current = 'group';
    loadAllRef.current = false;
    setLoading(true); setHasMore(false); cursorRef.current = null;
    try {
      const [index, counts] = await Promise.all([
        fetchJobGroupIndex(supabase, { businessId: params.businessId, groupBy, tabs: params.tabs, search: params.search, locationId: params.locationId, dateFrom: params.dateFrom, dateTo: params.dateTo }),
        fetchJobTabCounts(supabase, { businessId: params.businessId, locationId: params.locationId, search: params.search }, COUNT_TABS),
      ]);
      if (seq !== loadSeqRef.current) return;
      setServerCounts(counts);
      if (index === null) { await runQuery(params, true); return; }
      groupIndexRef.current = orderGroups(index, groupBy);
      loadedGroupsRef.current = 0;
      setRawJobs([]);
      await loadNextGroup();
    } catch { /* offline / error */ }
    finally { if (seq === loadSeqRef.current) setLoading(false); }
  };

  const reRun = (locationId: string | null) => {
    if (!paramsRef.current) return;
    const p = { ...paramsRef.current, locationId };
    if (modeRef.current === 'group') void runGroupLazy(p, groupByRef.current);
    else void runQuery(p, loadAllRef.current);
  };
  const reload = () => reRun(activeLocationId ?? null);

  // Bulk "move to client" — search clients + reassign the selected jobs.
  const loadMoveClients = async (term: string) => {
    if (!business) return;
    let q = supabase.from('clients').select('id, first_name, last_name, company').eq('business_id', business.id);
    const s = term.trim().replace(/[,()*]/g, ' ').trim();
    if (s) q = q.or(`first_name.ilike.*${s}*,last_name.ilike.*${s}*,company.ilike.*${s}*`);
    const { data } = await q.order('last_name').limit(30);
    setClientResults(((data ?? []) as { id: string; first_name: string | null; last_name: string | null; company: string | null }[])
      .map(c => ({ id: c.id, name: (c.company || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()) || '—' })));
  };
  useEffect(() => {
    if (moveClientIds === null) return;
    const h = setTimeout(() => { void loadMoveClients(clientSearch); }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSearch, moveClientIds]);
  const doMoveClient = async (clientId: string) => {
    if (!moveClientIds?.length || !business) return;
    setMovingClient(true);
    for (let i = 0; i < moveClientIds.length; i += 50) {
      await supabase.from('jobs').update({ client_id: clientId }).in('id', moveClientIds.slice(i, i + 50));
    }
    void logAudit(supabase, business.id, 'job.updated', 'job', null, { count: moveClientIds.length, bulk: true, field: 'client_id' });
    setMovingClient(false);
    setMoveClientIds(null);
    reload();
  };
  // Re-query on branch change (location isn't part of the child's filters).
  useEffect(() => {
    reRun(activeLocationId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocationId]);
  // Refresh the current query when returning from create/edit.
  useFocusEffect(useCallback(() => { reload(); }, [activeLocationId]));

  const handleFiltersChange = (f: { search: string; tabs: string[]; sortBy: string; groupBy: string; dateFrom: string | null; dateTo: string | null }) => {
    if (!business) return;
    const params = { businessId: business.id, locationId: activeLocationId ?? null, tabs: f.tabs, search: f.search, dateFrom: f.dateFrom, dateTo: f.dateTo };
    if (f.groupBy !== 'none' && LAZY_GROUP_DIMS.includes(f.groupBy)) {
      void runGroupLazy(params, f.groupBy);
    } else {
      const needsAll = f.sortBy !== 'recent' || f.groupBy !== 'none';
      void runQuery(params, needsAll);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const update: any = { status };
    if (status === 'completed') update.completed_date = new Date().toISOString().split('T')[0];
    if (status === 'sent') update.sent_at = new Date().toISOString();
    if (status === 'accepted') update.accepted_at = new Date().toISOString();
    if (status === 'declined') update.declined_at = new Date().toISOString();
    const title = rawJobs.find(j => j.id === id)?.title ?? '';
    try {
      await queuedUpdate({ table: 'jobs', match: { id }, payload: update, businessId: business?.id ?? null, label: `${status}: ${title}` });
    } catch {
      return; // real DB rejection — leave the row unchanged
    }
    setRawJobs(prev => prev.map(j => (j.id === id ? { ...j, ...update } : j)));
  };

  const jobs: JobListItem[] = useMemo(() => rawJobs.map(j => ({
    id: j.id,
    title: j.title,
    status: j.status,
    priority: j.priority,
    estimateNumber: j.estimate_number,
    externalRef: j.external_ref ?? null,
    totalAmount: j.total_amount,
    scheduledDate: j.scheduled_date,
    timeStart: j.time_start,
    endDate: j.end_date,
    estimatedHours: j.estimated_hours,
    timeEnd: j.time_end,
    issueDate: j.issue_date,
    expiryDate: j.expiry_date,
    jobAddress: j.job_address,
    jobCity: j.job_city,
    jobState: j.job_state,
    invoiceId: j.invoice_id,
    clientId: j.client_id,
    clientName: j.clients ? `${j.clients.first_name} ${j.clients.last_name}` : null,
    clientCompany: j.clients?.company ?? null,
    workerNames: j.job_assignments
      .map(assignmentName)
      .filter((s): s is string => !!s),
    leadName: assignmentName(
      j.job_assignments.find(a => a.is_lead) ?? { worker_name: null },
    ),
    delegatedToBusinessName: j.delegated_to_business_id
      ? businesses.find(b => b.id === j.delegated_to_business_id)?.name ?? null
      : null,
    delegatedFromBusinessName: j.delegated_from_business_id
      ? businesses.find(b => b.id === j.delegated_from_business_id)?.name ?? null
      : null,
    publishedToCrew: j.published_to_crew,
    archivedAt: j.archived_at ?? null,
  })), [rawJobs, businesses]);

  const alertThresholds = useMemo(
    () => normalizeJobAlertThresholds(business?.job_alert_thresholds),
    [business?.job_alert_thresholds],
  );

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top }}>
      <LocationSwitcher />
      <JobsListScreen
        loading={loading}
        jobs={jobs}
        onJobPress={(id) => router.push(`/dashboard/trabajos/${id}` as never)}
        onUpdateStatus={updateStatus}
        onGenerateInvoice={(id) => router.push(`/dashboard/trabajos/${id}` as never)}
        onCreateInvoice={async (jobIds) => {
          if (!business) return;
          const jt = full.dashboard.jobs.new;
          const res = await createInvoicesFromJobs(supabase, {
            businessId: business.id,
            jobIds,
            invoiceTemplate: business.invoice_template,
            startNumber: business.invoice_start_number,
            hideItemTypes: business.job_item_types_enabled === false,
            taxRate: business.invoice_tax_rate ?? 0,
            qtyField: business.invoice_qty_field,
            itemTypeLabels: {
              labor: jt.itemTypeLabor,
              material: jt.itemTypeMaterial,
              equipment: jt.itemTypeEquipment,
              other: jt.itemTypeOther,
            },
            notesLabel: full.dashboard.sidebar.trabajos,
          });
          if (res.ok) {
            // Multiple invoices are confirmed upfront in the list screen, so
            // just route: to the invoice (single) or the list (per-client).
            if (res.invoices.length === 1) {
              router.push(`/dashboard/facturas/${res.invoices[0].id}` as never);
            } else {
              router.push('/dashboard/facturas' as never);
            }
          }
        }}
        onBulkDelete={
          can.deleteJob(currentRole)
            ? (jobIds) =>
                new Promise<void>(resolve => {
                  if (!business) return resolve();
                  const msg = full.dashboard.jobs.confirmDeleteBulk.replace('{{count}}', String(jobIds.length));
                  Alert.alert('', msg, [
                    { text: full.common.buttons.cancel, style: 'cancel', onPress: () => resolve() },
                    {
                      text: full.dashboard.jobs.bulkDelete,
                      style: 'destructive',
                      onPress: async () => {
                        // FK cascades clean job_items / job_assignments /
                        // job_photos (whose trigger removes the storage files).
                        for (let i = 0; i < jobIds.length; i += 50) {
                          await supabase.from('jobs').delete().in('id', jobIds.slice(i, i + 50));
                        }
                        void logAudit(supabase, business.id, 'job.deleted', 'job', null, { count: jobIds.length, bulk: true });
                        reload();
                        resolve();
                      },
                    },
                  ]);
                })
            : undefined
        }
        onBulkArchive={(jobIds, archive) =>
          new Promise<void>(resolve => {
            if (!business) return resolve();
            const doIt = async () => {
              for (let i = 0; i < jobIds.length; i += 50) {
                await supabase.from('jobs')
                  .update({ archived_at: archive ? new Date().toISOString() : null })
                  .in('id', jobIds.slice(i, i + 50));
              }
              void logAudit(supabase, business.id, archive ? 'job.archived' : 'job.unarchived', 'job', null, { count: jobIds.length, bulk: true });
              reload();
              resolve();
            };
            if (!archive) { void doIt(); return; }
            const msg = full.dashboard.jobs.confirmArchiveBulk.replace('{{count}}', String(jobIds.length));
            Alert.alert('', msg, [
              { text: full.common.buttons.cancel, style: 'cancel', onPress: () => resolve() },
              { text: full.dashboard.jobs.bulkArchive, onPress: () => void doIt() },
            ]);
          })
        }
        onBulkChangeClient={can.editJobMetadata(currentRole) ? (ids => { setMoveClientIds(ids); setClientSearch(''); void loadMoveClients(''); }) : undefined}
        onViewInvoice={(invoiceId) => router.push(`/dashboard/facturas/${invoiceId}`)}
        onNewJob={() => router.push('/dashboard/trabajos/nuevo' as never)}
        onNewProposal={() => router.push('/dashboard/trabajos/nuevo?modo=propuesta' as never)}
        canCreate={can.createJob(currentRole)}
        canCreateInvoice={can.createInvoice(currentRole)}
        canViewInvoice={can.seeInvoices(currentRole)}
        canCreateEstimates={can.createEstimate(currentRole)}
        alertThresholds={alertThresholds}
        businessId={business?.id}
        serverMode
        serverCounts={serverCounts}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        onFiltersChange={handleFiltersChange}
      />

      {/* Bulk move-to-client picker */}
      <RNModal visible={moveClientIds !== null} transparent animationType="slide" onRequestClose={() => setMoveClientIds(null)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setMoveClientIds(null)}>
          <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-8" onPress={() => {}}>
            <Text className="text-lg font-bold text-ink mb-3">
              {locale === 'es' ? `Mover ${moveClientIds?.length ?? 0} trabajo(s) a…` : `Move ${moveClientIds?.length ?? 0} job(s) to…`}
            </Text>
            <TextInput
              value={clientSearch}
              onChangeText={setClientSearch}
              placeholder={locale === 'es' ? 'Buscar cliente…' : 'Search a client…'}
              placeholderTextColor="#6B7280"
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-ink mb-2"
            />
            <ScrollView style={{ maxHeight: 320 }}>
              {clientResults.length === 0 ? (
                <Text className="text-sm text-faint px-1 py-2">{locale === 'es' ? 'Sin resultados.' : 'No results.'}</Text>
              ) : clientResults.map(cl => (
                <Pressable key={cl.id} disabled={movingClient} onPress={() => void doMoveClient(cl.id)} className="px-3 py-3 rounded-xl active:bg-surface">
                  <Text className="text-sm text-ink">{cl.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </RNModal>
    </View>
  );
}
