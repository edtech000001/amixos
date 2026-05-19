'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  JobsListScreen,
  type JobListItem,
} from '@amixos/shared/screens/dashboard/JobsListScreen';

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
  total_amount: number;
  estimate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  delegated_to_business_id: string | null;
  delegated_from_business_id: string | null;
  created_at: string;
  clients: { first_name: string; last_name: string; company: string | null } | null;
  job_assignments: { worker_name: string | null; employees: { first_name: string; last_name: string } | null }[];
}

const TAB_KEYS = ['all', 'propuestas', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled', 'delegated'] as const;
type TabKey = typeof TAB_KEYS[number];

export default function TrabajosPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, businesses } = useApp();
  const [rawJobs, setRawJobs] = useState<RawJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialTab, setInitialTab] = useState<TabKey>('all');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab && TAB_KEYS.includes(urlTab as TabKey)) setInitialTab(urlTab as TabKey);
    }
  }, []);

  const load = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('jobs')
      .select(`
        *,
        clients(first_name, last_name, company),
        job_assignments(worker_name, employees(first_name, last_name))
      `)
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    setRawJobs((data ?? []) as RawJob[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

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
    totalAmount: j.total_amount,
    scheduledDate: j.scheduled_date,
    timeStart: j.time_start,
    issueDate: j.issue_date,
    expiryDate: j.expiry_date,
    jobAddress: j.job_address,
    jobCity: j.job_city,
    jobState: j.job_state,
    invoiceId: j.invoice_id,
    clientName: j.clients ? `${j.clients.first_name} ${j.clients.last_name}` : null,
    clientCompany: j.clients?.company ?? null,
    workerNames: j.job_assignments
      .map(a => a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : a.worker_name)
      .filter((s): s is string => !!s),
    delegatedToBusinessName: j.delegated_to_business_id
      ? businesses.find(b => b.id === j.delegated_to_business_id)?.name ?? null
      : null,
    delegatedFromBusinessName: j.delegated_from_business_id
      ? businesses.find(b => b.id === j.delegated_from_business_id)?.name ?? null
      : null,
  })), [rawJobs, businesses]);

  return (
    <JobsListScreen
      loading={loading}
      jobs={jobs}
      initialTab={initialTab}
      onJobPress={(id) => router.push(`/dashboard/trabajos/${id}`)}
      onUpdateStatus={updateStatus}
      onGenerateInvoice={(id) => router.push(`/dashboard/trabajos/${id}?action=invoice`)}
      onViewInvoice={(invoiceId) => router.push(`/dashboard/facturas/${invoiceId}`)}
      onNewJob={() => router.push('/dashboard/trabajos/nuevo')}
      onNewProposal={() => router.push('/dashboard/trabajos/nuevo?modo=propuesta')}
    />
  );
}
