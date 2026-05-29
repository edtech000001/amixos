'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, MapPin, Calendar, Users, DollarSign, FileText, Search, Link2, ChevronDown, X } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { formatProjectDuration } from '@amixos/shared/lib/duration';
import { formatTime12h } from '@amixos/shared/lib/format';
import { evaluateOperatingHours, normalizeOperatingHours } from '@amixos/shared/lib/operatingHours';

interface Client { id: string; first_name: string; last_name: string; company: string | null; job_address?: string; city?: string; state?: string; }
interface Employee { id: string; first_name: string; last_name: string; role: string; }

interface LineItem {
  id: string;
  item_type: 'labor' | 'material' | 'equipment' | 'other';
  description: string;
  quantity: number;
  unit_price: number;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const newItem = (): LineItem => ({
  id: Math.random().toString(36).slice(2), item_type: 'other',
  description: '', quantity: 1, unit_price: 0,
});

const newLaborItem = (): LineItem => ({
  id: Math.random().toString(36).slice(2), item_type: 'labor',
  description: '', quantity: 1, unit_price: 0,
});

export default function NuevoTrabajoPage() {
  return (
    <Suspense fallback={<NuevoTrabajoFallback />}>
      <NuevoTrabajoContent />
    </Suspense>
  );
}

function NuevoTrabajoFallback() {
  const { t: full } = useLang();
  return <div className="p-6">{full.common.states.loading}...</div>;
}

function NuevoTrabajoContent() {
  const { t: full } = useLang();
  const t = full.dashboard.jobs.new;
  const tc = full.common;
  const tStatuses = full.dashboard.jobs.statuses;
  const tPriorities = full.dashboard.jobs.priorities;

  const ITEM_TYPES: Record<string, string> = {
    labor: t.itemTypeLabor,
    material: t.itemTypeMaterial,
    equipment: t.itemTypeEquipment,
    other: t.itemTypeOther,
  };

  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const isProposal = searchParams.get('modo') === 'propuesta';

  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [editIsProposal, setEditIsProposal] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState<'posible' | 'scheduled' | 'in_progress'>('scheduled');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [description, setDescription] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);
  const [manualWorkers, setManualWorkers] = useState<string[]>(['']);
  const [leadEmployeeId, setLeadEmployeeId] = useState<string | null>(null);

  // Client search
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Map link
  const [mapLink, setMapLink] = useState('');

  // Proposal-only fields
  const [clientNotes, setClientNotes] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [taxRate, setTaxRate] = useState(0);
  const [discount, setDiscount] = useState(0);

  const isEditProposal = editId ? editIsProposal : isProposal;

  // Initialize default item for new jobs (not edit mode)
  useEffect(() => {
    if (!editId && items.length === 0) {
      setItems([isEditProposal ? newItem() : newLaborItem()]);
    }
  }, []);

  useEffect(() => {
    if (!business) return;
    const clientParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('client') ?? '' : '';
    if (clientParam) setClientId(clientParam);

    const loadData = async () => {
      const businessId = business.id;
      const [cl, emp] = await Promise.all([
        fetchAll<Client>((from, to) =>
          supabase.from('clients').select('id, first_name, last_name, company, address, city, state')
            .eq('business_id', businessId).order('first_name').range(from, to)),
        fetchAll<Employee>((from, to) =>
          supabase.from('employees').select('id, first_name, last_name, role')
            .eq('business_id', businessId).eq('active', true).order('first_name').range(from, to)),
      ]);
      setClients(cl);
      setEmployees(emp);

      if (editId) {
        const [{ data: job }, { data: jobItems }, { data: assigns }] = await Promise.all([
          supabase.from('jobs').select('*').eq('id', editId).single(),
          supabase.from('job_items').select('*').eq('job_id', editId).order('created_at'),
          supabase.from('job_assignments').select('*').eq('job_id', editId),
        ]);
        if (job) {
          setTitle(job.title || '');
          setClientId(job.client_id || '');
          setStatus(
            job.status === 'in_progress' ? 'in_progress' : job.status === 'posible' ? 'posible' : 'scheduled',
          );
          setPriority(job.priority || 'normal');
          setAddress(job.job_address || '');
          setCity(job.job_city || '');
          setState(job.job_state || '');
          setScheduledDate(job.scheduled_date || '');
          setEndDate(job.end_date || '');
          setAllDay(!!job.all_day);
          setTimeStart(job.time_start || '');
          setTimeEnd(job.time_end || '');
          setDescription(job.description || '');
          setInternalNotes(job.internal_notes || '');
          const isEst = !!job.estimate_number;
          setEditIsProposal(isEst);
          if (isEst) {
            setClientNotes(job.notes || '');
            setIssueDate(job.issue_date || new Date().toISOString().split('T')[0]);
            setExpiryDate(job.expiry_date || '');
            setTaxRate(job.tax_rate || 0);
            setDiscount(job.discount || 0);
          }
        }
        if (jobItems && jobItems.length > 0) {
          setItems(jobItems.map((i: any) => ({
            id: i.id,
            item_type: i.item_type || 'other',
            description: i.description || '',
            quantity: i.quantity || 1,
            unit_price: i.unit_price || 0,
          })));
        }
        if (assigns) {
          setAssignedEmployees(assigns.filter((a: any) => a.employee_id).map((a: any) => a.employee_id));
          const manual = assigns.filter((a: any) => !a.employee_id && a.worker_name).map((a: any) => a.worker_name);
          if (manual.length > 0) setManualWorkers(manual);
          const lead = assigns.find((a: any) => a.is_lead && a.employee_id);
          if (lead) setLeadEmployeeId(lead.employee_id);
        }
        setLoadingEdit(false);
      }
    };
    loadData();
  }, [business]);

  // Auto-add a new row when all existing items have a description
  useEffect(() => {
    if (items.length === 0) return;
    const allFilled = items.every(i => i.description.trim() !== '');
    if (allFilled) {
      setItems(prev => [...prev, isEditProposal ? newItem() : newLaborItem()]);
    }
  }, [items.map(i => i.description).join('|')]);

  // Close client dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClientChange = (id: string) => {
    setClientId(id);
    setClientDropdownOpen(false);
    setClientSearch('');
    const client = clients.find(c => c.id === id);
    if (client && !isEditProposal) {
      if (client.city) setCity(client.city);
      if (client.state) setState(client.state);
    }
  };

  const filteredClients = clientSearch
    ? clients.filter(c => {
        const q = clientSearch.toLowerCase();
        return [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase().includes(q);
      })
    : clients;

  const selectedClient = clients.find(c => c.id === clientId);

  const parseMapLink = (link: string) => {
    setMapLink(link);
    // No autofill — Google's /place/ slug puts business name, address, city,
    // state, country in unpredictable order, so guessing by comma-split was
    // misaligning fields. Mobile captures the coordinates (job_lat / job_lng);
    // web's form doesn't surface a coords field yet, so we just store the
    // raw link and let the user type the address.
  };

  const toggleEmployee = (id: string) => {
    setAssignedEmployees(prev => {
      const next = prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id];
      if (!next.includes(id) && leadEmployeeId === id) setLeadEmployeeId(null);
      return next;
    });
  };

  const updateItem = (id: string, field: keyof LineItem, value: any) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const taxAmt = subtotal * (taxRate / 100);
  const total = isEditProposal ? subtotal + taxAmt - discount : subtotal;

  // ── Total-time line + out-of-hours note ──
  const totalTimeText = formatProjectDuration(
    {
      startDate: scheduledDate,
      endDate,
      timeStart: allDay ? null : timeStart,
      timeEnd: allDay ? null : timeEnd,
    },
    full.common.duration,
  );
  const ohStatus = evaluateOperatingHours(
    normalizeOperatingHours(business?.operating_hours),
    scheduledDate,
    allDay ? null : timeStart,
    allDay ? null : timeEnd,
  );

  const save = async () => {
    if (!title.trim()) { setError(isEditProposal ? t.errorTitleRequiredProposal : t.errorTitleRequiredJob); return; }
    const validItems = items.filter(i => i.description.trim());
    if (isEditProposal && validItems.length === 0) { setError(t.errorAtLeastOneItem); return; }
    setSaving(true); setError('');

    try {
      if (isEditProposal) {
        const proposalData: any = {
          client_id: clientId || null,
          title: title.trim(),
          description: description.trim() || null,
          notes: clientNotes.trim() || null,
          internal_notes: internalNotes.trim() || null,
          issue_date: issueDate,
          expiry_date: expiryDate || null,
          subtotal_amount: +subtotal.toFixed(2),
          tax_rate: taxRate,
          tax_amount: +taxAmt.toFixed(2),
          discount: +discount.toFixed(2),
          total_amount: +total.toFixed(2),
          scheduled_date: scheduledDate || null,
          end_date: endDate || null,
        };

        let finalJobId: string;
        if (editId) {
          const { error: jobErr } = await supabase.from('jobs').update(proposalData).eq('id', editId);
          if (jobErr) throw new Error(jobErr.message);
          finalJobId = editId;
        } else {
          const { count } = await supabase.from('jobs').select('*', { count: 'exact', head: true })
            .eq('business_id', business!.id).not('estimate_number', 'is', null);
          const estNum = `COT-${String((count ?? 0) + 1).padStart(4, '0')}`;
          const { data: job, error: jobErr } = await supabase.from('jobs').insert({
            business_id: business!.id, status: 'proposal', priority: 'normal',
            estimate_number: estNum, created_by: user?.id ?? null, ...proposalData,
          }).select().single();
          if (jobErr || !job) throw new Error(jobErr?.message ?? 'Error creating proposal');
          finalJobId = job.id;
        }

        // Replace job items
        if (editId) await supabase.from('job_items').delete().eq('job_id', finalJobId);
        if (validItems.length > 0) {
          await supabase.from('job_items').insert(
            validItems.map(i => ({
              job_id: finalJobId, item_type: i.item_type,
              description: i.description, quantity: i.quantity, unit_price: i.unit_price,
            }))
          );
        }

        router.push(`/dashboard/trabajos/${finalJobId}`);
      } else {
        const jobData: any = {
          client_id: clientId || null,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          job_address: address.trim() || null,
          job_city: city.trim() || null,
          job_state: state || null,
          scheduled_date: scheduledDate || null,
          end_date: endDate || null,
          all_day: allDay,
          time_start: allDay ? null : (timeStart || null),
          time_end: allDay ? null : (timeEnd || null),
          internal_notes: internalNotes.trim() || null,
          total_amount: subtotal,
        };

        let finalJobId: string;
        if (editId) {
          const { error: jobErr } = await supabase.from('jobs').update(jobData).eq('id', editId);
          if (jobErr) throw new Error(jobErr.message);
          finalJobId = editId;
        } else {
          const { data: job, error: jobErr } = await supabase.from('jobs').insert({
            business_id: business!.id, status, created_by: user?.id ?? null, ...jobData,
          }).select().single();
          if (jobErr || !job) throw new Error(jobErr?.message ?? 'Error creating job');
          finalJobId = job.id;
        }

        // Replace job items
        if (editId) await supabase.from('job_items').delete().eq('job_id', finalJobId);
        if (validItems.length > 0) {
          await supabase.from('job_items').insert(
            validItems.map(i => ({
              job_id: finalJobId, item_type: i.item_type,
              description: i.description, quantity: i.quantity, unit_price: i.unit_price,
            }))
          );
        }

        // Replace assignments — include is_lead so the Project Leader is
        // recorded for the post-job actuals flow.
        if (editId) await supabase.from('job_assignments').delete().eq('job_id', finalJobId);
        const validLeadId =
          leadEmployeeId && assignedEmployees.includes(leadEmployeeId) ? leadEmployeeId : null;
        const assignments: any[] = [];
        assignedEmployees.forEach(empId => {
          const emp = employees.find(e => e.id === empId);
          if (emp) assignments.push({
            job_id: finalJobId, employee_id: empId,
            worker_name: `${emp.first_name} ${emp.last_name}`,
            is_lead: empId === validLeadId,
          });
        });
        manualWorkers.filter(w => w.trim()).forEach(name => {
          assignments.push({ job_id: finalJobId, worker_name: name.trim() });
        });
        if (assignments.length > 0) {
          await supabase.from('job_assignments').insert(assignments);
        }

        router.push(`/dashboard/trabajos/${finalJobId}`);
      }
    } catch (e: any) {
      setError(e.message || t.errorSaveGeneric);
      setSaving(false);
    }
  };

  if (loadingEdit) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div>
    </div>
  );

  const heading = editId
    ? (isEditProposal ? t.headingEditProposal : t.headingEditJob)
    : (isEditProposal ? t.headingNewProposal : t.headingNewJob);
  const subtitle = editId
    ? t.subtitleEdit
    : (isEditProposal ? t.subtitleNewProposal : t.subtitleNewJob);

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={editId ? `/dashboard/trabajos/${editId}` : '/dashboard/trabajos'} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-500"/>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{heading}</h1>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">

        {/* ── Información general */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{t.generalInfo}</p>
          <div className="flex flex-col gap-3">
            <Input label={isEditProposal ? t.titleLabelProposal : t.titleLabelJob}
              placeholder={t.titlePlaceholder}
              value={title} onChange={e => setTitle(e.target.value)}/>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t.clientLabel}</label>
              <div className="relative" ref={clientDropdownRef}>
                <button type="button" onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary">
                  {selectedClient ? (
                    <span className="text-gray-900 truncate">
                      {selectedClient.first_name} {selectedClient.last_name}
                      {selectedClient.company && <span className="text-gray-400"> · {selectedClient.company}</span>}
                    </span>
                  ) : (
                    <span className="text-gray-400">{t.clientPlaceholder}</span>
                  )}
                  <ChevronDown size={14} className="text-gray-400 shrink-0 ml-2"/>
                </button>
                {clientDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                        <input autoFocus type="text" placeholder={t.clientSearchPlaceholder}
                          value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <button type="button" onClick={() => handleClientChange('')}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${!clientId ? 'text-primary font-medium' : 'text-gray-500'}`}>
                        {t.clientNone}
                      </button>
                      {filteredClients.map(c => (
                        <button type="button" key={c.id} onClick={() => handleClientChange(c.id)}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors truncate ${clientId === c.id ? 'text-primary font-medium bg-primary/5' : 'text-gray-900'}`}>
                          {c.first_name} {c.last_name}
                          {c.company && <span className="text-gray-400 ml-1">· {c.company}</span>}
                        </button>
                      ))}
                      {filteredClients.length === 0 && (
                        <p className="px-4 py-3 text-xs text-gray-400 text-center">{t.clientNoResults}</p>
                      )}
                    </div>
                  </div>
                )}
                {clientId && (
                  <button type="button" onClick={() => handleClientChange('')}
                    className="absolute right-10 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 transition-colors">
                    <X size={12} className="text-gray-400"/>
                  </button>
                )}
              </div>
            </div>

            {isEditProposal ? (
              /* Proposal: issue + expiry, then project start/finish + est. hours */
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input label={t.issueDateLabel} type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}/>
                  <Input label={t.expiryDateLabel} type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label={t.projectStartLabel} type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}/>
                  <Input label={t.endDateLabel} type="date" value={endDate} onChange={e => setEndDate(e.target.value)}/>
                </div>
                {totalTimeText && (
                  <p className="text-xs text-gray-500 text-right">
                    {t.totalTimeLabel}: <span className="font-semibold text-primary">{totalTimeText}</span>
                  </p>
                )}
              </>
            ) : (
              /* Job: status + priority */
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{t.statusLabel}</label>
                  <select value={status} onChange={e => setStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                    <option value="posible">{tStatuses.posible}</option>
                    <option value="scheduled">{tStatuses.scheduled}</option>
                    <option value="in_progress">{tStatuses.in_progress}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{t.priorityLabel}</label>
                  <select value={priority} onChange={e => setPriority(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                    <option value="low">{tPriorities.low}</option>
                    <option value="normal">{tPriorities.normal}</option>
                    <option value="high">{tPriorities.high}</option>
                    <option value="urgent">{tPriorities.urgent}</option>
                  </select>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t.descriptionLabel}</label>
              <textarea rows={2} placeholder={t.descriptionPlaceholder}
                value={description} onChange={e => setDescription(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"/>
            </div>
          </div>
        </div>

        {/* ── Ubicación (job mode only) */}
        {!isEditProposal && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.locationHeading}</p>
            </div>
            <div className="flex flex-col gap-3">
              {/* Map link paste */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Link2 size={13} className="text-gray-400"/> {t.mapLinkLabel}
                </label>
                <input type="url" placeholder={t.mapLinkPlaceholder}
                  value={mapLink} onChange={e => parseMapLink(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"/>
                {mapLink && !mapLink.includes('google') && !mapLink.includes('apple') && !mapLink.includes('goo.gl') && (
                  <p className="text-xs text-amber-500">{t.mapLinkHint}</p>
                )}
              </div>
              <div className="border-t border-gray-100 pt-3"/>
              <Input label={t.addressLabel} placeholder={t.addressPlaceholder} value={address}
                onChange={e => setAddress(e.target.value)}/>
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <Input label={t.cityLabel} placeholder={t.cityPlaceholder} value={city}
                  onChange={e => setCity(e.target.value)}/>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{t.stateLabel}</label>
                  <select value={state} onChange={e => setState(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                    <option value="">{t.stateNone}</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Horario (job mode only) */}
        {!isEditProposal && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.scheduleHeading}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t.dateLabel} type="date" value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}/>
              <Input label={t.endDateLabel} type="date" value={endDate}
                onChange={e => setEndDate(e.target.value)}/>
            </div>

            <div className="flex items-center justify-between mt-4">
              <label className="text-sm font-medium text-gray-700">{t.allDayLabel}</label>
              <Toggle checked={allDay} onChange={setAllDay} aria-label={t.allDayLabel}/>
            </div>

            {!allDay && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Input label={t.timeStartLabel} type="time" value={timeStart}
                  onChange={e => setTimeStart(e.target.value)}/>
                <Input label={t.timeEndLabel} type="time" value={timeEnd}
                  onChange={e => setTimeEnd(e.target.value)}/>
              </div>
            )}

            {ohStatus && ohStatus.status !== 'ok' && (
              <p className="text-xs text-amber-600 mt-3">
                ⚠ {ohStatus.status === 'closed'
                  ? t.outOfHoursClosedNote
                  : `${t.outOfHoursNote} · ${formatTime12h(ohStatus.day.start)}–${formatTime12h(ohStatus.day.end)}`}
              </p>
            )}

            {totalTimeText && (
              <p className="text-xs text-gray-500 text-right mt-3">
                {t.totalTimeLabel}: <span className="font-semibold text-primary">{totalTimeText}</span>
              </p>
            )}
          </div>
        )}

        {/* ── Empleados (job mode only) */}
        {!isEditProposal && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.workersHeading}</p>
            </div>
            {employees.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {employees.map(emp => {
                  const on = assignedEmployees.includes(emp.id);
                  const isLead = leadEmployeeId === emp.id;
                  return (
                    <button key={emp.id} type="button" onClick={() => toggleEmployee(emp.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                        on
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {emp.first_name.charAt(0)}{emp.last_name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-gray-400 font-normal">{emp.role}</p>
                      </div>
                      {/* Lead radio — visible only for selected workers and only
                         when crew mode is on. Click toggles lead independently
                         of the outer chip's onClick (stopPropagation). */}
                      {on && business?.job_crew_mode !== false && (
                        <span
                          role="checkbox"
                          aria-checked={isLead}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLeadEmployeeId(isLead ? null : emp.id);
                          }}
                          className={`ml-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold cursor-pointer shrink-0 ${
                            isLead
                              ? 'bg-amber-100 border-amber-300 text-amber-700'
                              : 'bg-white border-gray-300 text-gray-400 hover:border-amber-300'
                          }`}
                        >
                          {isLead ? t.leadBadge : t.markAsLead}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-400">{t.additionalWorkersLabel}</p>
              {manualWorkers.map((w, i) => (
                <div key={i} className="flex gap-2">
                  <input type="text" placeholder={t.workerNumberPlaceholder.replace('{{count}}', String(i + 1))} value={w}
                    onChange={e => setManualWorkers(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"/>
                  {manualWorkers.length > 1 && (
                    <button onClick={() => setManualWorkers(prev => prev.filter((_, j) => j !== i))}
                      className="p-2 rounded-xl hover:bg-red-50 transition-colors">
                      <Trash2 size={14} className="text-red-400"/>
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setManualWorkers(prev => [...prev, ''])}
                className="text-xs text-primary font-medium hover:underline text-left">
                {t.addWorker}
              </button>
            </div>
          </div>
        )}

        {/* ── Líneas de trabajo / Ítems */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={15} className="text-primary"/>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {isEditProposal ? t.itemsHeadingProposal : t.itemsHeadingJob}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {isEditProposal ? (
              /* Proposal: simpler grid without item_type */
              <>
                <div className="grid grid-cols-[1fr_70px_90px_80px_32px] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide pb-1">
                  <span>{t.colDescription}</span><span className="text-center">{t.colQty}</span><span className="text-right">{t.colUnitPrice}</span><span className="text-right">{t.colTotal}</span><span/>
                </div>
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-[1fr_70px_90px_80px_32px] gap-2 items-center">
                    <input type="text" placeholder={t.itemDescriptionPlaceholderProposal}
                      value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.5" value={item.quantity || ''}
                      onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.01" value={item.unit_price || ''}
                      onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <p className="text-sm font-semibold text-gray-900 text-right pr-1">
                      ${fmtMoney(item.quantity * item.unit_price)}
                    </p>
                    <button onClick={() => items.length > 1 && removeItem(item.id)}
                      disabled={items.length === 1}
                      className="p-1 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 size={13} className={items.length === 1 ? 'text-gray-200' : 'text-red-400'}/>
                    </button>
                  </div>
                ))}
              </>
            ) : (
              /* Job: full grid with item_type */
              <>
                <div className="grid grid-cols-[100px_1fr_70px_90px_80px_32px] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide pb-1">
                  <span>{t.colType}</span><span>{t.colDescription}</span><span className="text-center">{t.colQty}</span><span className="text-right">{t.colUnitPrice}</span><span className="text-right">{t.colTotal}</span><span/>
                </div>
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-[100px_1fr_70px_90px_80px_32px] gap-2 items-center">
                    <select value={item.item_type}
                      onChange={e => updateItem(item.id, 'item_type', e.target.value)}
                      className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                      {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input type="text" placeholder={t.itemDescriptionPlaceholderJob} value={item.description}
                      onChange={e => updateItem(item.id, 'description', e.target.value)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.5" value={item.quantity || ''}
                      onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.01" value={item.unit_price || ''}
                      onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <p className="text-sm font-semibold text-gray-900 text-right pr-1">
                      ${fmtMoney(item.quantity * item.unit_price)}
                    </p>
                    <button onClick={() => items.length > 1 && removeItem(item.id)}
                      className="p-1 rounded-lg hover:bg-red-50 transition-colors"
                      disabled={items.length === 1}>
                      <Trash2 size={13} className={items.length === 1 ? 'text-gray-200' : 'text-red-400'}/>
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Totals */}
            <div className="border-t border-gray-100 mt-2 pt-3 flex justify-end">
              {isEditProposal ? (
                <div className="w-52 flex flex-col gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t.subtotal}</span>
                    <span className="font-medium">${fmtMoney(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-3">
                    <span className="text-gray-500 whitespace-nowrap">{t.taxPercent}</span>
                    <input type="number" min="0" max="30" step="0.5" value={taxRate || ''}
                      placeholder="0" onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-20 rounded-xl border border-gray-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-3">
                    <span className="text-gray-500">{t.discountAmount}</span>
                    <input type="number" min="0" step="0.01" value={discount || ''}
                      placeholder="0" onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                      className="w-20 rounded-xl border border-gray-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                  </div>
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100">
                    <span>{t.total}</span>
                    <span className="text-primary">${fmtMoney(total)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-right">
                  <p className="text-xs text-gray-400">{t.totalEstimated}</p>
                  <p className="text-lg font-bold text-gray-900">${fmtMoney(subtotal)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Notas */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={15} className="text-primary"/>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.notesHeading}</p>
          </div>
          <div className="flex flex-col gap-3">
            {isEditProposal && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">{t.clientNoteLabel}</label>
                <textarea rows={2} placeholder={t.clientNotePlaceholder}
                  value={clientNotes} onChange={e => setClientNotes(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"/>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {isEditProposal ? t.internalNoteLabelProposal : t.internalNoteLabelJob}
              </label>
              <textarea rows={3} placeholder={isEditProposal ? t.internalNotePlaceholderProposal : t.internalNotePlaceholderJob}
                value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"/>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <Link href={editId ? `/dashboard/trabajos/${editId}` : '/dashboard/trabajos'} className="flex-1">
            <Button variant="secondary" fullWidth>{tc.buttons.cancel}</Button>
          </Link>
          <Button onClick={save} loading={saving} fullWidth>
            {editId ? tc.buttons.saveChanges : (isEditProposal ? t.submitCreateProposal : t.submitCreateJob)}
          </Button>
        </div>
      </div>
    </div>
  );
}
