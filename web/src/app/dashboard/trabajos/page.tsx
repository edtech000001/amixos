'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import {
  JobsListScreen,
  type JobListItem,
} from '@amixos/shared/screens/dashboard/JobsListScreen';
import { can } from '@amixos/shared/lib/permissions';
import { normalizeJobAlertThresholds } from '@amixos/shared/lib/jobAlerts';
import { logAudit } from '@amixos/shared/lib/audit';
import { createInvoicesFromJobs } from '@amixos/shared/lib/invoicing';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { useLang } from '@/i18n/LangProvider';
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
  job_assignments: { worker_name: string | null; is_lead: boolean | null; employees: { first_name: string; last_name: string } | null }[];
}

function assignmentName(a: { worker_name: string | null; employees: { first_name: string; last_name: string } | null }): string | null {
  return a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : a.worker_name;
}

const TAB_KEYS = ['all', 'propuestas', 'posible', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled', 'delegated'] as const;
type TabKey = typeof TAB_KEYS[number];

export default function TrabajosPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { t: full } = useLang();
  const { business, businesses, currentRole, activeLocationId } = useApp();
  const [rawJobs, setRawJobs] = useState<RawJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialTab, setInitialTab] = useState<TabKey>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [jobTemplates, setJobTemplates] = useState<{ field_key: string; field_label: string; field_type?: string; field_options?: string[] | null }[]>([]);

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
      .select('field_key, field_label, field_type, field_options')
      .eq('business_id', business.id)
      .order('sort_order')
      .then(({ data }: { data: { field_key: string; field_label: string; field_type?: string; field_options?: string[] | null }[] | null }) => setJobTemplates(data ?? []));
  }, [business]);

  // Only the columns the list actually renders/searches — `*` was hauling
  // notes, custom fields, and every timestamp for hundreds of rows.
  const JOB_LIST_SELECT = `
    id, client_id, invoice_id, title, description, status, priority,
    job_address, job_city, job_state, scheduled_date, time_start, end_date,
    estimated_hours, time_end, total_amount, estimate_number, external_ref, issue_date,
    expiry_date, delegated_to_business_id, delegated_from_business_id,
    published_to_crew, created_at, archived_at,
    clients(first_name, last_name, company),
    job_assignments(worker_name, is_lead, employees(first_name, last_name))
  `;

  // Guards against a stale slow load overwriting a newer one (e.g. branch switch).
  const loadSeqRef = useRef(0);
  const load = async () => {
    if (!business) return;
    const businessId = business.id;
    const seq = ++loadSeqRef.current;
    const baseQuery = () => {
      let q = supabase.from('jobs').select(JOB_LIST_SELECT).eq('business_id', businessId);
      // Scope to the active branch when one is selected ("All" = no filter).
      if (activeLocationId) q = q.eq('location_id', activeLocationId);
      return q;
    };

    // Fast first paint — the newest 30 in one small round-trip, so switching
    // to Jobs feels instant; the full set replaces it right after.
    if (rawJobs.length === 0) {
      const { data: first } = await baseQuery().order('created_at', { ascending: false }).limit(30);
      if (seq === loadSeqRef.current && first?.length) {
        setRawJobs(first as RawJob[]);
        setLoading(false);
      }
    }

    const data = await fetchAll<RawJob>((from, to) =>
      baseQuery().order('created_at', { ascending: false }).range(from, to),
    );
    if (seq !== loadSeqRef.current) return;
    setRawJobs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business, activeLocationId]);

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
      j.job_assignments.find(a => a.is_lead) ?? { worker_name: null, employees: null },
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
        onDone={load}
      />
    )}
    <JobsListScreen
      loading={loading}
      jobs={jobs}
      initialTab={initialTab}
      onJobPress={(id) => router.push(`/dashboard/trabajos/${id}`)}
      onUpdateStatus={updateStatus}
      onGenerateInvoice={(id) => router.push(`/dashboard/trabajos/${id}?action=invoice`)}
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
              await load();
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
        await load();
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
    />
    </>
  );
}
