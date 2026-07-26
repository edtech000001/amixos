'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { fetchJobsPage, fetchJobTabCounts, fetchJobGroupIndex, fetchAllJobsInGroup, LAZY_GROUP_DIMS, type JobsCursor, type JobsQueryParams, type JobGroup } from '@amixos/shared/lib/jobsQuery';
import { usStateName } from '@amixos/shared/lib/usStates';
import {
  JobsListScreen,
  type JobListItem,
} from '@amixos/shared/screens/dashboard/JobsListScreen';
import { can } from '@amixos/shared/lib/permissions';
import { normalizeJobAlertThresholds } from '@amixos/shared/lib/jobAlerts';
import { logAudit } from '@amixos/shared/lib/audit';
import { createInvoicesFromJobs } from '@amixos/shared/lib/invoicing';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { useLang } from '@/i18n/LangProvider';
import { useScrollRestore, saveScrollAnchor } from '@/lib/useScrollRestore';
import ImportModal from '@/components/dashboard/ImportModal';

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
  job_assignments: { worker_name: string | null; is_lead: boolean | null }[];
}

// worker_name is denormalized on the assignment (set at assign time on web,
// mobile, and import), so the list reads it directly — no employees join. This
// avoids a per-assignment RLS-triggering nested join that made the list time
// out once a business had thousands of jobs.
function assignmentName(a: { worker_name: string | null }): string | null {
  return a.worker_name;
}

const TAB_KEYS = ['all', 'propuestas', 'posible', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled', 'delegated'] as const;
type TabKey = typeof TAB_KEYS[number];

export default function TrabajosPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { t: full, locale } = useLang();
  const { business, businesses, currentRole, activeLocationId } = useApp();
  // Server-side pagination: rawJobs holds the loaded page(s), not the full table.
  const [rawJobs, setRawJobs] = useState<RawJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialTab, setInitialTab] = useState<TabKey>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [jobTemplates, setJobTemplates] = useState<{ field_key: string; field_label: string; field_type?: string; field_options?: string[] | null }[]>([]);

  // Coming back from a job detail lands at the top otherwise — restore the
  // list scroll position once the rows have rendered.
  useScrollRestore('jobs-list', !loading);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get('tab');
      if (urlTab && TAB_KEYS.includes(urlTab as TabKey)) setInitialTab(urlTab as TabKey);
      // Opened from Ajustes → Trabajos "Importar trabajos". Strip the param so
      // a reload / back-nav doesn't re-open the wizard.
      if (params.get('import') === '1') {
        setImportOpen(true);
        params.delete('import');
        const qs = params.toString();
        window.history.replaceState(null, '', `/dashboard/trabajos${qs ? `?${qs}` : ''}`);
      }
    }
  }, []);

  useEffect(() => {
    if (!business) return;
    supabase.from('job_field_templates')
      .select('field_key, field_label, field_label_es, field_label_en, field_type, field_options')
      .eq('business_id', business.id)
      .order('sort_order')
      .then(({ data }: { data: { field_key: string; field_label: string; field_label_es?: string | null; field_label_en?: string | null; field_type?: string; field_options?: string[] | null }[] | null }) => setJobTemplates(localizeTemplates(data ?? [], locale)));
  }, [business, locale]);

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
  // The list no longer loads all jobs — JobsListScreen reports its search/tab
  // filters via onFiltersChange, we fetch one page (newest-first, keyset), and
  // load more as the user scrolls. Counts come from the DB, not the array.
  const [serverCounts, setServerCounts] = useState<Record<string, number>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<JobsCursor | null>(null);
  const paramsRef = useRef<JobsQueryParams | null>(null);
  // Whether the current view needs the FULL matching set (advanced sort/group,
  // which can't be done correctly on a single page) vs. paginated browsing.
  const loadAllRef = useRef(false);
  // Lazy group-by (Phase 2b): 'group' mode loads the group index then each
  // group's jobs on demand as the user scrolls to the bottom.
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
    try {
      const countsP = fetchJobTabCounts(supabase, { businessId: params.businessId, locationId: params.locationId, search: params.search }, [...TAB_KEYS, 'archived']);
      if (loadAll) {
        // Load every matching row (in big pages) so sort/group is complete. Fast
        // when a tab/search narrows the set; a full unfiltered group loads all.
        const acc: RawJob[] = [];
        let cursor: JobsCursor | null = null;
        for (let i = 0; i < 200; i++) {
          const page = await fetchJobsPage<RawJob>(supabase, JOB_LIST_SELECT, { ...params, cursor, pageSize: 1000 });
          acc.push(...page.jobs);
          if (seq === loadSeqRef.current) setRawJobs([...acc]); // progressive
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }
        const counts = await countsP;
        if (seq !== loadSeqRef.current) return;
        setServerCounts(counts);
      } else {
        const [page, counts] = await Promise.all([
          fetchJobsPage<RawJob>(supabase, JOB_LIST_SELECT, { ...params, pageSize: 50 }),
          countsP,
        ]);
        if (seq !== loadSeqRef.current) return;
        setRawJobs(page.jobs);
        cursorRef.current = page.nextCursor;
        setHasMore(!!page.nextCursor);
        setServerCounts(counts);
      }
    } catch (e) {
      console.error('Jobs query failed', e);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  // Order the group index to match groupJobs' display order (alphabetical by the
  // shown label, the "no value" bucket last) so groups load top-to-bottom and
  // new ones append at the end instead of inserting mid-list.
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
    } catch (e) {
      console.error('Group load failed', e);
    } finally {
      setLoadingMore(false);
    }
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
    } catch (e) {
      console.error('Jobs load-more failed', e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Lazy group-by: fetch the group index, then the first group (more load on
  // scroll). Falls back to load-all + client grouping when the index can't be
  // built (multi-tab / delegated).
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
        fetchJobTabCounts(supabase, { businessId: params.businessId, locationId: params.locationId, search: params.search }, [...TAB_KEYS, 'archived']),
      ]);
      if (seq !== loadSeqRef.current) return;
      setServerCounts(counts);
      if (index === null) { await runQuery(params, true); return; }
      groupIndexRef.current = orderGroups(index, groupBy);
      loadedGroupsRef.current = 0;
      setRawJobs([]);
      await loadNextGroup();
    } catch (e) {
      console.error('Group index failed', e);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  // Re-run the current view — after a mutation, or when the branch changes.
  const reRun = (locationId: string | null) => {
    if (!paramsRef.current) return;
    const p = { ...paramsRef.current, locationId };
    if (modeRef.current === 'group') void runGroupLazy(p, groupByRef.current);
    else void runQuery(p, loadAllRef.current);
  };
  const reload = () => reRun(activeLocationId ?? null);
  useEffect(() => {
    reRun(activeLocationId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocationId]);

  const handleFiltersChange = (f: { search: string; tabs: string[]; sortBy: string; groupBy: string; dateFrom: string | null; dateTo: string | null }) => {
    if (!business) return;
    const params = { businessId: business.id, locationId: activeLocationId ?? null, tabs: f.tabs, search: f.search, dateFrom: f.dateFrom, dateTo: f.dateTo };
    if (f.groupBy !== 'none' && LAZY_GROUP_DIMS.includes(f.groupBy)) {
      void runGroupLazy(params, f.groupBy);
    } else {
      // lead/company grouping or advanced sort → load all matching + client group.
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
    await supabase.from('jobs').update(update).eq('id', id);
    setRawJobs(prev => prev.map(j => j.id === id ? { ...j, ...update } : j));
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
    <>
    {business && (
      <ImportModal
        open={importOpen}
        mode="jobs"
        businessId={business.id}
        supabase={supabase}
        templates={jobTemplates}
        onClose={() => setImportOpen(false)}
        onDone={reload}
      />
    )}
    <JobsListScreen
      loading={loading}
      jobs={jobs}
      initialTab={initialTab}
      onJobPress={(id) => { saveScrollAnchor('jobs-list', id); router.push(`/dashboard/trabajos/${id}`); }}
      onUpdateStatus={updateStatus}
      onGenerateInvoice={(id) => { saveScrollAnchor('jobs-list', id); router.push(`/dashboard/trabajos/${id}?action=invoice`); }}
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
          // One client → open the invoice; multiple → land on the list (one
          // invoice was created per client; the user already confirmed).
          if (res.invoices.length === 1) {
            router.push(`/dashboard/facturas/${res.invoices[0].id}`);
          } else {
            router.push('/dashboard/facturas');
          }
        }
      }}
      onBulkDelete={
        can.deleteJob(currentRole)
          ? async (jobIds) => {
              if (!business) return;
              const msg = full.dashboard.jobs.confirmDeleteBulk.replace('{{count}}', String(jobIds.length));
              if (!(await confirm({ message: msg, destructive: true }))) return;
              // FK cascades clean job_items / job_assignments / job_photos
              // (whose delete trigger also removes the storage files).
              for (let i = 0; i < jobIds.length; i += 50) {
                await supabase.from('jobs').delete().in('id', jobIds.slice(i, i + 50));
              }
              void logAudit(supabase, business.id, 'job.deleted', 'job', null, { count: jobIds.length, bulk: true });
              reload();
            }
          : undefined
      }
      onBulkArchive={async (jobIds, archive) => {
        if (!business) return;
        if (archive) {
          const msg = full.dashboard.jobs.confirmArchiveBulk.replace('{{count}}', String(jobIds.length));
          if (!(await confirm({ message: msg }))) return;
        }
        for (let i = 0; i < jobIds.length; i += 50) {
          await supabase.from('jobs')
            .update({ archived_at: archive ? new Date().toISOString() : null })
            .in('id', jobIds.slice(i, i + 50));
        }
        void logAudit(supabase, business.id, archive ? 'job.archived' : 'job.unarchived', 'job', null, { count: jobIds.length, bulk: true });
        reload();
      }}
      onViewInvoice={(invoiceId) => router.push(`/dashboard/facturas/${invoiceId}`)}
      onNewJob={() => router.push('/dashboard/trabajos/nuevo')}
      onNewProposal={() => router.push('/dashboard/trabajos/nuevo?modo=propuesta')}
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
    </>
  );
}
