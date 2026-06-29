'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, MapPin, Calendar, Users, DollarSign, FileText, Search, Link2, ChevronDown, X, Lock, Eye, ImagePlus, Navigation, Loader2 } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { JobPhotosSection } from '@/components/jobs/JobPhotosSection';
import { parseHiddenFields, isJobFieldHidden, jobSectionHasVisibleField, JOB_FIELDS_ALWAYS_SHOWN, parseJobLayout, fieldsInSection, type JobSectionKey, type JobLayoutSection } from '@amixos/shared/lib/jobSections';
import { useDirty, useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { usStateName } from '@amixos/shared/lib/usStates';
import { logAudit } from '@amixos/shared/lib/audit';
import { formatProjectDuration } from '@amixos/shared/lib/duration';
import { formatTime12h, formatPhoneInput } from '@amixos/shared/lib/format';
import { Modal } from '@/components/ui/Modal';
import { evaluateOperatingHours, normalizeOperatingHours } from '@amixos/shared/lib/operatingHours';

interface Client { id: string; first_name: string; last_name: string; company: string | null; job_address?: string; city?: string; state?: string; }
interface Employee { id: string; first_name: string; last_name: string; role: string; }

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
}

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

// Hours between two "HH:MM" times (rounded to 2 decimals). Wraps past midnight
// so an overnight shift (e.g. 22:00 → 06:00) reads as 8h, not -16h.
function hoursFromTimes(start: string, end: string): number | null {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (a == null || b == null) return null;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

// Parse a manually typed "lat, lng" pair (comma or whitespace separated).
function parseCoords(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

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
  const { t: full, locale } = useLang();
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
  const { business, user, currentRole } = useApp();
  // Labor/Material/Equipment/Other categories on job line items — hidden when
  // the business turns them off (billed flat / by qty × rate instead).
  const showItemTypes = business?.job_item_types_enabled !== false;
  // Per-business required job fields (Ajustes → Trabajos). `jrl` marks a label
  // with " *" when required; JOB_REQUIRABLE is the subset that exists on this
  // form (validated on save).
  const jobReq = (business?.job_field_required ?? {}) as Record<string, boolean>;
  const jrl = (key: string, base: string) => (jobReq[key] ? `${base} *` : base);
  // Per-business field show/hide (Ajustes → Trabajos eye toggles). `fHidden`
  // hides an individual field; a section heading hides when all its fields are.
  // Hidden fields are skipped in required-validation.
  const jobHidden = parseHiddenFields(business?.job_field_hidden);
  const fHidden = (key: string) => !JOB_FIELDS_ALWAYS_SHOWN.includes(key) && isJobFieldHidden(jobHidden, key);
  const secVisible = (key: JobSectionKey) => jobSectionHasVisibleField(jobHidden, key);
  const JOB_REQUIRABLE: { key: string; label: string }[] = [
    { key: 'client_id', label: t.clientLabel },
    { key: 'description', label: t.descriptionLabel },
    { key: 'job_address', label: t.addressLabel },
    { key: 'job_city', label: t.cityLabel },
    { key: 'job_state', label: t.stateLabel },
    { key: 'coordinates', label: t.coordinatesLabel },
    { key: 'scheduled_date', label: t.dateLabel },
    { key: 'time_start', label: t.timeStartLabel },
    { key: 'time_end', label: t.timeEndLabel },
    { key: 'total_hours', label: t.totalHoursLabel },
    { key: 'assigned_workers', label: t.workersHeading },
    { key: 'internal_notes', label: t.internalNoteLabelJob },
  ];
  const router = useRouter();
  // Defense in depth: field crew / viewers can't create jobs (RLS rejects the
  // insert and they have no clients to pick). Entry points are hidden, but
  // guard the route too in case of a deep link.
  useEffect(() => {
    if (currentRole && !can.createJob(currentRole)) router.replace('/dashboard/trabajos');
  }, [currentRole, router]);
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  // Duplicate mode: prefill the whole form from an existing job but save as
  // a brand-new record (editId stays null so the insert path runs).
  const duplicateId = searchParams.get('duplicate');
  const sourceId = editId ?? duplicateId;
  const isProposal = searchParams.get('modo') === 'propuesta';

  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Custom job fields (job_field_templates) + their current values, keyed by
  // field_key. Rendered in their assigned layout section; persisted to
  // jobs.custom_fields (JSONB).
  const [jobTemplates, setJobTemplates] = useState<FieldTemplate[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingEdit, setLoadingEdit] = useState(!!sourceId);
  const [editIsProposal, setEditIsProposal] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  // Crew visibility (migration 044). New jobs default to "Privado" — the
  // owner-side scheduler — and flip on when they're ready for the crew.
  const [publishedToCrew, setPublishedToCrew] = useState(false);
  const [status, setStatus] = useState<'posible' | 'scheduled' | 'in_progress' | 'completed'>('scheduled');
  // The job's status when the edit form loaded — used to detect a real status
  // change on save (so we stamp the pipeline timestamp only when it actually moves).
  const [loadedStatus, setLoadedStatus] = useState<string | null>(null);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  // Manual total hours — used when start/end times are blank; when both are set
  // the field auto-computes from them and this is ignored.
  const [totalHours, setTotalHours] = useState('');
  const [description, setDescription] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);
  const [manualWorkers, setManualWorkers] = useState<string[]>(['']);
  const [leadEmployeeId, setLeadEmployeeId] = useState<string | null>(null);
  // Optional drivers — any employees paid extra driverHours (each) on top of
  // the job's total hours. Multi-select, like crew.
  const [driverEmployeeIds, setDriverEmployeeIds] = useState<string[]>([]);
  const [driverHours, setDriverHours] = useState('');
  const [driverDropdownOpen, setDriverDropdownOpen] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const driverDropdownRef = useRef<HTMLDivElement>(null);

  // Client search
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  // Quick-add new client
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [quickFirstName, setQuickFirstName] = useState('');
  const [quickLastName, setQuickLastName] = useState('');
  const [quickCompany, setQuickCompany] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const leadDropdownRef = useRef<HTMLDivElement>(null);
  const [crewDropdownOpen, setCrewDropdownOpen] = useState(false);
  const [crewSearch, setCrewSearch] = useState('');
  const crewDropdownRef = useRef<HTMLDivElement>(null);

  // Map link (saved raw) + coordinates extracted from it (drive the map pin)
  const [mapLink, setMapLink] = useState('');
  const [jobLat, setJobLat] = useState<number | null>(null);
  const [jobLng, setJobLng] = useState<number | null>(null);
  const [coordsText, setCoordsText] = useState('');
  const [coordsInvalid, setCoordsInvalid] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Proposal-only fields
  const [clientNotes, setClientNotes] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [taxRate, setTaxRate] = useState(0);
  const [discount, setDiscount] = useState(0);

  const isEditProposal = sourceId ? editIsProposal : isProposal;

  // ── Custom-field layout ──
  // Standard field keys (mirrors the settings-side default) + each custom
  // field as `custom:<id>`. The stored layout maps every key to a section.
  const STANDARD_JOB_FIELD_KEYS = [
    'client_id', 'priority', 'description', 'job_address', 'job_city', 'job_state',
    'coordinates', 'scheduled_date', 'time_start', 'total_hours',
    'assigned_workers', 'worker_notes', 'internal_notes',
  ];
  const allJobKeys = useMemo(
    () => [...STANDARD_JOB_FIELD_KEYS, ...jobTemplates.map(tpl => `custom:${tpl.id}`)],
    [jobTemplates],
  );
  const jobLayout = useMemo(
    () => parseJobLayout(business?.job_field_layout, allJobKeys),
    [business?.job_field_layout, allJobKeys],
  );
  // Custom-field templates assigned to a given layout section, in layout order.
  const customFieldsFor = (section: JobLayoutSection): FieldTemplate[] =>
    fieldsInSection(jobLayout, section)
      .filter(k => k.startsWith('custom:'))
      .map(k => jobTemplates.find(tpl => `custom:${tpl.id}` === k))
      .filter((tpl): tpl is FieldTemplate => !!tpl);
  // Renders the custom fields for a section (used at the end of each card).
  const renderCustomFields = (section: JobLayoutSection) =>
    customFieldsFor(section).map(tpl => (
      <CustomFieldInput
        key={tpl.id}
        template={tpl}
        value={customFields[tpl.field_key] ?? ''}
        onChange={v => setCustomFields(f => ({ ...f, [tpl.field_key]: v }))}
      />
    ));
  // Required custom fields whose section is actually rendered on this form.
  // general/location/notes/additional always render; schedule/workers only in
  // job mode (those cards don't exist for proposals).
  const customSectionRendered = (section: JobLayoutSection): boolean =>
    (section === 'schedule' || section === 'workers') ? !isEditProposal : true;
  const missingRequiredCustomFields = (): string[] => {
    const out: string[] = [];
    for (const tpl of jobTemplates) {
      if (!tpl.required) continue;
      const section = jobLayout.find(e => e.key === `custom:${tpl.id}`)?.section ?? 'additional';
      if (!customSectionRendered(section)) continue;
      if (String(customFields[tpl.field_key] ?? '').trim() === '') out.push(tpl.field_label);
    }
    return out;
  };

  // Initialize default item for new jobs (not edit/duplicate mode)
  useEffect(() => {
    if (!sourceId && items.length === 0) {
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

      // Custom job fields config (bounded per-business table — no pagination).
      const { data: tmpls } = await supabase.from('job_field_templates')
        .select('*').eq('business_id', businessId).order('sort_order');
      setJobTemplates((tmpls ?? []) as FieldTemplate[]);

      if (sourceId) {
        const [{ data: job }, { data: jobItems }, { data: assigns }] = await Promise.all([
          supabase.from('jobs').select('*').eq('id', sourceId).single(),
          supabase.from('job_items').select('*').eq('job_id', sourceId).order('created_at'),
          supabase.from('job_assignments').select('*').eq('job_id', sourceId),
        ]);
        if (job) {
          setTitle(job.title || '');
          setClientId(job.client_id || '');
          setPublishedToCrew(!!job.published_to_crew);
          setStatus(
            job.status === 'in_progress' ? 'in_progress'
              : job.status === 'posible' ? 'posible'
              : job.status === 'completed' ? 'completed'
              : 'scheduled',
          );
          setLoadedStatus(job.status);
          setPriority(job.priority || 'normal');
          setAddress(job.job_address || '');
          setCity(job.job_city || '');
          setState(job.job_state || '');
          setMapLink(job.job_map_link || '');
          setJobLat(job.job_lat ?? null);
          setJobLng(job.job_lng ?? null);
          setCoordsText(job.job_lat != null && job.job_lng != null ? `${job.job_lat}, ${job.job_lng}` : '');
          setScheduledDate(job.scheduled_date || '');
          setEndDate(job.end_date || '');
          setAllDay(!!job.all_day);
          setTimeStart(job.time_start || '');
          setTimeEnd(job.time_end || '');
          setTotalHours(job.total_hours != null ? String(job.total_hours) : '');
          setDriverEmployeeIds(job.driver_employee_ids ?? []);
          setDriverHours(job.driver_hours != null ? String(job.driver_hours) : '');
          setDescription(job.description || '');
          setInternalNotes(job.internal_notes || '');
          // Prefill custom field values (coerce each to a string for the inputs).
          if (job.custom_fields && typeof job.custom_fields === 'object') {
            const cf: Record<string, string> = {};
            for (const [k, v] of Object.entries(job.custom_fields as Record<string, unknown>)) {
              cf[k] = String(v ?? '');
            }
            setCustomFields(cf);
          }
          const isEst = !!job.estimate_number;
          setEditIsProposal(isEst);
          if (isEst) {
            setClientNotes(job.notes || '');
            // A duplicated proposal is a new proposal: keep today's issue
            // date + default expiry instead of copying the source's.
            if (editId) {
              setIssueDate(job.issue_date || new Date().toISOString().split('T')[0]);
              setExpiryDate(job.expiry_date || '');
            }
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

  // Close lead + crew dropdowns on outside click. Lead is single-select so we
  // also clear its search input; crew stays so the user can keep multi-picking.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (leadDropdownRef.current && !leadDropdownRef.current.contains(e.target as Node)) {
        setLeadDropdownOpen(false);
        setLeadSearch('');
      }
      if (crewDropdownRef.current && !crewDropdownRef.current.contains(e.target as Node)) {
        setCrewDropdownOpen(false);
      }
      if (driverDropdownRef.current && !driverDropdownRef.current.contains(e.target as Node)) {
        setDriverDropdownOpen(false);
        setDriverSearch('');
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

  const openQuickClient = () => {
    setQuickError('');
    setQuickFirstName(clientSearch.trim());
    setQuickLastName('');
    setQuickCompany('');
    setQuickPhone('');
    setClientDropdownOpen(false);
    setQuickClientOpen(true);
  };

  const saveQuickClient = async () => {
    if (!business) return;
    const firstName = quickFirstName.trim();
    if (!firstName) {
      setQuickError(locale === 'es' ? 'El nombre es obligatorio' : 'First name is required');
      return;
    }
    setQuickSaving(true);
    setQuickError('');
    const { data, error } = await supabase
      .from('clients')
      .insert({
        business_id: business.id,
        first_name: firstName,
        last_name: quickLastName.trim() || null,
        company: quickCompany.trim() || null,
        phone_cell: quickPhone.trim() || null,
      })
      .select('id, first_name, last_name, company, address, city, state')
      .single();
    setQuickSaving(false);
    if (error || !data) {
      setQuickError(error?.message || (locale === 'es' ? 'No se pudo crear el cliente' : 'Could not create client'));
      return;
    }
    const newRow = data as Client;
    setClients(prev => [...prev, newRow]);
    handleClientChange(newRow.id);
    setClientSearch('');
    setQuickClientOpen(false);
    setQuickFirstName('');
    setQuickLastName('');
    setQuickCompany('');
    setQuickPhone('');
  };

  const filteredClients = clientSearch
    ? clients.filter(c => {
        const q = clientSearch.toLowerCase();
        return [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase().includes(q);
      })
    : clients;

  const selectedClient = clients.find(c => c.id === clientId);

  const filterEmployeesByName = (list: typeof employees, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(e => `${e.first_name} ${e.last_name}`.toLowerCase().includes(q));
  };
  const filteredLeadEmployees = filterEmployeesByName(employees, leadSearch);
  // Crew picker excludes the current lead — the lead is always part of the
  // crew at save time but is shown in its own picker, not here.
  const crewEmployees = employees.filter(
    e => business?.job_crew_mode !== false ? e.id !== leadEmployeeId : true,
  );
  const filteredCrewEmployees = filterEmployeesByName(crewEmployees, crewSearch);
  const leadEmployee = employees.find(e => e.id === leadEmployeeId) ?? null;

  // Driver pool — ANY employee, not just the crew. A driver-only person (drove
  // but didn't work the job) is credited ONLY their driver hours in Reports,
  // never the job's total hours (which go to the assigned crew).
  const filteredDriverPool = filterEmployeesByName(employees, driverSearch);
  const toggleDriver = (id: string) =>
    setDriverEmployeeIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  // Drop any drivers whose employee no longer exists.
  useEffect(() => {
    setDriverEmployeeIds(prev => {
      const next = prev.filter(id => employees.some(e => e.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [employees]);

  const parseMapLink = (link: string) => {
    setMapLink(link);
    // We save the raw link AND try to pull coordinates out of it (the coords
    // drive the Map module pin). Address / city / state are NOT auto-filled —
    // Google's /place/ slug orders fields unpredictably, so a comma-split was
    // misaligning them; the user types the address. Shortened links
    // (maps.app.goo.gl/…) carry no coords in the URL and can't be resolved
    // from the browser (CORS), so those save the link only.
    if (!link.trim()) { setJobLat(null); setJobLng(null); return; }
    const m =
      link.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ||
      link.match(/[?&](?:q|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ||
      link.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (!m) return;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    setJobLat(lat);
    setJobLng(lng);
    setCoordsText(`${lat}, ${lng}`);
    setCoordsInvalid(false);
  };

  // Manual "lat, lng" entry — validates and stores the numeric pair.
  const onCoordsChange = (text: string) => {
    setCoordsText(text);
    if (!text.trim()) { setCoordsInvalid(false); setJobLat(null); setJobLng(null); return; }
    const parsed = parseCoords(text);
    if (parsed) {
      setJobLat(parsed.lat);
      setJobLng(parsed.lng);
      setCoordsInvalid(false);
    } else {
      setJobLat(null);
      setJobLng(null);
      setCoordsInvalid(true);
    }
  };

  // Grab the browser's current position and fill the coordinates.
  const useMyLocation = () => {
    if (gettingLocation) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert(t.locationError);
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
        const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        setJobLat(lat);
        setJobLng(lng);
        setCoordsText(`${lat}, ${lng}`);
        setCoordsInvalid(false);
        setGettingLocation(false);
      },
      (err) => {
        alert(err.code === err.PERMISSION_DENIED ? t.locationDenied : t.locationError);
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const toggleEmployee = (id: string) => {
    setAssignedEmployees(prev => {
      const next = prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id];
      if (!next.includes(id) && leadEmployeeId === id) setLeadEmployeeId(null);
      return next;
    });
  };

  // The job lead lives in its own picker. Choosing a lead also assigns them to
  // the job (the lead is always part of the crew). Clearing leaves nobody lead.
  const setLead = (id: string) => {
    if (!id) { setLeadEmployeeId(null); return; }
    setLeadEmployeeId(id);
    setAssignedEmployees(prev => (prev.includes(id) ? prev : [...prev, id]));
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

  // Total hours: auto-computed from start+end times when both are set (the field
  // is then read-only), otherwise the manually-typed value. Saved on the job and
  // later credited to each assigned worker in Reports.
  const bothTimesSet = !allDay && !!timeStart && !!timeEnd;
  const computedHours = bothTimesSet ? hoursFromTimes(timeStart, timeEnd) : null;
  const effectiveTotalHours = bothTimesSet
    ? computedHours
    : (totalHours.trim() ? parseFloat(totalHours) : null);
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
    // Enforce the per-business required job fields (Ajustes → Trabajos). Only on
    // job mode, and only for fields that actually exist on this form. Runs on
    // save for both new + edit, so a past job is only checked if you re-save it.
    if (!isEditProposal) {
      const fieldVal: Record<string, string> = {
        client_id: clientId,
        description: description,
        job_address: address,
        job_city: city,
        job_state: state,
        coordinates: (mapLink.trim() || jobLat != null) ? 'x' : '',
        scheduled_date: scheduledDate,
        time_start: timeStart,
        time_end: timeEnd,
        total_hours: effectiveTotalHours != null ? 'x' : '',
        assigned_workers: assignedEmployees.length ? 'x' : '',
        internal_notes: internalNotes,
      };
      const missing = JOB_REQUIRABLE.filter(f => jobReq[f.key] && !fHidden(f.key) && !String(fieldVal[f.key] ?? '').trim()).map(f => f.label);
      missing.push(...missingRequiredCustomFields());
      if (missing.length) {
        setError(`${locale === 'es' ? 'Campos requeridos' : 'Required fields'}: ${missing.join(', ')}`);
        return;
      }
    } else {
      // Proposal mode: still enforce required custom fields whose section is
      // rendered here (general/location/notes/additional).
      const missing = missingRequiredCustomFields();
      if (missing.length) {
        setError(`${locale === 'es' ? 'Campos requeridos' : 'Required fields'}: ${missing.join(', ')}`);
        return;
      }
    }
    setSaving(true); setError('');

    try {
      if (isEditProposal) {
        const proposalData: any = {
          client_id: clientId || null,
          title: title.trim(),
          description: description.trim() || null,
          notes: clientNotes.trim() || null,
          internal_notes: internalNotes.trim() || null,
          // Location is shown on estimates too — persist it (mirrors the job path).
          job_address: address.trim() || null,
          job_city: city.trim() || null,
          job_state: state || null,
          job_map_link: mapLink.trim() || null,
          job_lat: jobLat,
          job_lng: jobLng,
          issue_date: issueDate,
          expiry_date: expiryDate || null,
          subtotal_amount: +subtotal.toFixed(2),
          tax_rate: taxRate,
          tax_amount: +taxAmt.toFixed(2),
          discount: +discount.toFixed(2),
          total_amount: +total.toFixed(2),
          scheduled_date: scheduledDate || null,
          end_date: endDate || null,
          published_to_crew: publishedToCrew,
          custom_fields: customFields,
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

        void logAudit(supabase, business!.id, editId ? 'job.updated' : 'job.created', 'job', finalJobId, {
          title: title.trim(),
          is_proposal: true,
        });

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
          job_map_link: mapLink.trim() || null,
          job_lat: jobLat,
          job_lng: jobLng,
          scheduled_date: scheduledDate || null,
          end_date: endDate || null,
          all_day: allDay,
          time_start: allDay ? null : (timeStart || null),
          time_end: allDay ? null : (timeEnd || null),
          total_hours: effectiveTotalHours,
          driver_employee_ids: driverEmployeeIds,
          driver_hours: driverEmployeeIds.length && driverHours.trim() ? parseFloat(driverHours) : null,
          internal_notes: internalNotes.trim() || null,
          total_amount: subtotal,
          published_to_crew: publishedToCrew,
          custom_fields: customFields,
        };

        let finalJobId: string;
        if (editId) {
          // Persist the (possibly changed) status — previously omitted, so
          // status edits silently didn't apply. Stamp the pipeline timestamp
          // only on a real transition (mirrors the detail-page stepper / 074).
          const jobUpdate: any = { ...jobData, status };
          if (status !== loadedStatus) {
            const nowIso = new Date().toISOString();
            if (status === 'scheduled') jobUpdate.scheduled_at = nowIso;
            else if (status === 'in_progress') jobUpdate.in_progress_at = nowIso;
            else if (status === 'completed') jobUpdate.completed_at = nowIso;
          }
          const { error: jobErr } = await supabase.from('jobs').update(jobUpdate).eq('id', editId);
          if (jobErr) throw new Error(jobErr.message);
          finalJobId = editId;
        } else {
          const { data: job, error: jobErr } = await supabase.from('jobs').insert({
            business_id: business!.id, status, created_by: user?.id ?? null, ...jobData,
          }).select().single();
          if (jobErr || !job) throw new Error(jobErr?.message ?? 'Error creating job');
          finalJobId = job.id;
        }

        void logAudit(supabase, business!.id, editId ? 'job.updated' : 'job.created', 'job', finalJobId, {
          title: title.trim(),
        });

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

  // Unsaved-changes guard: back links call confirmDiscard; beforeunload covers
  // refresh / tab-close. `values` covers every editable field (items filtered
  // to those with a description so the trailing empty row isn't counted); the
  // snapshot is taken once data loads (edit/duplicate) or at mount (new), so
  // untouched forms never prompt. Declared before the loading early-return to
  // keep hook order stable.
  const dirty = useDirty(
    {
      title, clientId, publishedToCrew, status, priority, address, city, state,
      scheduledDate, endDate, allDay, timeStart, timeEnd, totalHours, description,
      internalNotes, assignedEmployees,
      manualWorkers: manualWorkers.filter(w => w.trim()),
      leadEmployeeId, driverEmployeeIds, driverHours, mapLink, clientNotes, issueDate, expiryDate, taxRate, discount,
      items: items.filter(i => i.description.trim()),
    },
    !loadingEdit,
  );
  const confirmDiscard = useUnsavedChanges(dirty);

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
        <Link
          href={sourceId ? `/dashboard/trabajos/${sourceId}` : '/dashboard/trabajos'}
          onClick={e => { e.preventDefault(); confirmDiscard(() => router.push(sourceId ? `/dashboard/trabajos/${sourceId}` : '/dashboard/trabajos')); }}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
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
              <label className="text-sm font-medium text-gray-700">{jrl('client_id', t.clientLabel)}</label>
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
                    <button type="button" onClick={openQuickClient}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors border-t border-gray-100">
                      {locale === 'es' ? '+ Crear cliente nuevo' : '+ Create new client'}
                    </button>
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
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                    <option value="posible">{tStatuses.posible}</option>
                    <option value="scheduled">{tStatuses.scheduled}</option>
                    <option value="in_progress">{tStatuses.in_progress}</option>
                    <option value="completed">{tStatuses.completed}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{t.priorityLabel}</label>
                  <select value={priority} onChange={e => setPriority(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                    <option value="low">{tPriorities.low}</option>
                    <option value="normal">{tPriorities.normal}</option>
                    <option value="high">{tPriorities.high}</option>
                    <option value="urgent">{tPriorities.urgent}</option>
                  </select>
                </div>
              </div>
            )}

            {!fHidden('description') && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{jrl('description', t.descriptionLabel)}</label>
              <textarea rows={5} placeholder={t.descriptionPlaceholder}
                value={description} onChange={e => setDescription(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-y"/>
            </div>
            )}

            {/* Crew visibility — when off, the job lives only on the
               owner's scheduler. iOS-style segmented control: active choice
               is the white pill that "floats" above the tinted track. */}
            <div className="flex flex-col gap-1 mt-1">
              <label className="text-sm font-medium text-gray-700">{t.publishedToCrewLabel}</label>
              <p className="text-xs text-gray-500 mb-1.5">{t.publishedToCrewHint}</p>
              <div className="flex p-1 rounded-2xl bg-gray-100">
                <button type="button" onClick={() => setPublishedToCrew(false)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-all ${
                    !publishedToCrew
                      ? 'bg-white text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  <Lock size={13} />
                  {t.privateBadge}
                </button>
                <button type="button" onClick={() => setPublishedToCrew(true)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-all ${
                    publishedToCrew
                      ? 'bg-white text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  <Eye size={13} />
                  {t.publicBadge}
                </button>
              </div>
            </div>
            {renderCustomFields('general')}
          </div>
        </div>

        {/* ── Ubicación — shown for jobs AND estimates (the work has a place
            even at quote time). proposalData persists it for estimates. */}
        {(secVisible('location') || customFieldsFor('location').length > 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.locationHeading}</p>
            </div>
            <div className="flex flex-col gap-3">
              {!fHidden('coordinates') && (
              <>
              {/* Map link paste */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Link2 size={13} className="text-gray-400"/> {jrl('coordinates', t.mapLinkLabel)}
                </label>
                <input type="url" placeholder={t.mapLinkPlaceholder}
                  value={mapLink} onChange={e => parseMapLink(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"/>
                {mapLink && !mapLink.includes('google') && !mapLink.includes('apple') && !mapLink.includes('goo.gl') && (
                  <p className="text-xs text-amber-500">{t.mapLinkHint}</p>
                )}
              </div>

              {/* Coordinates — lat, lng (editable; also auto-filled by the map
                  link paste and "Use my location"). */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Navigation size={13} className="text-gray-400"/> {t.coordinatesLabel}
                </label>
                <input type="text" inputMode="decimal" placeholder={t.coordinatesPlaceholder}
                  value={coordsText} onChange={e => onCoordsChange(e.target.value)}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary ${coordsInvalid ? 'border-red-300' : 'border-gray-200'}`}/>
                {coordsInvalid && (
                  <p className="text-xs text-red-500">{t.coordinatesInvalid}</p>
                )}
                <button type="button" onClick={useMyLocation} disabled={gettingLocation}
                  className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60">
                  {gettingLocation
                    ? <Loader2 size={15} className="animate-spin"/>
                    : <Navigation size={15}/>}
                  {gettingLocation ? t.gettingLocation : t.useMyLocation}
                </button>
              </div>
              <div className="border-t border-gray-100 pt-3"/>
              </>
              )}
              {!fHidden('job_address') && (
              <Input label={jrl('job_address', t.addressLabel)} placeholder={t.addressPlaceholder} value={address}
                onChange={e => setAddress(e.target.value)}/>
              )}
              {(!fHidden('job_city') || !fHidden('job_state')) && (
              <div className={`grid ${!fHidden('job_city') && !fHidden('job_state') ? 'grid-cols-[1fr_120px]' : 'grid-cols-1'} gap-3`}>
                {!fHidden('job_city') && (
                <Input label={jrl('job_city', t.cityLabel)} placeholder={t.cityPlaceholder} value={city}
                  onChange={e => setCity(e.target.value)}/>
                )}
                {!fHidden('job_state') && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{jrl('job_state', t.stateLabel)}</label>
                  <select value={state} onChange={e => setState(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                    <option value="">{t.stateNone}</option>
                    {US_STATES.map(s => <option key={s} value={s}>{usStateName(s, locale)}</option>)}
                  </select>
                </div>
                )}
              </div>
              )}
              {renderCustomFields('location')}
            </div>
          </div>
        )}

        {/* ── Horario (job mode only) */}
        {!isEditProposal && (secVisible('schedule') || customFieldsFor('schedule').length > 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.scheduleHeading}</p>
            </div>
            {/* "Date" is a single toggle that shows/hides both start AND end
                date. */}
            {!fHidden('scheduled_date') && (
            <div className="grid grid-cols-2 gap-3">
              <Input label={jrl('scheduled_date', t.dateLabel)} type="date" value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}/>
              <Input label={t.endDateLabel} type="date" value={endDate}
                onChange={e => setEndDate(e.target.value)}/>
            </div>
            )}

            {/* "Time" is a single toggle gating start time, end time AND the
                all-day switch (which only makes sense when times are shown). */}
            {!fHidden('time_start') && (
            <>
            <div className="flex items-center justify-between mt-4">
              <label className="text-sm font-medium text-gray-700">{t.allDayLabel}</label>
              <Toggle checked={allDay} onChange={setAllDay} aria-label={t.allDayLabel}/>
            </div>

            {!allDay && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Input label={jrl('time_start', t.timeStartLabel)} type="time" value={timeStart}
                  onChange={e => setTimeStart(e.target.value)}/>
                <Input label={jrl('time_end', t.timeEndLabel)} type="time" value={timeEnd}
                  onChange={e => setTimeEnd(e.target.value)}/>
              </div>
            )}
            </>
            )}

            {/* Total hours — auto from start/end (read-only) when both times are
                set, else manual entry. Credited to each worker in Reports. */}
            {!fHidden('total_hours') && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">{jrl('total_hours', t.totalHoursLabel)}</label>
              {bothTimesSet ? (
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 text-gray-500">
                  <span>{computedHours != null ? `${computedHours} h` : '—'}</span>
                  <span className="text-xs text-gray-400">{t.totalHoursAutoHint}</span>
                </div>
              ) : (
                <Input
                  type="text"
                  inputMode="decimal"
                  value={totalHours}
                  onChange={e => setTotalHours(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                />
              )}
              <p className="text-xs text-gray-400 mt-1.5">{t.totalHoursHint}</p>
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
            {customFieldsFor('schedule').length > 0 && (
              <div className="flex flex-col gap-3 mt-3">{renderCustomFields('schedule')}</div>
            )}
          </div>
        )}

        {/* ── Empleados (job mode only) */}
        {!isEditProposal && (secVisible('workers') || customFieldsFor('workers').length > 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.workersHeading}</p>
            </div>
            {employees.length > 0 && (
              <>
                {/* Lead picker — searchable single-select dropdown (mirrors
                   the client picker). Picking a lead also assigns them. */}
                {business?.job_crew_mode !== false && (
                  <div className="flex flex-col gap-1.5 mb-4 max-w-xs">
                    <label className="text-sm font-medium text-gray-700">{t.leadLabel}</label>
                    <div className="relative" ref={leadDropdownRef}>
                      <button type="button" onClick={() => setLeadDropdownOpen(o => !o)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary">
                        {leadEmployee ? (
                          <span className="text-gray-900 truncate">{leadEmployee.first_name} {leadEmployee.last_name}</span>
                        ) : (
                          <span className="text-gray-400">{t.leadNone}</span>
                        )}
                        <ChevronDown size={14} className="text-gray-400 shrink-0 ml-2"/>
                      </button>
                      {leadDropdownOpen && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                          <div className="p-2 border-b border-gray-100">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                              <input autoFocus type="text" placeholder={t.workerSearchPlaceholder}
                                value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
                                className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            <button type="button"
                              onClick={() => { setLead(''); setLeadDropdownOpen(false); setLeadSearch(''); }}
                              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${!leadEmployeeId ? 'text-primary font-medium' : 'text-gray-500'}`}>
                              {t.leadNone}
                            </button>
                            {filteredLeadEmployees.map(emp => (
                              <button type="button" key={emp.id}
                                onClick={() => { setLead(emp.id); setLeadDropdownOpen(false); setLeadSearch(''); }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors truncate ${leadEmployeeId === emp.id ? 'text-primary font-medium bg-primary/5' : 'text-gray-900'}`}>
                                {emp.first_name} {emp.last_name}
                              </button>
                            ))}
                            {filteredLeadEmployees.length === 0 && (
                              <p className="px-4 py-3 text-xs text-gray-400 text-center">{t.workerNoResults}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Crew — searchable multi-select dropdown. Replaces the
                   all-at-once grid so larger teams aren't overwhelming. */}
                <div className="flex flex-col gap-1.5 mb-3 max-w-xs">
                  {business?.job_crew_mode !== false && (
                    <label className="text-sm font-medium text-gray-700">{t.crewLabel}</label>
                  )}
                  <div className="relative" ref={crewDropdownRef}>
                    <button type="button" onClick={() => setCrewDropdownOpen(o => !o)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary">
                      {assignedEmployees.length > 0 ? (
                        <span className="text-gray-900 truncate">
                          {t.crewSelectedCount.replace('{{count}}', String(assignedEmployees.length))}
                        </span>
                      ) : (
                        <span className="text-gray-400">{t.crewPlaceholder}</span>
                      )}
                      <ChevronDown size={14} className="text-gray-400 shrink-0 ml-2"/>
                    </button>
                    {crewDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                            <input autoFocus type="text" placeholder={t.workerSearchPlaceholder}
                              value={crewSearch} onChange={e => setCrewSearch(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
                          </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {filteredCrewEmployees.map(emp => {
                            const on = assignedEmployees.includes(emp.id);
                            return (
                              <button type="button" key={emp.id} onClick={() => toggleEmployee(emp.id)}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors truncate flex items-center justify-between ${on ? 'text-primary font-medium bg-primary/5' : 'text-gray-900'}`}>
                                <span className="truncate">{emp.first_name} {emp.last_name}</span>
                                {on && <span className="text-xs text-primary ml-2">✓</span>}
                              </button>
                            );
                          })}
                          {filteredCrewEmployees.length === 0 && (
                            <p className="px-4 py-3 text-xs text-gray-400 text-center">{t.workerNoResults}</p>
                          )}
                        </div>
                        <div className="p-2 border-t border-gray-100">
                          <button type="button" onClick={() => { setCrewDropdownOpen(false); setCrewSearch(''); }}
                            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors">
                            {t.crewDoneBtn}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {assignedEmployees.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {employees.filter(emp => assignedEmployees.includes(emp.id)).map(emp => (
                        <button key={emp.id} type="button" onClick={() => toggleEmployee(emp.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary hover:bg-primary/15 transition-colors">
                          {emp.first_name} {emp.last_name}
                          <X size={11}/>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            {/* Drivers — optional multi-select (like crew). Each driver is
                credited driverHours on top of the job's total hours. Pool is
                ALL employees, so a driver who didn't work the job can be added
                without picking up the work hours. */}
            {employees.length > 0 && (
              <div className="flex flex-col gap-1.5 max-w-xs">
                <label className="text-sm font-medium text-gray-700">{t.driverLabel}</label>
                <div className="relative" ref={driverDropdownRef}>
                  <button type="button" onClick={() => setDriverDropdownOpen(o => !o)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary">
                    {driverEmployeeIds.length > 0 ? (
                      <span className="text-gray-900 truncate">
                        {t.crewSelectedCount.replace('{{count}}', String(driverEmployeeIds.length))}
                      </span>
                    ) : (
                      <span className="text-gray-400">{t.driverNone}</span>
                    )}
                    <ChevronDown size={14} className="text-gray-400 shrink-0 ml-2"/>
                  </button>
                  {driverDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                          <input autoFocus type="text" placeholder={t.workerSearchPlaceholder}
                            value={driverSearch} onChange={e => setDriverSearch(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {filteredDriverPool.map(emp => {
                          const on = driverEmployeeIds.includes(emp.id);
                          return (
                            <button type="button" key={emp.id} onClick={() => toggleDriver(emp.id)}
                              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors truncate flex items-center justify-between ${on ? 'text-primary font-medium bg-primary/5' : 'text-gray-900'}`}>
                              <span className="truncate">{emp.first_name} {emp.last_name}</span>
                              {on && <span className="text-xs text-primary ml-2">✓</span>}
                            </button>
                          );
                        })}
                        {filteredDriverPool.length === 0 && (
                          <p className="px-4 py-3 text-xs text-gray-400 text-center">{t.workerNoResults}</p>
                        )}
                      </div>
                      <div className="p-2 border-t border-gray-100">
                        <button type="button" onClick={() => { setDriverDropdownOpen(false); setDriverSearch(''); }}
                          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors">
                          {t.crewDoneBtn}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {driverEmployeeIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {employees.filter(emp => driverEmployeeIds.includes(emp.id)).map(emp => (
                      <button key={emp.id} type="button" onClick={() => toggleDriver(emp.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary hover:bg-primary/15 transition-colors">
                        {emp.first_name} {emp.last_name}
                        <X size={11}/>
                      </button>
                    ))}
                  </div>
                )}
                {driverEmployeeIds.length > 0 && (
                  <div className="mt-1">
                    <Input
                      label={t.driverHoursLabel}
                      type="text"
                      inputMode="decimal"
                      value={driverHours}
                      onChange={e => setDriverHours(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-400 mt-1.5">{t.driverHoursHint}</p>
                  </div>
                )}
              </div>
            )}
            {customFieldsFor('workers').length > 0 && (
              <div className="flex flex-col gap-3 mt-4">{renderCustomFields('workers')}</div>
            )}
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
              /* Job: full grid with item_type (type column hidden when off) */
              <>
                <div className={`grid ${showItemTypes ? 'grid-cols-[100px_1fr_70px_90px_80px_32px]' : 'grid-cols-[1fr_70px_90px_80px_32px]'} gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide pb-1`}>
                  {showItemTypes ? <span>{t.colType}</span> : null}<span>{t.colDescription}</span><span className="text-center">{t.colQty}</span><span className="text-right">{t.colUnitPrice}</span><span className="text-right">{t.colTotal}</span><span/>
                </div>
                {items.map(item => (
                  <div key={item.id} className={`grid ${showItemTypes ? 'grid-cols-[100px_1fr_70px_90px_80px_32px]' : 'grid-cols-[1fr_70px_90px_80px_32px]'} gap-2 items-center`}>
                    {showItemTypes ? (
                    <select value={item.item_type}
                      onChange={e => updateItem(item.id, 'item_type', e.target.value)}
                      className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                      {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    ) : null}
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

        {/* ── Fotos — uploads need a saved job_id, so the gallery only shows
            when editing an existing job; new jobs get a hint and land on the
            detail screen (which has the gallery) after save. */}
        {editId && business ? (
          <JobPhotosSection jobId={editId} businessId={business.id} canWrite />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <ImagePlus size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{full.dashboard.jobs.detail.photos.heading}</p>
            </div>
            <p className="text-sm text-gray-400">{full.dashboard.jobs.detail.photos.addAfterSave}</p>
          </div>
        )}

        {/* ── Notas (section hideable in job mode) */}
        {(isEditProposal || !fHidden('internal_notes') || customFieldsFor('notes').length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={15} className="text-primary"/>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.notesHeading}</p>
          </div>
          <div className="flex flex-col gap-3">
            {isEditProposal && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">{t.clientNoteLabel}</label>
                <textarea rows={4} placeholder={t.clientNotePlaceholder}
                  value={clientNotes} onChange={e => setClientNotes(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-y"/>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {isEditProposal ? t.internalNoteLabelProposal : jrl('internal_notes', t.internalNoteLabelJob)}
              </label>
              <textarea rows={4} placeholder={isEditProposal ? t.internalNotePlaceholderProposal : t.internalNotePlaceholderJob}
                value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-y"/>
            </div>
            {renderCustomFields('notes')}
          </div>
        </div>
        )}

        {/* ── Detalles adicionales — home for custom fields assigned to the
            'additional' section. Only rendered when at least one exists. */}
        {customFieldsFor('additional').length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              {locale === 'es' ? 'Detalles adicionales' : 'Additional details'}
            </p>
            <div className="flex flex-col gap-3">
              {renderCustomFields('additional')}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <Link
            href={editId ? `/dashboard/trabajos/${editId}` : '/dashboard/trabajos'}
            onClick={e => { e.preventDefault(); confirmDiscard(() => router.push(editId ? `/dashboard/trabajos/${editId}` : '/dashboard/trabajos')); }}
            className="flex-1"
          >
            <Button variant="secondary" fullWidth>{tc.buttons.cancel}</Button>
          </Link>
          <Button onClick={save} loading={saving} fullWidth>
            {editId ? tc.buttons.saveChanges : (isEditProposal ? t.submitCreateProposal : t.submitCreateJob)}
          </Button>
        </div>
      </div>

      <Modal
        open={quickClientOpen}
        onClose={() => setQuickClientOpen(false)}
        title={locale === 'es' ? 'Nuevo cliente' : 'New client'}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <Input
            label={locale === 'es' ? 'Nombre' : 'First name'}
            value={quickFirstName}
            onChange={e => setQuickFirstName(e.target.value)}
          />
          <Input
            label={locale === 'es' ? 'Apellido' : 'Last name'}
            value={quickLastName}
            onChange={e => setQuickLastName(e.target.value)}
          />
          <Input
            label={locale === 'es' ? 'Empresa' : 'Company'}
            value={quickCompany}
            onChange={e => setQuickCompany(e.target.value)}
          />
          <Input
            label={locale === 'es' ? 'Celular' : 'Cell'}
            value={quickPhone}
            onChange={e => setQuickPhone(formatPhoneInput(e.target.value))}
          />
          {quickError && <p className="text-sm text-red-600">{quickError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setQuickClientOpen(false)}>
              {tc.buttons.cancel}
            </Button>
            <Button onClick={saveQuickClient} loading={quickSaving}>
              {locale === 'es' ? 'Guardar' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Renders the right input for a custom job field by type. Values are always
 * stored/passed as strings (boolean → "true"/"false", date → ISO). Mirrors the
 * employee form's CustomFieldInput.
 */
function CustomFieldInput({
  template,
  value,
  onChange,
}: {
  template: FieldTemplate;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t: full } = useLang();
  const tc = full.common;
  const label = template.required ? `${template.field_label} *` : template.field_label;

  if (template.field_type === 'boolean') {
    // Three states — '', 'true', 'false'. Clicking the active button clears it
    // so the user can return to "unanswered".
    const yesActive = value === 'true';
    const noActive = value === 'false';
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${yesActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {tc.states.yes}
          </button>
          <button type="button" onClick={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${noActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {tc.states.no}
          </button>
        </div>
      </div>
    );
  }
  if (template.field_type === 'select' && template.field_options?.length) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none"
        >
          <option value="">—</option>
          {template.field_options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <Input
      label={label}
      type={template.field_type === 'date' ? 'date' : template.field_type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}
