'use client';

export const dynamic = 'force-dynamic';

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, MapPin, Calendar, Users, DollarSign, FileText, Search, Link2, ChevronDown, X, Lock, Eye, ImagePlus, Navigation, Loader2, AlertTriangle } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { CrewFinderPanel } from '@/modules/crewFinder/CrewFinderPanel';
import { isCustomRole, can } from '@amixos/shared/lib/permissions';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { JobPhotosSection, resizeImage } from '@/components/jobs/JobPhotosSection';
import { JOB_PHOTOS_BUCKET, MAX_PHOTOS_PER_JOB, jobPhotoPath, jobPhotoFilename } from '@amixos/shared/lib/jobPhotos';
import { parseHiddenFields, isJobFieldHidden, jobSectionHasVisibleField, JOB_FIELDS_ALWAYS_SHOWN, parseJobLayout, fieldsInSection, type JobSectionKey, type JobLayoutSection } from '@amixos/shared/lib/jobSections';
import { groupNumberString, localizeTemplates, parseFieldConfig, sanitizeNumberInput, splitMultiValue, toggleMultiOption } from '@amixos/shared/lib/fieldTemplates';
import { useDirty, useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import { clientPickerDisplay, searchClientsServer } from '@amixos/shared/lib/clientSearch';
import { usStateName } from '@amixos/shared/lib/usStates';
import { logAudit } from '@amixos/shared/lib/audit';
import { formatProjectDuration } from '@amixos/shared/lib/duration';
import { formatTime12h, formatPhoneInput, formatDateLong, todayLocalISO } from '@amixos/shared/lib/format';
import { detectJobConflicts, fetchJobsForConflictCheck, hasHardConflict, type ExistingAssignedJob, type JobConflict } from '@amixos/shared/lib/jobConflicts';
import { Modal } from '@/components/ui/Modal';
import { evaluateOperatingHours, normalizeOperatingHours } from '@amixos/shared/lib/operatingHours';
import { normalizeImageFiles } from '@/lib/imageFile';

interface Client { id: string; first_name: string; last_name: string; company: string | null; job_address?: string; city?: string; state?: string; contacts?: { name: string; role: string | null }[]; }
interface Employee { id: string; first_name: string; last_name: string; role: string; }

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'note' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
  field_config: { integerOnly?: boolean; multi?: boolean; thousands?: boolean } | null;
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
  const { business, user, currentRole, activeLocationId, myHomeLocationId, locations } = useApp();
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
  // Duplicate mode 'team': carry over ONLY client + crew/drivers — dates,
  // hours, notes, photos etc. start blank for the new visit.
  const teamOnly = !!duplicateId && searchParams.get('copy') === 'team';
  const sourceId = editId ?? duplicateId;
  // Origin (from/invoice/worker) passed in so that returning to the job detail
  // after save/cancel keeps its own back target (e.g. the invoice we came from).
  const backCtx = (() => {
    const f = searchParams.get('from');
    if (!f) return '';
    const parts = [`from=${f}`];
    const inv = searchParams.get('invoice'); if (inv) parts.push(`invoice=${inv}`);
    const w = searchParams.get('worker'); if (w) parts.push(`worker=${w}`);
    return `?${parts.join('&')}`;
  })();
  const isProposal = searchParams.get('modo') === 'propuesta';
  // Defense in depth: a role that can create jobs but not estimates
  // (e.g. field crew) must not deep-link into proposal mode. Drop to a plain
  // work order. Only for new creations — editing an existing record is gated
  // elsewhere by RLS, not by this capability.
  useEffect(() => {
    if (!sourceId && isProposal && currentRole && !can.createEstimate(currentRole)) {
      router.replace('/dashboard/trabajos/nuevo');
    }
  }, [sourceId, isProposal, currentRole, router]);

  // Field crew ("assigned-only" roles) get a simplified form: no branch picker
  // (auto = their branch) and no crew-visibility toggle. Their job is forced
  // visible-to-crew + self-assigned so they can actually see it (RLS 044/089
  // hides unpublished/unassigned jobs from field). Mirrors logFieldJob.
  const restrictedCreator = !!currentRole && !can.seeAllJobs(currentRole);
  // Crew-assignment rights (matches migration 164's job_assignments policy):
  // managers+ get the dispatcher tools; a field creator keeps self-assign on
  // their own job; office/viewer get nothing (they can't write job_assignments).
  const canAssign = can.assignWorkers(currentRole);
  // created_by of the job being edited — RLS (131/179) lets a member who can
  // CREATE jobs manage assignments on jobs they created, even without the
  // assignWorkers cap (field crew, office, custom roles).
  const [loadedCreatedBy, setLoadedCreatedBy] = useState<string | null>(null);
  // Who may pick lead/crew/drivers: the assignWorkers cap (dispatchers), a
  // field creator (self-assign flow), or any job-creator role staffing a job
  // it created (new job, or editing its own) — mirrors RLS 131/179.
  const creatorStaff =
    can.createJob(currentRole) && (!sourceId || (!!user && loadedCreatedBy === user.id));
  const canStaff = canAssign || restrictedCreator || creatorStaff;
  // Can this creator schedule / change status? Field crew without the toggle
  // may only RECORD completed work — status is locked to "completed".
  const canSchedule = can.scheduleJobs(currentRole);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);

  // Default a NEW job's branch to the active branch, else the user's own home
  // branch (so data auto-files to where they work even when viewing "All").
  useEffect(() => {
    if (sourceId || locationId || locations.length === 0) return;
    setLocationId(activeLocationId ?? myHomeLocationId ?? '');
  }, [sourceId, locations, activeLocationId, myHomeLocationId]);

  // Resolve the field creator's own employee row so we can self-assign them.
  useEffect(() => {
    // Resolve the creator's own employee row: field crew for the save-time
    // self-assign, worker-style creators for the lead default. Cheap single
    // query under the self-read policy — always fetch (gating on assignWorkers
    // broke the lead default for custom roles that got that capability).
    if (!business || !user) { setMyEmployeeId(null); return; }
    supabase.from('employees').select('id').eq('business_id', business.id).eq('user_id', user.id).limit(1).maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => setMyEmployeeId(data?.id ?? null));
  }, [business?.id, user?.id]);

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
  // True whenever the record carries an estimate_number, regardless of phase.
  // A work-phase estimate opens the JOB form (editIsProposal=false) but its
  // quote math (tax/discount) must still be preserved on save.
  const [editIsEstimateRecord, setEditIsEstimateRecord] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  // Branch this job belongs to. Defaults to the active branch (or the
  // business's default location) for new jobs; loaded from the row when editing.
  const [locationId, setLocationId] = useState('');
  // Crew visibility (migration 044). New jobs default to "Privado" — the
  // owner-side scheduler — and flip on when they're ready for the crew.
  const [publishedToCrew, setPublishedToCrew] = useState(false);
  const [status, setStatus] = useState<'posible' | 'scheduled' | 'in_progress' | 'completed'>('scheduled');
  // New jobs default to "completed" only for roles with the role-editor toggle
  // ("Mark jobs as completed by default") and for field creators (their flow
  // records finished work). Everyone else starts at "scheduled". Default only —
  // the status stays changeable where the role may.
  const defaultsCompleted = restrictedCreator || can.completedByDefault(currentRole);
  useEffect(() => {
    if (sourceId || !defaultsCompleted) return;
    setStatus('completed');
  }, [sourceId, defaultsCompleted]);
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
  const [workerNotes, setWorkerNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);
  const [manualWorkers, setManualWorkers] = useState<string[]>(['']);
  const [leadEmployeeId, setLeadEmployeeId] = useState<string | null>(null);

  // Whoever enters a NEW job defaults as its lead — "the person adding the job
  // leads it". Prefilled once, not forced: they can change or clear it in the
  // picker. Field creators are excluded (their save path self-assigns as lead).
  const leadDefaulted = useRef(false);
  useEffect(() => {
    if (leadDefaulted.current || sourceId || !creatorStaff || restrictedCreator) return;
    // Applies to EVERY role (dispatchers included) — whoever enters the job
    // defaults as its lead, provided they have a linked employee row.
    if (business?.job_crew_mode === false) return;
    if (!myEmployeeId || !employees.some((e) => e.id === myEmployeeId)) return;
    if (leadEmployeeId || assignedEmployees.length > 0) return;
    leadDefaulted.current = true;
    // Lead only — crew membership (paid hours) stays an explicit choice.
    setLeadEmployeeId(myEmployeeId);
  }, [sourceId, creatorStaff, canAssign, restrictedCreator, myEmployeeId, employees, leadEmployeeId, assignedEmployees, business?.job_crew_mode]);
  // Optional drivers — any employees paid extra driverHours (each) on top of
  // the job's total hours. Multi-select, like crew.
  const [driverEmployeeIds, setDriverEmployeeIds] = useState<string[]>([]);
  const [driverHours, setDriverHours] = useState('');
  const [driverDropdownOpen, setDriverDropdownOpen] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const driverDropdownRef = useRef<HTMLDivElement>(null);
  // Photos picked while CREATING a job — staged locally (nothing uploads if
  // the form is abandoned) and pushed to storage right after the insert, when
  // the job id exists. Edit mode uses the live JobPhotosSection gallery.
  const [pendingPhotos, setPendingPhotos] = useState<{ file: File; url: string }[]>([]);
  const pendingPhotoInputRef = useRef<HTMLInputElement>(null);

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
  const [crewFinderOpen, setCrewFinderOpen] = useState(false);
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

  // Materials & Labor section visibility. The toggle hides the whole section
  // for plain jobs (businesses that don't itemize). Proposals always keep it —
  // an estimate IS its line items + total, and save requires at least one.
  const showMaterials = isEditProposal || showItemTypes;

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

  // Every section interleaves standard and custom fields in the saved layout
  // order (Ajustes → Trabajos → drag to reorder), so a custom field placed
  // between standard ones renders exactly where the user put it. Composite
  // blocks ride on their anchor key: branch picker with 'client_id', the
  // proposal-dates / status+priority block on 'priority', map-link+coords on
  // 'coordinates', the city/state row on the first of job_city/job_state,
  // and the whole lead/crew/drivers block on 'assigned_workers'.
  const renderJobField = (k: string): React.ReactNode => {
    if (k === 'client_id') {
      return (
        <Fragment key={k}>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{jrl('client_id', t.clientLabel)}</label>
            <div className="relative" ref={clientDropdownRef}>
              <button type="button" onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary">
                {selectedClient ? (
                  (() => {
                    const d = clientPickerDisplay(selectedClient);
                    return (
                      <span className="text-ink truncate">
                        {d.top}
                        {d.sub && <span className="text-faint"> · {d.sub}</span>}
                      </span>
                    );
                  })()
                ) : (
                  <span className="text-faint">{t.clientPlaceholder}</span>
                )}
                <ChevronDown size={14} className="text-faint shrink-0 ml-2"/>
              </button>
              {clientDropdownOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-border-soft">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"/>
                      <input autoFocus type="text" placeholder={t.clientSearchPlaceholder}
                        value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                        className="w-full rounded-lg border border-border pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <button type="button" onClick={() => handleClientChange('')}
                      className={`w-full text-left px-4 py-3 text-base hover:bg-surface transition-colors ${!clientId ? 'text-primary font-medium' : 'text-muted'}`}>
                      {t.clientNone}
                    </button>
                    {(pickerResults ?? filteredClients).map(c => {
                      const ct = matchedContactOf(c);
                      const { top, sub } = clientPickerDisplay(c);
                      return (
                        <button type="button" key={c.id} onClick={() => { ensureClientInList(c); handleClientChange(c.id, c); }}
                          className={`w-full text-left px-4 py-3 hover:bg-surface transition-colors ${clientId === c.id ? 'bg-primary/5' : ''}`}>
                          <span className={`block text-base truncate ${clientId === c.id ? 'text-primary font-medium' : 'text-ink'}`}>
                            {top}
                            {sub && <span className="text-faint ml-1 text-sm">· {sub}</span>}
                          </span>
                          {ct && (
                            <span className="block text-xs text-primary truncate mt-0.5">{ct.name}{ct.role ? `  ·  ${ct.role}` : ''}</span>
                          )}
                        </button>
                      );
                    })}
                    {(pickerResults ?? filteredClients).length === 0 && (
                      <p className="px-4 py-3 text-xs text-faint text-center">{t.clientNoResults}</p>
                    )}
                  </div>
                  {can.createClient(currentRole) && (
                    <button type="button" onClick={openQuickClient}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors border-t border-border-soft">
                      {locale === 'es' ? '+ Crear cliente nuevo' : '+ Create new client'}
                    </button>
                  )}
                </div>
              )}
              {clientId && (
                <button type="button" onClick={() => handleClientChange('')}
                  className="absolute right-10 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-border-soft transition-colors">
                  <X size={12} className="text-faint"/>
                </button>
              )}
            </div>
          </div>

          {/* Branch picker — multi-location businesses only. Hidden for field
             crew: their job auto-uses their own branch. */}
          {locations.length >= 2 && !restrictedCreator && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{locale === 'es' ? 'Ubicación' : 'Location'}</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">{locale === 'es' ? 'Sin ubicación' : 'No location'}</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
        </Fragment>
      );
    }
    if (k === 'priority') {
      return (
        <Fragment key={k}>
          {isEditProposal ? (
            /* Proposal: issue + expiry, then project start/finish + est. hours */
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t.issueDateLabel} type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}/>
                <Input label={t.expiryDateLabel} type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}/>
              </div>
              <div className={`grid ${fHidden('end_date') ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                <Input label={t.projectStartLabel} type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}/>
                {!fHidden('end_date') && (
                  <Input label={t.endDateLabel} type="date" value={endDate} onChange={e => setEndDate(e.target.value)}/>
                )}
              </div>
              {totalTimeText && (
                <p className="text-xs text-muted text-right">
                  {t.totalTimeLabel}: <span className="font-semibold text-primary">{totalTimeText}</span>
                </p>
              )}
            </>
          ) : canSchedule ? (
            /* Job: status + priority. Hidden entirely for field crew who can
               only log completed work (no scheduling → no status/priority). */
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-ink">{t.statusLabel}</label>
                {/* Statuses the form can't represent (invoiced/sent/accepted/…)
                   are shown READ-ONLY — editing must not silently downgrade an
                   invoiced job. Change those from the job detail's pipeline. */}
                {(!loadedStatus || ['posible', 'scheduled', 'in_progress', 'completed'].includes(loadedStatus)) ? (
                  <select value={status} onChange={e => setStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                    <option value="posible">{tStatuses.posible}</option>
                    <option value="scheduled">{tStatuses.scheduled}</option>
                    <option value="in_progress">{tStatuses.in_progress}</option>
                    <option value="completed">{tStatuses.completed}</option>
                  </select>
                ) : (
                  <div className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-muted">
                    {(tStatuses as Record<string, string>)[loadedStatus] ?? loadedStatus}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-ink">{t.priorityLabel}</label>
                <select value={priority} onChange={e => setPriority(e.target.value as any)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                  <option value="low">{tPriorities.low}</option>
                  <option value="normal">{tPriorities.normal}</option>
                  <option value="high">{tPriorities.high}</option>
                  <option value="urgent">{tPriorities.urgent}</option>
                </select>
              </div>
            </div>
          ) : null}
        </Fragment>
      );
    }
    if (k === 'description') {
      if (fHidden('description')) return null;
      return (
        <div key={k} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">{jrl('description', t.descriptionLabel)}</label>
          <textarea rows={5} placeholder={t.descriptionPlaceholder}
            value={description} onChange={e => setDescription(e.target.value)}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary resize-y"/>
        </div>
      );
    }
    // ── Location section keys ──
    if (k === 'coordinates') {
      if (fHidden('coordinates')) return null;
      return (
        <Fragment key={k}>
          {/* "Use my location" FIRST — the most common action when creating a
             job on-site (it also auto-runs for brand-new jobs). */}
          <button type="button" onClick={useMyLocation} disabled={gettingLocation}
            className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60">
            {gettingLocation
              ? <Loader2 size={15} className="animate-spin"/>
              : <Navigation size={15}/>}
            {gettingLocation ? t.gettingLocation : t.useMyLocation}
          </button>

          {/* Map link paste */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink flex items-center gap-1.5">
              <Link2 size={13} className="text-faint"/> {jrl('coordinates', t.mapLinkLabel)}
            </label>
            <input type="url" placeholder={t.mapLinkPlaceholder}
              value={mapLink} onChange={e => parseMapLink(e.target.value)}
              className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary"/>
            {mapLink && !mapLink.includes('google') && !mapLink.includes('apple') && !mapLink.includes('goo.gl') && (
              <p className="text-xs text-amber-500">{t.mapLinkHint}</p>
            )}
          </div>

          {/* Coordinates — lat, lng (editable; also auto-filled by the map
              link paste and "Use my location"). */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink flex items-center gap-1.5">
              <Navigation size={13} className="text-faint"/> {t.coordinatesLabel}
            </label>
            <input type="text" inputMode="decimal" placeholder={t.coordinatesPlaceholder}
              value={coordsText} onChange={e => onCoordsChange(e.target.value)}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary ${coordsInvalid ? 'border-red-300' : 'border-border'}`}/>
            {coordsInvalid && (
              <p className="text-xs text-red-500">{t.coordinatesInvalid}</p>
            )}
          </div>
          <div className="border-t border-border-soft pt-3"/>
        </Fragment>
      );
    }
    if (k === 'job_address') {
      if (fHidden('job_address')) return null;
      return (
        <Input key={k} label={jrl('job_address', t.addressLabel)} placeholder={t.addressPlaceholder} value={address}
          onChange={e => setAddress(e.target.value)}/>
      );
    }
    if (k === 'job_city' || k === 'job_state') {
      // City + state share one row — rendered at the first of the two keys
      // in layout order; the second returns null.
      if (fHidden('job_city') && fHidden('job_state')) return null;
      const locKeys = fieldsInSection(jobLayout, 'location');
      const first = locKeys.find(x => x === 'job_city' || x === 'job_state');
      if (k !== first) return null;
      return (
        <div key={k} className={`grid ${!fHidden('job_city') && !fHidden('job_state') ? 'grid-cols-[1fr_120px]' : 'grid-cols-1'} gap-3`}>
          {!fHidden('job_city') && (
          <Input label={jrl('job_city', t.cityLabel)} placeholder={t.cityPlaceholder} value={city}
            onChange={e => setCity(e.target.value)}/>
          )}
          {!fHidden('job_state') && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{jrl('job_state', t.stateLabel)}</label>
            <select value={state} onChange={e => setState(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              <option value="">{t.stateNone}</option>
              {US_STATES.map(s => <option key={s} value={s}>{usStateName(s, locale)}</option>)}
            </select>
          </div>
          )}
        </div>
      );
    }
    // ── Schedule section keys ──
    if (k === 'scheduled_date') {
      // "Date" is a single toggle that shows/hides both start AND end date.
      // Hiding 'end_date' (Ajustes → Trabajos sub-toggle) collapses it to ONE
      // full-width picker for one-day-job businesses.
      if (fHidden('scheduled_date')) return null;
      const singleDate = fHidden('end_date');
      return (
        <div key={k} className={`grid ${singleDate ? 'grid-cols-1' : 'grid-cols-2'} gap-3 mt-3`}>
          <Input label={jrl('scheduled_date', singleDate ? t.dateFieldLabel : t.dateLabel)} type="date" value={scheduledDate}
            onChange={e => setScheduledDate(e.target.value)}/>
          {!singleDate && (
            <Input label={t.endDateLabel} type="date" value={endDate}
              onChange={e => setEndDate(e.target.value)}/>
          )}
        </div>
      );
    }
    if (k === 'time_start') {
      // "Time" is a single toggle gating start time, end time AND the
      // all-day switch (which only makes sense when times are shown).
      if (fHidden('time_start')) return null;
      return (
        <Fragment key={k}>
          <div className="flex items-center justify-between mt-4">
            <label className="text-sm font-medium text-ink">{t.allDayLabel}</label>
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
        </Fragment>
      );
    }
    if (k === 'total_hours') {
      // Total hours — auto from start/end (read-only) when both times are
      // set, else manual entry. Credited to each worker in Reports.
      if (fHidden('total_hours')) return null;
      return (
        <div key={k} className="mt-3">
          <label className="block text-sm font-medium text-ink mb-2">{jrl('total_hours', t.totalHoursLabel)}</label>
          {bothTimesSet ? (
            <div className="flex items-center justify-between rounded-2xl border border-border bg-border-soft px-4 py-3 text-muted">
              <span>{computedHours != null ? `${computedHours} h` : '—'}</span>
              <span className="text-xs text-faint">{t.totalHoursAutoHint}</span>
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
          <p className="text-xs text-faint mt-1.5">{t.totalHoursHint}</p>
        </div>
      );
    }
    // ── Notes section key ──
    if (k === 'worker_notes') {
      if (isEditProposal) return null; // proposals don't carry crew notes
      // Show when it has content even if the field is hidden, so imported/stray
      // worker notes can always be edited or cleared.
      if (fHidden('worker_notes') && !workerNotes.trim()) return null;
      return (
        <div key={k} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">{jrl('worker_notes', t.workerNoteLabel)}</label>
          <textarea rows={3} placeholder={t.workerNotePlaceholder}
            value={workerNotes} onChange={e => setWorkerNotes(e.target.value)}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary resize-y"/>
        </div>
      );
    }
    if (k === 'internal_notes') {
      if (restrictedCreator) return null; // office-only note
      if (!isEditProposal && fHidden('internal_notes')) return null;
      return (
        <div key={k} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">
            {isEditProposal ? t.internalNoteLabelProposal : jrl('internal_notes', t.internalNoteLabelJob)}
          </label>
          <textarea rows={4} placeholder={isEditProposal ? t.internalNotePlaceholderProposal : t.internalNotePlaceholderJob}
            value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary resize-y"/>
        </div>
      );
    }
    if (k.startsWith('custom:')) {
      const tpl = jobTemplates.find(tp => `custom:${tp.id}` === k);
      return tpl ? (
        <CustomFieldInput
          key={tpl.id}
          template={tpl}
          value={customFields[tpl.field_key] ?? ''}
          onChange={v => setCustomFields(f => ({ ...f, [tpl.field_key]: v }))}
        />
      ) : null;
    }
    return null;
  };
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
      // Keyset (by id) — offset .range() re-scans under RLS and stalls the
      // create form once a business has thousands of clients.
      // Each dataset lands as soon as ITS fetch finishes — the crew pickers
      // must not wait behind a multi-page clients/contacts crawl, which made
      // the Workers section invisible for seconds on big businesses. Clients
      // still wait for contacts (they merge into the rows).
      const empPromise = (async () => {
        // employees_roster (view, migration 178): names-only roster readable by
        // every member — the pickers must work for field/office roles that have
        // no Employees permission (pay etc. stays behind public.employees RLS).
        // Fallback: if the view is missing/stale in this DB, roles with the
        // Employees permission can still read the table directly.
        const fromTable = (table: string) =>
          fetchAllById<Employee>((afterId, pageSize) => {
            let q = supabase.from(table).select('id, first_name, last_name, role, show_in_roster')
              .eq('business_id', businessId).eq('active', true).order('id', { ascending: true }).limit(pageSize);
            if (afterId) q = q.gt('id', afterId);
            return q;
          });
        let emp: Employee[] = [];
        try {
          emp = await fromTable('employees_roster');
        } catch { /* view missing — fall through */ }
        if (emp.length === 0) emp = await fromTable('employees').catch(() => [] as Employee[]);
        // Roster flag (migration 128): office members opt out of crew pickers.
        // Alphabetical by name so the crew / driver / lead pickers read cleanly.
        setEmployees(
          emp
            .filter(e => (e as { show_in_roster?: boolean | null }).show_in_roster !== false)
            .sort((a, b) => `${a.first_name} ${a.last_name}`.trim().localeCompare(`${b.first_name} ${b.last_name}`.trim(), undefined, { sensitivity: 'base' })),
        );
      })();

      // Custom job fields config (bounded per-business table — no pagination).
      const tplPromise = supabase.from('job_field_templates')
        .select('*').eq('business_id', businessId).order('sort_order')
        .then(({ data: tmpls }: { data: FieldTemplate[] | null }) => {
          setJobTemplates(localizeTemplates((tmpls ?? []) as FieldTemplate[], locale));
        });

      const clientsPromise = Promise.all([
        fetchAllById<Client>((afterId, pageSize) => {
          let q = supabase.from('clients').select('id, first_name, last_name, company, address, city, state')
            .eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
          if (afterId) q = q.gt('id', afterId);
          return q;
        }),
        // Client contacts — so the picker can find an account by a contact's name.
        fetchAllById<{ id: string; client_id: string; name: string; role: string | null }>((afterId, pageSize) => {
          let q = supabase.from('client_contacts').select('id, client_id, name, role')
            .eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
          if (afterId) q = q.gt('id', afterId);
          return q;
        }).catch(() => [] as { id: string; client_id: string; name: string; role: string | null }[]),
      ]).then(([cl, contactRows]) => {
        const contactsByClient = new Map<string, { name: string; role: string | null }[]>();
        for (const ct of contactRows) {
          (contactsByClient.get(ct.client_id) ?? contactsByClient.set(ct.client_id, []).get(ct.client_id)!).push({ name: ct.name, role: ct.role });
        }
        setClients(cl.map(c => ({ ...c, contacts: contactsByClient.get(c.id) })));
      });

      await Promise.all([empPromise, tplPromise, clientsPromise]);

      if (sourceId) {
        const [{ data: job }, { data: jobItems }, { data: assigns }] = await Promise.all([
          supabase.from('jobs').select('*').eq('id', sourceId).single(),
          supabase.from('job_items').select('*').eq('job_id', sourceId).order('created_at'),
          supabase.from('job_assignments').select('*').eq('job_id', sourceId),
        ]);
        if (job && teamOnly) {
          setLoadedCreatedBy(job.created_by ?? null);
          setClientId(job.client_id ?? '');
          if (job.location_id) setLocationId(job.location_id);
          setDriverEmployeeIds(job.driver_employee_ids ?? []);
        } else if (job) {
          setLoadedCreatedBy(job.created_by ?? null);
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
          setLocationId(job.location_id || '');
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
          setWorkerNotes(job.worker_notes || '');
          // Prefill custom field values (coerce each to a string for the inputs).
          if (job.custom_fields && typeof job.custom_fields === 'object') {
            const cf: Record<string, string> = {};
            for (const [k, v] of Object.entries(job.custom_fields as Record<string, unknown>)) {
              cf[k] = String(v ?? '');
            }
            setCustomFields(cf);
          }
          const wasEstimate = !!job.estimate_number;
          // Estimates and jobs are ONE record — the form styles itself by
          // PHASE, not by estimate_number alone. In the quote phase the
          // estimate form applies (issue/expiry, no crew/schedule); once
          // accepted onward the same record opens the full job form so
          // workers, dates and hours become editable.
          const quotePhase = ['proposal', 'sent', 'declined', 'cancelled'].includes(job.status);
          setEditIsProposal(wasEstimate && quotePhase);
          setEditIsEstimateRecord(wasEstimate);
          if (wasEstimate) {
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
        if (jobItems && jobItems.length > 0 && !teamOnly) {
          setItems(jobItems.map((i: any) => ({
            id: i.id,
            item_type: i.item_type || 'other',
            description: i.description || '',
            quantity: i.quantity || 1,
            unit_price: i.unit_price || 0,
          })));
        }
        if (assigns) {
          setAssignedEmployees(assigns.filter((a: any) => a.employee_id && a.crew !== false).map((a: any) => a.employee_id));
          const manual = assigns.filter((a: any) => !a.employee_id && a.worker_name).map((a: any) => a.worker_name);
          if (manual.length > 0) setManualWorkers(manual);
          const lead = assigns.find((a: any) => a.is_lead && a.employee_id);
          if (lead) setLeadEmployeeId(lead.employee_id);
        }
        setLoadingEdit(false);
      }
    };
    loadData();
  }, [business, locale]);

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

  const handleClientChange = (id: string, row?: Client) => {
    setClientId(id);
    setClientDropdownOpen(false);
    setClientSearch('');
    // The row param covers a server-search pick that isn't in `clients` yet
    // (state update from ensureClientInList lands after this runs).
    const client = row ?? clients.find(c => c.id === id);
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

  // Server-side picker search while the local list is still downloading —
  // see the mobile twin for rationale. Falls back to local filtering.
  const [pickerResults, setPickerResults] = useState<Client[] | null>(null);
  useEffect(() => {
    if (!clientDropdownOpen || !business || clients.length > 0) { setPickerResults(null); return; }
    let cancelled = false;
    const h = setTimeout(() => {
      searchClientsServer<Client>(supabase, business.id, clientSearch, 'id, first_name, last_name, company, address, city, state')
        .then((rows) => { if (!cancelled) setPickerResults(rows as Client[]); })
        .catch(() => { if (!cancelled) setPickerResults(null); });
    }, clientSearch.trim() ? 250 : 0);
    return () => { cancelled = true; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientDropdownOpen, clientSearch, business?.id, clients.length > 0]);
  const ensureClientInList = (cl: Client) => {
    setClients(prev => (prev.some(c => c.id === cl.id) ? prev : [...prev, cl]));
  };

  const filteredClients = clientSearch
    ? clients.filter(c => {
        const q = clientSearch.toLowerCase();
        const own = [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase();
        if (own.includes(q)) return true;
        // Also match on the client's contacts — search a contact, find the account.
        return (c.contacts ?? []).some(ct => ct.name.toLowerCase().includes(q) || (ct.role ?? '').toLowerCase().includes(q));
      })
    : clients;

  // The contact that matched (when matched via a contact, not the client's own
  // name) — shown under the client so you know who you searched for.
  const matchedContactOf = (c: Client) => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return null;
    const own = [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase();
    if (own.includes(q)) return null;
    return (c.contacts ?? []).find(ct => ct.name.toLowerCase().includes(q) || (ct.role ?? '').toLowerCase().includes(q)) ?? null;
  };

  const selectedClient = clients.find(c => c.id === clientId);

  // Accent-insensitive: "juan" should match "Jùan" (strip diacritics both sides).
  const deaccent = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filterEmployeesByName = (list: typeof employees, query: string) => {
    const q = deaccent(query.trim());
    if (!q) return list;
    return list.filter(e => deaccent(`${e.first_name} ${e.last_name}`).includes(q));
  };
  const filteredLeadEmployees = filterEmployeesByName(employees, leadSearch);
  // Crew picker excludes the current lead — the lead is always part of the
  // crew at save time but is shown in its own picker, not here.
  const crewEmployees = employees.filter(
    e => business?.job_crew_mode !== false ? e.id !== leadEmployeeId : true,
  );
  const filteredCrewEmployees = filterEmployeesByName(crewEmployees, crewSearch);
  const leadEmployee = employees.find(e => e.id === leadEmployeeId) ?? null;

  // ─── Double-booking detection ──────────────────────────────────────────────
  // Warn (never block) when an assigned person already has an overlapping job.
  // Fetch the jobs sharing this date span once per date change; recompute the
  // conflicts cheaply whenever the crew/drivers/times change.
  const [conflictJobs, setConflictJobs] = useState<ExistingAssignedJob[]>([]);
  useEffect(() => {
    if (!business || !scheduledDate) { setConflictJobs([]); return; }
    let cancelled = false;
    fetchJobsForConflictCheck(supabase, business.id, scheduledDate, endDate || scheduledDate)
      .then(js => { if (!cancelled) setConflictJobs(js); })
      .catch(() => { if (!cancelled) setConflictJobs([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, scheduledDate, endDate]);

  const assignedPeople = useMemo(() => {
    const ids = new Set<string>([...assignedEmployees, ...driverEmployeeIds]);
    return employees.filter(e => ids.has(e.id)).map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}`.trim() }));
  }, [assignedEmployees, driverEmployeeIds, employees]);

  const conflicts = useMemo(() => detectJobConflicts({
    newJob: { scheduledDate: scheduledDate || null, endDate: endDate || null, allDay, timeStart: timeStart || null, timeEnd: timeEnd || null },
    newJobId: editId,
    assigned: assignedPeople,
    existingJobs: conflictJobs,
  }), [scheduledDate, endDate, allDay, timeStart, timeEnd, assignedPeople, conflictJobs, editId]);
  const hardConflicts = conflicts.filter(c => c.severity === 'hard');
  const softConflicts = conflicts.filter(c => c.severity === 'soft');
  const conflictWhen = (c: JobConflict) => c.allDay ? t.conflictAllDay : c.timeLabel;
  const conflictLine = (c: JobConflict) => {
    const when = conflictWhen(c);
    return `${c.employeeName} · ${c.jobTitle || t.conflictUntitled} · ${formatDateLong(c.jobDate, locale)}${when ? ` (${when})` : ''}`;
  };

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
      void alertMessage({ message: t.locationError, destructive: true });
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
        void alertMessage({ message: err.code === err.PERMISSION_DENIED ? t.locationDenied : t.locationError, destructive: true });
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Auto-fill GPS coords when CREATING a job — quiet: denied permission /
  // failure just skips. Never runs for edit or duplicate (sourceId — those may
  // already carry a location), and never overwrites coords the user
  // typed/pasted while the fix was resolving.
  const coordsTextRef = useRef('');
  useEffect(() => { coordsTextRef.current = coordsText; }, [coordsText]);
  useEffect(() => {
    if (sourceId) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled || coordsTextRef.current.trim()) return;
        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
        const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        setJobLat(lat);
        setJobLng(lng);
        setCoordsText(`${lat}, ${lng}`);
        setCoordsInvalid(false);
      },
      () => { /* quiet — the user can still click "Usar mi ubicación" */ },
      { enableHighAccuracy: true, timeout: 10000 },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const toggleEmployee = (id: string) => {
    // Removing the lead from the crew is allowed — they stay lead (unpaid on
    // this job); the save path writes them as a crew=false assignment row.
    setAssignedEmployees(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  // The job lead lives in its own picker. Leading is NOT crew membership: a
  // lead who should also be PAID for the job must be checked in the crew too
  // (e.g. the owner leads without billing hours). Clearing leaves nobody lead.
  const setLead = (id: string) => {
    setLeadEmployeeId(id || null);
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

  const addPendingPhotos = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = await normalizeImageFiles(Array.from(ev.target.files ?? []));
    if (files.length) {
      setPendingPhotos(prev =>
        [...prev, ...files.map(file => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS_PER_JOB),
      );
    }
    ev.target.value = '';
  };

  const removePendingPhoto = (url: string) => {
    URL.revokeObjectURL(url);
    setPendingPhotos(prev => prev.filter(p => p.url !== url));
  };

  // Upload the staged photos once the job row exists (same resize + path +
  // metadata as the detail gallery). A failed photo never blocks the save —
  // the detail page's gallery is always there to retry.
  const uploadPendingPhotos = async (jobId: string) => {
    let order = 0;
    for (const p of pendingPhotos) {
      try {
        const blob = await resizeImage(p.file);
        const path = jobPhotoPath(business!.id, jobId, jobPhotoFilename('jpg'));
        const { error: upErr } = await supabase.storage
          .from(JOB_PHOTOS_BUCKET)
          .upload(path, blob, { upsert: false, contentType: 'image/jpeg' });
        if (upErr) continue;
        await supabase.from('job_photos').insert({
          business_id: business!.id,
          job_id: jobId,
          storage_path: path,
          sort_order: order++,
          created_by: user?.id ?? null,
        });
      } catch {
        /* keep going — remaining photos still upload */
      }
      URL.revokeObjectURL(p.url);
    }
  };

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
        // 'Fecha' is ONE requirable unit covering start AND end date
        // (jobSections: scheduled_date represents both pickers).
        scheduled_date: scheduledDate && (fHidden('end_date') || endDate) ? 'x' : '',
        time_start: timeStart,
        time_end: timeEnd,
        total_hours: effectiveTotalHours != null ? 'x' : '',
        assigned_workers: assignedEmployees.length ? 'x' : '',
        internal_notes: internalNotes,
      };
      const missing = JOB_REQUIRABLE.filter(f => jobReq[f.key] && !fHidden(f.key) && !(restrictedCreator && f.key === 'internal_notes') && !(f.key === 'assigned_workers' && (business?.job_crew_mode === false || !canStaff)) && !String(fieldVal[f.key] ?? '').trim()).map(f => f.label);
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
    // Double-booking gate — hard conflicts (all-day overlap / colliding times)
    // ask for confirmation; soft same-day notes never block the save.
    if (hasHardConflict(conflicts)) {
      const ok = await confirm({
        title: t.conflictTitle,
        message: `${t.conflictConfirmMessage}\n\n${hardConflicts.map(c => `• ${conflictLine(c)}`).join('\n')}`,
        confirmText: t.conflictSaveAnyway,
        cancelText: t.conflictGoBack,
        destructive: true,
      });
      if (!ok) return;
    }
    setSaving(true); setError('');

    try {
      if (isEditProposal) {
        const proposalData: any = {
          client_id: clientId || null,
          location_id: locationId || null,
          title: title.trim(),
          description: description.trim() || null,
          notes: clientNotes.trim() || null,
          internal_notes: internalNotes.trim() || null,
          worker_notes: workerNotes.trim() || null,
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
          end_date: fHidden('end_date') ? null : (endDate || null),
          published_to_crew: restrictedCreator ? true : publishedToCrew,
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

        if (!editId && pendingPhotos.length) await uploadPendingPhotos(finalJobId);

        router.push(`/dashboard/trabajos/${finalJobId}${backCtx}`);
      } else {
        const jobData: any = {
          client_id: clientId || null,
          location_id: locationId || null,
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
          end_date: fHidden('end_date') ? null : (endDate || null),
          all_day: allDay,
          time_start: allDay ? null : (timeStart || null),
          time_end: allDay ? null : (timeEnd || null),
          total_hours: effectiveTotalHours,
          driver_employee_ids: driverEmployeeIds,
          driver_hours: driverEmployeeIds.length && driverHours.trim() ? parseFloat(driverHours) : null,
          internal_notes: internalNotes.trim() || null,
          worker_notes: workerNotes.trim() || null,
          total_amount: subtotal,
          published_to_crew: restrictedCreator ? true : publishedToCrew,
          custom_fields: customFields,
        };
        // Converted estimate: keep the quote math. Tax/discount aren't shown
        // in the job form, and writing the bare item subtotal as the total
        // would silently change the price the client accepted.
        if (editIsEstimateRecord) {
          jobData.subtotal_amount = +subtotal.toFixed(2);
          jobData.tax_amount = +taxAmt.toFixed(2);
          jobData.total_amount = +total.toFixed(2);
        }

        let finalJobId: string;
        if (editId) {
          // Preserve the ORIGINAL status unless the user actually changed the
          // dropdown. The form only represents posible/scheduled/in_progress/
          // completed, so statuses like `invoiced`/`sent`/`accepted` load as
          // "scheduled" — writing that back would silently downgrade the job.
          // Compare against the loaded status mapped the same way to tell a real
          // edit from a no-op, then write the true original when untouched.
          const mappedLoaded = loadedStatus && ['in_progress', 'posible', 'completed'].includes(loadedStatus)
            ? loadedStatus : 'scheduled';
          const userChangedStatus = status !== mappedLoaded;
          const statusToWrite = userChangedStatus ? status : (loadedStatus ?? status);
          const jobUpdate: any = { ...jobData, status: statusToWrite };
          if (userChangedStatus) {
            const nowIso = new Date().toISOString();
            if (statusToWrite === 'scheduled') jobUpdate.scheduled_at = nowIso;
            else if (statusToWrite === 'in_progress') jobUpdate.in_progress_at = nowIso;
            else if (statusToWrite === 'completed') jobUpdate.completed_at = nowIso;
          }
          const { error: jobErr } = await supabase.from('jobs').update(jobUpdate).eq('id', editId);
          if (jobErr) throw new Error(jobErr.message);
          finalJobId = editId;
        } else {
          // Stamp the pipeline timestamp(s) for the INITIAL status so the
          // stepper shows a date under each reached step — previously a job
          // created straight as "scheduled" had a blank scheduled_at until it
          // was bounced through in_progress. Backfill earlier linear steps too.
          const nowIso = new Date().toISOString();
          const createStamps: Record<string, string> = {};
          if (status === 'scheduled' || status === 'in_progress' || status === 'completed') createStamps.scheduled_at = nowIso;
          if (status === 'in_progress' || status === 'completed') createStamps.in_progress_at = nowIso;
          if (status === 'completed') { createStamps.completed_at = nowIso; createStamps.completed_date = todayLocalISO(); }
          const { data: job, error: jobErr } = await supabase.from('jobs').insert({
            business_id: business!.id, status, created_by: user?.id ?? null, ...jobData, ...createStamps,
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
        const assignments: any[] = [];
        assignedEmployees.forEach(empId => {
          const emp = employees.find(e => e.id === empId);
          if (emp) assignments.push({
            job_id: finalJobId, employee_id: empId,
            worker_name: `${emp.first_name} ${emp.last_name}`,
            is_lead: empId === leadEmployeeId,
            crew: true,
          });
        });
        // A lead OUTSIDE the crew gets a crew=false row: shown as lead
        // everywhere, credited zero hours in payroll (migration 189).
        if (leadEmployeeId && !assignments.some(a => a.is_lead)) {
          const lead = employees.find(e => e.id === leadEmployeeId);
          if (lead) assignments.push({
            job_id: finalJobId, employee_id: leadEmployeeId,
            worker_name: `${lead.first_name} ${lead.last_name}`,
            is_lead: true,
            crew: false,
          });
        }
        manualWorkers.filter(w => w.trim()).forEach(name => {
          assignments.push({ job_id: finalJobId, worker_name: name.trim() });
        });
        // Field creator: self-assign so they can see their own job (RLS 044/089
        // requires assigned + published for field reads) and become the lead if
        // none was picked — "the person logging the job is the lead".
        if (restrictedCreator && !editId) {
          const alreadyLead = assignments.some(a => a.is_lead);
          const creatorName = (user?.name ?? '').trim();
          if (myEmployeeId) {
            const mine = assignments.find(a => a.employee_id === myEmployeeId);
            if (mine) {
              // Creator already picked himself as crew — promote that row so
              // the job still gets a lead ("the person logging it is the lead").
              if (!alreadyLead) mine.is_lead = true;
            } else {
              assignments.push({ job_id: finalJobId, employee_id: myEmployeeId, worker_name: creatorName, is_lead: !alreadyLead, crew: true });
            }
          } else if (!alreadyLead && creatorName) {
            // No linked employee record yet (e.g. an invite not yet reconciled)
            // — still record the creator's NAME as lead so it's never blank.
            assignments.push({ job_id: finalJobId, worker_name: creatorName, is_lead: true, crew: true });
          }
        }
        if (assignments.length > 0) {
          await supabase.from('job_assignments').insert(assignments);
        }

        if (!editId && pendingPhotos.length) await uploadPendingPhotos(finalJobId);

        router.push(`/dashboard/trabajos/${finalJobId}${backCtx}`);
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
          href={sourceId ? `/dashboard/trabajos/${sourceId}${backCtx}` : '/dashboard/trabajos'}
          onClick={e => { e.preventDefault(); confirmDiscard(() => router.push(sourceId ? `/dashboard/trabajos/${sourceId}${backCtx}` : '/dashboard/trabajos')); }}
          className="p-2 rounded-xl hover:bg-border-soft transition-colors"
        >
          <ArrowLeft size={18} className="text-muted"/>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-ink">{heading}</h1>
          <p className="text-xs text-faint">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">

        {/* ── Información general */}
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
          <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-4">{t.generalInfo}</p>
          <div className="flex flex-col gap-3">
            <Input label={isEditProposal ? t.titleLabelProposal : t.titleLabelJob}
              placeholder={t.titlePlaceholder}
              value={title} onChange={e => setTitle(e.target.value)}/>
            {/* Standard + custom fields, interleaved in saved layout order. */}
            {fieldsInSection(jobLayout, 'general').map(renderJobField)}
          </div>
        </div>

        {/* ── Ubicación — shown for jobs AND estimates (the work has a place
            even at quote time). proposalData persists it for estimates. */}
        {(secVisible('location') || customFieldsFor('location').length > 0) && (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">{t.locationHeading}</p>
            </div>
            <div className="flex flex-col gap-3">
              {/* Standard + custom fields, interleaved in saved layout order. */}
              {fieldsInSection(jobLayout, 'location').map(renderJobField)}
            </div>
          </div>
        )}

        {/* ── Horario (job mode only) */}
        {!isEditProposal && (secVisible('schedule') || customFieldsFor('schedule').length > 0) && (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">{t.scheduleHeading}</p>
            </div>
            {/* Standard + custom fields, interleaved in saved layout order.
                Customs get an mt-3 wrapper — this card body isn't a gap
                container like the other sections. */}
            {fieldsInSection(jobLayout, 'schedule').map(k =>
              k.startsWith('custom:') ? <div key={k} className="mt-3">{renderJobField(k)}</div> : renderJobField(k)
            )}

            {ohStatus && ohStatus.status !== 'ok' && (
              <p className="text-xs text-amber-600 mt-3">
                ⚠ {ohStatus.status === 'closed'
                  ? t.outOfHoursClosedNote
                  : `${t.outOfHoursNote} · ${formatTime12h(ohStatus.day.start)}–${formatTime12h(ohStatus.day.end)}`}
              </p>
            )}

            {totalTimeText && (
              <p className="text-xs text-muted text-right mt-3">
                {t.totalTimeLabel}: <span className="font-semibold text-primary">{totalTimeText}</span>
              </p>
            )}
          </div>
        )}

        {/* ── Empleados (job mode only; crew mode off hides the standard
            pickers, so only custom fields can justify the section then) */}
        {!isEditProposal && ((secVisible('workers') && business?.job_crew_mode !== false && employees.length > 0 && canStaff) || customFieldsFor('workers').length > 0) && (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-primary"/>
                <p className="text-xs font-semibold text-faint uppercase tracking-wide">{t.workersHeading}</p>
              </div>
              {employees.length > 0 && canAssign && business?.job_crew_mode !== false && business?.crew_finder_enabled !== false && (
                <button type="button" onClick={() => setCrewFinderOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                  <Navigation size={13} /> {full.dashboard.crewFinder.openButton}
                </button>
              )}
            </div>
            {/* Standard + custom fields, interleaved in saved layout order.
                The whole lead/crew/drivers block rides on 'assigned_workers';
                customs get an mt-4 wrapper (no gap container here). */}
            {fieldsInSection(jobLayout, 'workers').map(k => k !== 'assigned_workers'
              ? <div key={k} className="mt-4">{renderJobField(k)}</div>
              // Crew mode off = solo business: no lead/crew/driver pickers.
              // Saving still preserves existing assignments (state loads from
              // the job) and field creators still self-assign (RLS needs it).
              : business?.job_crew_mode === false ? null
              : (
              <Fragment key={k}>
            {employees.length > 0 && (
              <>
                {/* Lead picker — searchable single-select dropdown (mirrors
                   the client picker). Hidden for field creators: the person
                   logging the job IS the lead. */}
                {(canAssign || (creatorStaff && !restrictedCreator)) && (
                  <div className="flex flex-col gap-1.5 mb-4 max-w-xs">
                    <label className="text-sm font-medium text-ink">{t.leadLabel}</label>
                    <div className="relative" ref={leadDropdownRef}>
                      <button type="button" onClick={() => setLeadDropdownOpen(o => !o)}
                        className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary">
                        {leadEmployee ? (
                          <span className="text-ink truncate">{leadEmployee.first_name} {leadEmployee.last_name}</span>
                        ) : (
                          <span className="text-faint">{t.leadNone}</span>
                        )}
                        <ChevronDown size={14} className="text-faint shrink-0 ml-2"/>
                      </button>
                      {leadDropdownOpen && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                          <div className="p-2 border-b border-border-soft">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"/>
                              <input autoFocus type="text" placeholder={t.workerSearchPlaceholder}
                                value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
                                className="w-full rounded-lg border border-border pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            <button type="button"
                              onClick={() => { setLead(''); setLeadDropdownOpen(false); setLeadSearch(''); }}
                              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface transition-colors ${!leadEmployeeId ? 'text-primary font-medium' : 'text-muted'}`}>
                              {t.leadNone}
                            </button>
                            {filteredLeadEmployees.map(emp => (
                              <button type="button" key={emp.id}
                                onClick={() => { setLead(emp.id); setLeadDropdownOpen(false); setLeadSearch(''); }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface transition-colors truncate ${leadEmployeeId === emp.id ? 'text-primary font-medium bg-primary/5' : 'text-ink'}`}>
                                {emp.first_name} {emp.last_name}
                              </button>
                            ))}
                            {filteredLeadEmployees.length === 0 && (
                              <p className="px-4 py-3 text-xs text-faint text-center">{t.workerNoResults}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Crew — searchable multi-select dropdown. Replaces the
                   all-at-once grid so larger teams aren't overwhelming.
                   Managers+ assign; a field creator self-assigns their job. */}
                {canStaff && (
                <div className="flex flex-col gap-1.5 mb-3 max-w-xs">
                  <label className="text-sm font-medium text-ink">{t.crewLabel}</label>
                  <div className="relative" ref={crewDropdownRef}>
                    <button type="button" onClick={() => setCrewDropdownOpen(o => !o)}
                      className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary">
                      {assignedEmployees.length > 0 ? (
                        <span className="text-ink truncate">
                          {t.crewSelectedCount.replace('{{count}}', String(assignedEmployees.length))}
                        </span>
                      ) : (
                        <span className="text-faint">{t.crewPlaceholder}</span>
                      )}
                      <ChevronDown size={14} className="text-faint shrink-0 ml-2"/>
                    </button>
                    {crewDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-border-soft">
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"/>
                            <input autoFocus type="text" placeholder={t.workerSearchPlaceholder}
                              value={crewSearch} onChange={e => setCrewSearch(e.target.value)}
                              className="w-full rounded-lg border border-border pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
                          </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {filteredCrewEmployees.map(emp => {
                            const on = assignedEmployees.includes(emp.id);
                            return (
                              <button type="button" key={emp.id} onClick={() => toggleEmployee(emp.id)}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface transition-colors truncate flex items-center justify-between ${on ? 'text-primary font-medium bg-primary/5' : 'text-ink'}`}>
                                <span className="truncate">{emp.first_name} {emp.last_name}</span>
                                {on && <span className="text-xs text-primary ml-2">✓</span>}
                              </button>
                            );
                          })}
                          {filteredCrewEmployees.length === 0 && (
                            <p className="px-4 py-3 text-xs text-faint text-center">{t.workerNoResults}</p>
                          )}
                        </div>
                        <div className="p-2 border-t border-border-soft">
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
                )}
              </>
            )}
            {/* Drivers — optional multi-select (like crew). Each driver is
                credited driverHours on top of the job's total hours. Pool is
                ALL employees, so a driver who didn't work the job can be added
                without picking up the work hours. */}
            {employees.length > 0 && canStaff && (
              <div className="flex flex-col gap-1.5 max-w-xs">
                <label className="text-sm font-medium text-ink">{t.driverLabel}</label>
                <div className="relative" ref={driverDropdownRef}>
                  <button type="button" onClick={() => setDriverDropdownOpen(o => !o)}
                    className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary">
                    {driverEmployeeIds.length > 0 ? (
                      <span className="text-ink truncate">
                        {t.crewSelectedCount.replace('{{count}}', String(driverEmployeeIds.length))}
                      </span>
                    ) : (
                      <span className="text-faint">{t.driverNone}</span>
                    )}
                    <ChevronDown size={14} className="text-faint shrink-0 ml-2"/>
                  </button>
                  {driverDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-border-soft">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"/>
                          <input autoFocus type="text" placeholder={t.workerSearchPlaceholder}
                            value={driverSearch} onChange={e => setDriverSearch(e.target.value)}
                            className="w-full rounded-lg border border-border pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {filteredDriverPool.map(emp => {
                          const on = driverEmployeeIds.includes(emp.id);
                          return (
                            <button type="button" key={emp.id} onClick={() => toggleDriver(emp.id)}
                              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface transition-colors truncate flex items-center justify-between ${on ? 'text-primary font-medium bg-primary/5' : 'text-ink'}`}>
                              <span className="truncate">{emp.first_name} {emp.last_name}</span>
                              {on && <span className="text-xs text-primary ml-2">✓</span>}
                            </button>
                          );
                        })}
                        {filteredDriverPool.length === 0 && (
                          <p className="px-4 py-3 text-xs text-faint text-center">{t.workerNoResults}</p>
                        )}
                      </div>
                      <div className="p-2 border-t border-border-soft">
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
                    <p className="text-xs text-faint mt-1.5">{t.driverHoursHint}</p>
                  </div>
                )}
              </div>
            )}
              </Fragment>
            ))}
          </div>
        )}

        {/* ── Double-booking warning — assigned crew/drivers already on an
            overlapping job. Soft same-day notes appear below hard conflicts. */}
        {conflicts.length > 0 && (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 flex flex-col gap-3">
            {hardConflicts.length > 0 && (
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-warning" />
                  <span className="text-sm font-semibold text-warning">{t.conflictTitle}</span>
                </div>
                <ul className="flex flex-col gap-1">
                  {hardConflicts.map((c, i) => (
                    <li key={`h${i}`} className="text-xs text-ink">{conflictLine(c)}</li>
                  ))}
                </ul>
              </div>
            )}
            {softConflicts.length > 0 && (
              <div className="rounded-xl border border-border-soft bg-surface p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={15} className="text-muted" />
                  <span className="text-sm font-semibold text-muted">{t.conflictSoftHeading}</span>
                </div>
                <ul className="flex flex-col gap-1">
                  {softConflicts.map((c, i) => (
                    <li key={`s${i}`} className="text-xs text-faint">{conflictLine(c)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Líneas de trabajo / Ítems */}
        {showMaterials && (
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={15} className="text-primary"/>
            <p className="text-xs font-semibold text-faint uppercase tracking-wide">
              {isEditProposal ? t.itemsHeadingProposal : t.itemsHeadingJob}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {isEditProposal ? (
              /* Proposal: simpler grid without item_type */
              <>
                <div className="grid grid-cols-[1fr_70px_90px_80px_32px] gap-2 text-xs font-semibold text-faint uppercase tracking-wide pb-1">
                  <span>{t.colDescription}</span><span className="text-center">{t.colQty}</span><span className="text-right">{t.colUnitPrice}</span><span className="text-right">{t.colTotal}</span><span/>
                </div>
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-[1fr_70px_90px_80px_32px] gap-2 items-center">
                    <input type="text" placeholder={t.itemDescriptionPlaceholderProposal}
                      value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)}
                      className="rounded-xl border border-border px-3 py-2 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.5" value={item.quantity || ''}
                      onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-border px-2 py-2 text-sm text-ink text-center focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.01" value={item.unit_price || ''}
                      onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-border px-2 py-2 text-sm text-ink text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <p className="text-sm font-semibold text-ink text-right pr-1">
                      ${fmtMoney(item.quantity * item.unit_price)}
                    </p>
                    <button onClick={() => items.length > 1 && removeItem(item.id)}
                      disabled={items.length === 1}
                      className="p-1 rounded-lg hover:bg-red-500/10 transition-colors">
                      <Trash2 size={13} className={items.length === 1 ? 'text-gray-200' : 'text-red-400'}/>
                    </button>
                  </div>
                ))}
              </>
            ) : (
              /* Job: full grid with item_type (type column hidden when off) */
              <>
                <div className={`grid ${showItemTypes ? 'grid-cols-[100px_1fr_70px_90px_80px_32px]' : 'grid-cols-[1fr_70px_90px_80px_32px]'} gap-2 text-xs font-semibold text-faint uppercase tracking-wide pb-1`}>
                  {showItemTypes ? <span>{t.colType}</span> : null}<span>{t.colDescription}</span><span className="text-center">{t.colQty}</span><span className="text-right">{t.colUnitPrice}</span><span className="text-right">{t.colTotal}</span><span/>
                </div>
                {items.map(item => (
                  <div key={item.id} className={`grid ${showItemTypes ? 'grid-cols-[100px_1fr_70px_90px_80px_32px]' : 'grid-cols-[1fr_70px_90px_80px_32px]'} gap-2 items-center`}>
                    {showItemTypes ? (
                    <select value={item.item_type}
                      onChange={e => updateItem(item.id, 'item_type', e.target.value)}
                      className="rounded-xl border border-border bg-card px-2 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                      {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    ) : null}
                    <input type="text" placeholder={t.itemDescriptionPlaceholderJob} value={item.description}
                      onChange={e => updateItem(item.id, 'description', e.target.value)}
                      className="rounded-xl border border-border px-3 py-2 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.5" value={item.quantity || ''}
                      onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-border px-2 py-2 text-sm text-ink text-center focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.01" value={item.unit_price || ''}
                      onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-border px-2 py-2 text-sm text-ink text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <p className="text-sm font-semibold text-ink text-right pr-1">
                      ${fmtMoney(item.quantity * item.unit_price)}
                    </p>
                    <button onClick={() => items.length > 1 && removeItem(item.id)}
                      className="p-1 rounded-lg hover:bg-red-500/10 transition-colors"
                      disabled={items.length === 1}>
                      <Trash2 size={13} className={items.length === 1 ? 'text-gray-200' : 'text-red-400'}/>
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Totals */}
            <div className="border-t border-border-soft mt-2 pt-3 flex justify-end">
              {isEditProposal ? (
                <div className="w-52 flex flex-col gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">{t.subtotal}</span>
                    <span className="font-medium">${fmtMoney(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-3">
                    <span className="text-muted whitespace-nowrap">{t.taxPercent}</span>
                    <input type="number" min="0" max="30" step="0.5" value={taxRate || ''}
                      placeholder="0" onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-20 rounded-xl border border-border px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-3">
                    <span className="text-muted">{t.discountAmount}</span>
                    <input type="number" min="0" step="0.01" value={discount || ''}
                      placeholder="0" onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                      className="w-20 rounded-xl border border-border px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                  </div>
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-border-soft">
                    <span>{t.total}</span>
                    <span className="text-primary">${fmtMoney(total)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-right">
                  <p className="text-xs text-faint">{t.totalEstimated}</p>
                  <p className="text-lg font-bold text-ink">${fmtMoney(subtotal)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ── Fotos — edit mode shows the live gallery; create mode stages
            photos locally and uploads them right after the insert (see
            uploadPendingPhotos), so nothing is left in storage if the form
            is abandoned. */}
        {editId && business ? (
          <JobPhotosSection jobId={editId} businessId={business.id} canWrite />
        ) : (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ImagePlus size={15} className="text-primary"/>
                <p className="text-xs font-semibold text-faint uppercase tracking-wide">{full.dashboard.jobs.detail.photos.heading}</p>
              </div>
              <span className="text-xs text-faint">
                {full.dashboard.jobs.detail.photos.countLabel
                  .replace('{{count}}', String(pendingPhotos.length))
                  .replace('{{max}}', String(MAX_PHOTOS_PER_JOB))}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
              {pendingPhotos.map(p => (
                <div key={p.url} className="relative aspect-square rounded-xl overflow-hidden bg-border-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePendingPhoto(p.url)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {pendingPhotos.length < MAX_PHOTOS_PER_JOB && (
                <button
                  type="button"
                  onClick={() => pendingPhotoInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-faint hover:border-primary hover:text-primary transition-colors"
                >
                  <ImagePlus size={22} />
                  <span className="text-[11px] mt-1.5 font-medium">{full.dashboard.jobs.detail.photos.addBtn}</span>
                </button>
              )}
            </div>
            {pendingPhotos.length > 0 && (
              <p className="text-xs text-faint mt-2">{full.dashboard.jobs.detail.photos.pendingHint}</p>
            )}
            <input
              ref={pendingPhotoInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={addPendingPhotos}
              className="hidden"
            />
          </div>
        )}

        {/* ── Notas (section hideable in job mode) */}
        {/* Mirror the fields' own gates: internal notes are role-gated (field
           creators never see them) — an empty card must not render. */}
        {(isEditProposal
          || !fHidden('worker_notes')
          || (!restrictedCreator && !fHidden('internal_notes'))
          || customFieldsFor('notes').length > 0) && (
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={15} className="text-primary"/>
            <p className="text-xs font-semibold text-faint uppercase tracking-wide">{t.notesHeading}</p>
          </div>
          <div className="flex flex-col gap-3">
            {isEditProposal && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-ink">{t.clientNoteLabel}</label>
                <textarea rows={4} placeholder={t.clientNotePlaceholder}
                  value={clientNotes} onChange={e => setClientNotes(e.target.value)}
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary resize-y"/>
              </div>
            )}
            {/* Standard + custom fields, interleaved in saved layout order. */}
            {fieldsInSection(jobLayout, 'notes').map(renderJobField)}
          </div>
        </div>
        )}

        {/* ── Detalles adicionales — home for custom fields assigned to the
            'additional' section. Only rendered when at least one exists. */}
        {customFieldsFor('additional').length > 0 && (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
            <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-4">
              {locale === 'es' ? 'Detalles adicionales' : 'Additional details'}
            </p>
            <div className="flex flex-col gap-3">
              {renderCustomFields('additional')}
            </div>
          </div>
        )}

        {/* ── Crew visibility — LAST option of the form (per user preference).
            When off, the job lives only on the owner's scheduler. Hidden for
            field crew: their job is auto-published so they (and any assigned
            crew) can see it. iOS-style segmented control. */}
        {!restrictedCreator && (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <Eye size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">{t.publishedToCrewLabel}</p>
            </div>
            <p className="text-xs text-muted mb-3">{t.publishedToCrewHint}</p>
            <div className="flex p-1 rounded-2xl bg-border-soft">
              <button type="button" onClick={() => setPublishedToCrew(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-all ${
                  !publishedToCrew
                    ? 'bg-primary/15 text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                    : 'text-muted hover:text-ink'
                }`}>
                <Lock size={13} />
                {t.privateBadge}
              </button>
              <button type="button" onClick={() => setPublishedToCrew(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-all ${
                  publishedToCrew
                    ? 'bg-primary/15 text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                    : 'text-muted hover:text-ink'
                }`}>
                <Eye size={13} />
                {t.publicBadge}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <Link
            href={editId ? `/dashboard/trabajos/${editId}${backCtx}` : '/dashboard/trabajos'}
            onClick={e => { e.preventDefault(); confirmDiscard(() => router.push(editId ? `/dashboard/trabajos/${editId}${backCtx}` : '/dashboard/trabajos')); }}
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

      {crewFinderOpen && business && (
        <CrewFinderPanel
          businessId={business.id}
          target={{ jobId: editId ?? null, lat: jobLat, lng: jobLng, scheduledDate: scheduledDate || null, clientId: clientId || null }}
          currentCrew={assignedEmployees}
          onAddCrew={id => setAssignedEmployees(prev => (prev.includes(id) ? prev : [...prev, id]))}
          onSetDate={d => setScheduledDate(d)}
          onClose={() => setCrewFinderOpen(false)}
        />
      )}
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
  const cfg = parseFieldConfig(template.field_config);

  if (template.field_type === 'note') {
    // Long free text — multiline.
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">{label}</label>
        <textarea rows={4}
          value={value} onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-primary resize-y"/>
      </div>
    );
  }
  if (template.field_type === 'boolean') {
    // Three states — '', 'true', 'false'. Clicking the active button clears it
    // so the user can return to "unanswered".
    const yesActive = value === 'true';
    const noActive = value === 'false';
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${yesActive ? 'border-primary bg-primary text-white' : 'border-border bg-card text-ink hover:bg-surface'}`}>
            {tc.states.yes}
          </button>
          <button type="button" onClick={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${noActive ? 'border-primary bg-primary text-white' : 'border-border bg-card text-ink hover:bg-surface'}`}>
            {tc.states.no}
          </button>
        </div>
      </div>
    );
  }
  if (template.field_type === 'select' && template.field_options?.length) {
    // Multi-select: chips, value stored comma-joined ("A, B") so display
    // paths read naturally. Single-select keeps the dropdown.
    if (cfg.multi) {
      const selected = splitMultiValue(value);
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">{label}</label>
          <div className="flex flex-wrap gap-2">
            {template.field_options.map(o => {
              const on = selected.includes(o);
              return (
                <button key={o} type="button" onClick={() => onChange(toggleMultiOption(value, o))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted hover:border-border'}`}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">{label}</label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none"
        >
          <option value="">—</option>
          {template.field_options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  if (template.field_type === 'number') {
    // type="text" + inputMode so we can enforce numeric (and optional
    // whole-number-only) as the user types — type="number" can't be sanitized.
    return (
      <Input
        label={label}
        type="text"
        inputMode={cfg.integerOnly ? 'numeric' : 'decimal'}
        value={cfg.thousands ? groupNumberString(value) : value}
        onChange={e => onChange(sanitizeNumberInput(e.target.value, cfg.integerOnly))}
      />
    );
  }
  return (
    <Input
      label={label}
      type={template.field_type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}
