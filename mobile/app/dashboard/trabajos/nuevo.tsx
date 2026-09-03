import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { SkeletonBlock, SkeletonCard } from '@amixos/shared/ui/Skeleton';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal as RNModal,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronDown,
  Search,
  X,
  Trash2,
  MapPin,
  Link2,
  Navigation,
  Calendar as CalendarIcon,
  Users as UsersIcon,
  FileText,
  Check,
  Lock,
  Eye,
  ImagePlus,
  Camera,
  ClipboardPaste,
} from 'lucide-react-native';
import { hasClipboardImage, readClipboardImageToFile, type PhotoSource } from '@/lib/clipboardPhoto';
import { useThemeColors } from '@/lib/ThemeProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { queuedInsert, queuedUpdate, queuedDelete, queuedUpload } from '@/lib/offline/mutate';
import { isOnlineNow } from '@/lib/offline/network';
import { JOB_PHOTOS_BUCKET, MAX_PHOTOS_PER_JOB, jobPhotoPath, jobPhotoFilename } from '@amixos/shared/lib/jobPhotos';
import { loadCached, prependCached, writeCached } from '@/lib/offline/cache';
import { newUuid } from '@/lib/offline/ids';
import { useApp } from '@/lib/AppContext';
import { CrewFinderSheet } from '@/modules/crewFinder/CrewFinderSheet';
import { isCustomRole, can } from '@amixos/shared/lib/permissions';
import { useLang } from '@/lib/i18n/LangProvider';
import { Input, Select, DatePicker, Toggle } from '@amixos/shared/ui';
import { formatProjectDuration } from '@amixos/shared/lib/duration';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import { clientPickerDisplay, searchClientsServer } from '@amixos/shared/lib/clientSearch';
import { usStateName } from '@amixos/shared/lib/usStates';
import { logAudit } from '@amixos/shared/lib/audit';
import { groupNumberString, localizeTemplates, parseFieldConfig, sanitizeNumberInput, splitMultiValue, toggleMultiOption } from '@amixos/shared/lib/fieldTemplates';
import { parseHiddenFields, isJobFieldHidden, jobSectionHasVisibleField, JOB_FIELDS_ALWAYS_SHOWN, parseJobLayout, fieldsInSection, type JobSectionKey, type JobLayoutSection } from '@amixos/shared/lib/jobSections';
import { formatTime12h, formatPhoneInput, formatDateLong, todayLocalISO } from '@amixos/shared/lib/format';
import { detectJobConflicts, fetchJobsForConflictCheck, hasHardConflict, type ExistingAssignedJob, type JobConflict } from '@amixos/shared/lib/jobConflicts';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { UserPlus, AlertTriangle } from 'lucide-react-native';
import {
  evaluateOperatingHours,
  normalizeOperatingHours,
} from '@amixos/shared/lib/operatingHours';
import { JobPhotosSection } from '@/components/JobPhotosSection';
import { useDirty, useUnsavedGuard } from '@/lib/useUnsavedGuard';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  city: string | null;
  state: string | null;
  /** People at this client (contacts) — searchable so you can find the account
   *  by a contact's name; primary contact first. */
  contacts?: { name: string; role: string | null }[];
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

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

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const todayISO = () => new Date().toISOString().split('T')[0];
const plusDaysISO = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

/**
 * Accept "lat, lng" or "lat lng" with optional surrounding whitespace.
 * Returns null if not a valid lat/lng pair.
 */
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

export default function NuevoTrabajoRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { edit, duplicate, modo, client: clientParam, copy } = useLocalSearchParams<{ edit?: string; duplicate?: string; modo?: string; client?: string; copy?: string }>();
  const supabase = createSupabaseClient();
  const c = useThemeColors();
  const { business, user, currentRole, activeLocationId, myHomeLocationId, locations } = useApp();
  // Defense in depth: field crew / viewers can't create jobs (RLS rejects the
  // insert and they have no clients to pick). The entry points are hidden, but
  // guard the route too in case of a deep link.
  useEffect(() => {
    if (currentRole && !can.createJob(currentRole)) router.replace('/dashboard/trabajos');
  }, [currentRole]);
  const { t: full, locale } = useLang();
  const t = full.dashboard.jobs.new;
  const tc = full.common;
  // Per-business required job fields (Ajustes → Trabajos). `jrl` marks a label
  // with " *" when required; JOB_REQUIRABLE is the subset that exists on this
  // form (validated on save).
  const jobReq = (business?.job_field_required ?? {}) as Record<string, boolean>;
  const jrl = (key: string, base: string) => (jobReq[key] ? `${base} *` : base);
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
  // Per-business field show/hide (Ajustes → Trabajos eye toggles). `fHidden`
  // hides a field; a section heading hides when all its fields are hidden.
  const jobHidden = parseHiddenFields(business?.job_field_hidden);
  const fHidden = (key: string) => !JOB_FIELDS_ALWAYS_SHOWN.includes(key) && isJobFieldHidden(jobHidden, key);
  const secVisible = (key: JobSectionKey) => jobSectionHasVisibleField(jobHidden, key);
  const tStatuses = full.dashboard.jobs.statuses;
  const tPriorities = full.dashboard.jobs.priorities;

  const editId = edit ?? null;
  // Duplicate mode: prefill the whole form from an existing job but save as
  // a brand-new record (editId stays null so the insert path runs).
  const duplicateId = duplicate ?? null;
  // Duplicate mode 'team': carry over ONLY client + crew/drivers — dates,
  // hours, notes, photos etc. start blank for the new visit.
  const teamOnly = !!duplicateId && copy === 'team';
  const sourceId = editId ?? duplicateId;
  const [loadingEdit, setLoadingEdit] = useState(!!sourceId);
  // For new mode the URL drives this; for edit/duplicate mode we overwrite
  // once the job loads (estimate_number === proposal).
  const [isProposal, setIsProposal] = useState(modo === 'propuesta');

  // expo-router params can hydrate after first render — keep isProposal in
  // sync with ?modo= so the heading + form layout reflect the URL. A role that
  // can create jobs but not estimates (e.g. field crew) is forced to a plain
  // work order even if it deep-links into proposal mode.
  useEffect(() => {
    if (!sourceId) {
      const wantsProposal = modo === 'propuesta';
      setIsProposal(wantsProposal && (!currentRole || can.createEstimate(currentRole)));
    }
  }, [sourceId, modo, currentRole]);

  // Default a NEW job's branch to the active branch, else the user's own home
  // branch (so data auto-files to where they work even when viewing "All").
  useEffect(() => {
    if (sourceId || locationId || locations.length === 0) return;
    setLocationId(activeLocationId ?? myHomeLocationId ?? '');
  }, [sourceId, locations, activeLocationId, myHomeLocationId]);

  // Form — shared
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState(clientParam ?? '');
  // Branch this job belongs to. Defaults to the active branch for new jobs;
  // loaded from the row when editing. See web nuevo/page.tsx.
  const [locationId, setLocationId] = useState('');
  // Crew visibility (migration 044). Defaults to false so new jobs start as
  // "Privado" (owner's scheduler view); the owner explicitly flips it on
  // when the job is ready for the assigned crew to see.
  const [publishedToCrew, setPublishedToCrew] = useState(false);
  // Field crew get a simplified form: no branch picker (auto = their branch)
  // and no crew-visibility toggle. Their job is forced visible-to-crew +
  // self-assigned so they can see it (RLS 044/089). Mirrors logFieldJob.
  const restrictedCreator = !!currentRole && !can.seeAllJobs(currentRole);
  // Crew-assignment rights (matches migration 164's job_assignments policy):
  // managers+ get the dispatcher tools; a field creator keeps self-assign on
  // their own job; office/viewer get nothing (they can't write job_assignments).
  const canAssign = can.assignWorkers(currentRole);
  // created_by of the job being edited — RLS (131/179) lets a member who can
  // CREATE jobs manage assignments on jobs they created, even without the
  // assignWorkers cap (field crew, office, custom roles).
  const [loadedCreatedBy, setLoadedCreatedBy] = useState<string | null>(null);
  // Can this creator schedule / change status? Field crew without the toggle
  // may only RECORD completed work — status is locked to "completed".
  const canSchedule = can.scheduleJobs(currentRole);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  useEffect(() => {
    // Resolve the creator's own employee row: field crew for the save-time
    // self-assign, worker-style creators for the lead default. Cheap single
    // query under the self-read policy — always fetch (gating on assignWorkers
    // broke the lead default for custom roles that got that capability).
    if (!business || !user) { setMyEmployeeId(null); return; }
    supabase.from('employees').select('id').eq('business_id', business.id).eq('user_id', user.id).limit(1).maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => setMyEmployeeId(data?.id ?? null));
  }, [business?.id, user?.id]);
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
  // The job's status when the edit form loaded — used to stamp the pipeline
  // timestamp only on a real status change at save time.
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
  // Manual total hours — used when start/end times are left blank. When both
  // times are set, the field auto-computes from them and this is ignored.
  const [totalHours, setTotalHours] = useState('');
  const [description, setDescription] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [workerNotes, setWorkerNotes] = useState('');
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);
  const [manualWorkers, setManualWorkers] = useState<string[]>(['']);
  const [leadEmployeeId, setLeadEmployeeId] = useState<string | null>(null);
  // Optional drivers — any employees paid extra driverHours (each) on top of
  // the job's total hours. Multi-select, like crew.
  const [driverEmployeeIds, setDriverEmployeeIds] = useState<string[]>([]);
  const [driverHours, setDriverHours] = useState('');
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');

  // Form — proposal only
  const [clientNotes, setClientNotes] = useState('');
  const [issueDate, setIssueDate] = useState(todayISO());
  const [expiryDate, setExpiryDate] = useState(plusDaysISO(30));

  // Location auto-fill from map link / coords
  const [mapLink, setMapLink] = useState('');
  const [mapLinkUnrecognized, setMapLinkUnrecognized] = useState(false);
  const [coordsText, setCoordsText] = useState('');
  const [coordsInvalid, setCoordsInvalid] = useState(false);
  const [jobLat, setJobLat] = useState<number | null>(null);
  const [jobLng, setJobLng] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  // Quick-add: create a client inline without leaving the job draft.
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // iOS can't present a modal while another is open, so we close the client
  // picker first and open quick-add from its onDismiss. This flag bridges them.
  const [pendingQuickAdd, setPendingQuickAdd] = useState(false);
  const [qaFirstName, setQaFirstName] = useState('');
  const [qaLastName, setQaLastName] = useState('');
  const [qaCompany, setQaCompany] = useState('');
  const [qaPhone, setQaPhone] = useState('');
  const [qaSaving, setQaSaving] = useState(false);
  const [qaError, setQaError] = useState('');
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [crewPickerOpen, setCrewPickerOpen] = useState(false);
  const [crewFinderOpen, setCrewFinderOpen] = useState(false);
  const [crewSearch, setCrewSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Who may pick lead/crew/drivers: the assignWorkers cap (dispatchers), a
  // field creator (self-assign flow), or any job-creator role staffing a job
  // it created (new job, or editing its own) — mirrors RLS 131/179.
  const creatorStaff =
    can.createJob(currentRole) && (!sourceId || (!!user && loadedCreatedBy === user.id));
  const canStaff = canAssign || restrictedCreator || creatorStaff;

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

  // Load clients + employees + (optionally) the job being edited.
  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    (async () => {
      // Read through the offline cache so a field tech can open the job form and
      // pick clients/crew/templates with NO signal — the last successful fetch is
      // served from AsyncStorage. loadCached never throws, so one read failing
      // offline can't blank out the others (which is what killed the whole
      // Promise.all before, leaving clients + employees empty).
      // Each dataset lands as soon as ITS fetch finishes — the crew pickers
      // (55 workers) must not wait behind a multi-page clients/contacts crawl,
      // which made the whole Workers section invisible for seconds on big
      // businesses. Clients still wait for contacts (they merge into the rows).
      const empPromise = loadCached<Employee[]>(`jobform_employees_${business.id}`, async () => {
        // employees_roster (view, migration 178): names-only roster readable by
        // every member — the pickers must work for field/office roles that have
        // no Employees permission (pay etc. stays behind public.employees RLS).
        // Fallback: if the view is missing/stale in this DB, roles with the
        // Employees permission can still read the table directly.
        const fromTable = (table: string) =>
          fetchAllById<Employee>((afterId, pageSize) => {
            let q = supabase
              .from(table)
              .select('id, first_name, last_name, role, show_in_roster')
              .eq('business_id', business.id)
              .eq('active', true)
              .order('id', { ascending: true })
              .limit(pageSize);
            if (afterId) q = q.gt('id', afterId);
            return q;
          });
        try {
          const roster = await fromTable('employees_roster');
          if (roster.length > 0) return roster;
        } catch { /* view missing — fall through */ }
        return fromTable('employees');
      }).then((empRes) => {
        if (cancelled) return;
        // Roster flag (migration 128): office members opt out of crew pickers.
        // Alphabetical by name so the crew / driver / lead pickers read cleanly.
        setEmployees(
          (empRes.data ?? [])
            .filter((e) => (e as { show_in_roster?: boolean | null }).show_in_roster !== false)
            .sort((a, b) => `${a.first_name} ${a.last_name}`.trim().localeCompare(`${b.first_name} ${b.last_name}`.trim(), undefined, { sensitivity: 'base' })),
        );
      });

      const tplPromise = loadCached<FieldTemplate[]>(`jobform_templates_${business.id}`, async () => {
        const { data, error } = await supabase
          .from('job_field_templates')
          .select('*')
          .eq('business_id', business.id)
          .order('sort_order');
        if (error) throw error;
        return (data ?? []) as FieldTemplate[];
      }).then((tplRes) => {
        if (cancelled) return;
        setTemplates(localizeTemplates((tplRes.data ?? []) as FieldTemplate[], locale));
      });

      const clientsPromise = Promise.all([
        // Keyset (by id) — offset .range() re-scans under RLS and stalls the
        // create form once a business has thousands of clients.
        loadCached<Client[]>(`jobform_clients_${business.id}`, () =>
          fetchAllById<Client>((afterId, pageSize) => {
            let q = supabase
              .from('clients')
              .select('id, first_name, last_name, company, city, state')
              .eq('business_id', business.id)
              .order('id', { ascending: true })
              .limit(pageSize);
            if (afterId) q = q.gt('id', afterId);
            return q;
          })),
        // Client contacts — so the picker can find an account by a contact's
        // name (primary contact first).
        loadCached<{ id: string; client_id: string; name: string; role: string | null }[]>(`jobform_contacts_${business.id}`, () =>
          fetchAllById<{ id: string; client_id: string; name: string; role: string | null }>((afterId, pageSize) => {
            let q = supabase
              .from('client_contacts')
              .select('id, client_id, name, role')
              .eq('business_id', business.id)
              .order('id', { ascending: true })
              .limit(pageSize);
            if (afterId) q = q.gt('id', afterId);
            return q;
          })),
      ]).then(([clRes, contactRes]) => {
        if (cancelled) return;
        const contactsByClient = new Map<string, { name: string; role: string | null }[]>();
        for (const ct of contactRes.data ?? []) {
          (contactsByClient.get(ct.client_id) ?? contactsByClient.set(ct.client_id, []).get(ct.client_id)!)
            .push({ name: ct.name, role: ct.role });
        }
        setClients((clRes.data ?? []).map((c) => ({ ...c, contacts: contactsByClient.get(c.id) })));
      });

      await Promise.all([empPromise, tplPromise, clientsPromise]);
      if (cancelled) return;

      if (sourceId) {
        // Read through the offline cache (SAME keys + select shapes the detail
        // screen warms) so editing works with no signal — and, critically, so a
        // failed job_assignments fetch can't blank the crew pickers: the save
        // replaces assignments wholesale, so an empty prefill silently WIPED
        // the workers of an offline-created job on the next edit-save.
        const [jobRes, asgRes] = await Promise.all([
          loadCached<Record<string, unknown>>(`job_${sourceId}`, async () => {
            const { data, error } = await supabase
              .from('jobs')
              .select(
                '*, clients(id, first_name, last_name, company, phone_cell, phone_office, email, email_office, email_home, address, city, state, zip_code, custom_fields)',
              )
              .eq('id', sourceId)
              .single();
            if (error) throw error;
            return data;
          }),
          loadCached<{ employee_id: string | null; worker_name: string | null; is_lead: boolean | null; crew: boolean | null; employees: { id: string } | null }[]>(
            `job_assignments_${sourceId}`,
            async () => {
              const { data, error } = await supabase
                .from('job_assignments')
                // employee_id is selected DIRECTLY. Deriving it from the
                // joined employees row silently unlinked every worker whenever
                // that join came back null — a deleted employee, or a viewer
                // without the Employees permission, since full employees reads
                // are gated (migration 178). The save then rewrote them as
                // name-only rows, or dropped them entirely when worker_name was
                // null.
                .select('id, employee_id, worker_name, is_lead, crew, employees(id, first_name, last_name, user_id)')
                .eq('job_id', sourceId);
              if (error) throw error;
              return (data ?? []) as never;
            },
          ),
        ]);
        if (cancelled) return;
        const job = jobRes.data as Record<string, any> | null;
        // Baseline known = server OR cached copy arrived. When neither did, the
        // save must NOT delete-and-reinsert assignments (see save path).
        assignsBaselineRef.current = asgRes.data != null;
        const assigns = (asgRes.data ?? []).map((a) => ({
          employee_id: a.employee_id ?? a.employees?.id ?? null,
          worker_name: a.worker_name,
          is_lead: a.is_lead,
          crew: a.crew,
        }));
        if (job && teamOnly) {
          setLoadedCreatedBy(job.created_by ?? null);
          setClientId(job.client_id ?? '');
          setLocationId(job.location_id ?? '');
          setDriverEmployeeIds(job.driver_employee_ids ?? []);
          if (restrictedCreator) setStatus('completed');
        } else if (job) {
          setLoadedCreatedBy(job.created_by ?? null);
          const wasEstimate = !!job.estimate_number;
          // Estimates and jobs are ONE record — the form styles itself by
          // PHASE, not by estimate_number alone. In the quote phase the
          // estimate form applies (issue/expiry, no crew/schedule); once
          // accepted onward the same record opens the full job form so
          // workers, dates and hours become editable.
          const proposal = wasEstimate && ['proposal', 'sent', 'declined', 'cancelled'].includes(job.status);
          setIsProposal(proposal);
          setTitle(job.title ?? '');
          setClientId(job.client_id ?? '');
          setLocationId(job.location_id ?? '');
          setPublishedToCrew(!!job.published_to_crew);
          setStatus(
            job.status === 'in_progress' ? 'in_progress'
              : job.status === 'posible' ? 'posible'
              : job.status === 'completed' ? 'completed'
              : 'scheduled',
          );
          setLoadedStatus(job.status);
          setPriority(job.priority ?? 'normal');
          setAddress(job.job_address ?? '');
          setCity(job.job_city ?? '');
          setState(job.job_state ?? '');
          setScheduledDate(job.scheduled_date ?? '');
          setEndDate(job.end_date ?? '');
          setAllDay(!!job.all_day);
          setTimeStart(job.time_start ?? '');
          setTimeEnd(job.time_end ?? '');
          setTotalHours(job.total_hours != null ? String(job.total_hours) : '');
          setDriverEmployeeIds(job.driver_employee_ids ?? []);
          setDriverHours(job.driver_hours != null ? String(job.driver_hours) : '');
          setDescription(job.description ?? '');
          setInternalNotes(job.internal_notes ?? '');
          setWorkerNotes(job.worker_notes ?? '');
          if (job.custom_fields && typeof job.custom_fields === 'object') {
            const cf: Record<string, string> = {};
            for (const [k, v] of Object.entries(job.custom_fields as Record<string, unknown>)) {
              cf[k] = String(v ?? '');
            }
            setCustomFields(cf);
          }
          setMapLink(job.job_map_link ?? '');
          if (job.job_lat != null && job.job_lng != null) {
            setJobLat(job.job_lat);
            setJobLng(job.job_lng);
            setCoordsText(`${job.job_lat}, ${job.job_lng}`);
          }
          if (wasEstimate) {
            setClientNotes(job.notes ?? '');
            // A duplicated proposal is a new proposal: keep today's issue
            // date + default expiry instead of copying the source's.
            if (editId) {
              setIssueDate(job.issue_date ?? todayISO());
              setExpiryDate(job.expiry_date ?? '');
            }
          }
        }
        loadedAssignsRef.current = assigns;
        if (assignsBaselineRef.current) {
          setAssignedEmployees(
            assigns.filter((a: any) => a.employee_id && a.crew !== false).map((a: any) => a.employee_id),
          );
          const manual = assigns
            .filter((a: any) => !a.employee_id && a.worker_name)
            .map((a: any) => a.worker_name);
          if (manual.length > 0) setManualWorkers(manual);
          const lead = assigns.find((a: any) => a.is_lead && a.employee_id);
          if (lead) setLeadEmployeeId(lead.employee_id);
        }
        setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [business?.id, sourceId, locale]);

  // Parse pasted coordinates ("lat, lng") and store as numeric lat/lng.
  const onCoordsChange = (text: string) => {
    setCoordsText(text);
    if (!text.trim()) {
      setCoordsInvalid(false);
      setJobLat(null);
      setJobLng(null);
      return;
    }
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

  // Grab the device's current GPS position and fill the coordinates field.
  const useMyLocation = async () => {
    if (gettingLocation) return;
    setGettingLocation(true);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        Alert.alert(t.coordinatesLabel, t.locationDenied);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
      const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
      setJobLat(lat);
      setJobLng(lng);
      setCoordsText(`${lat}, ${lng}`);
      setCoordsInvalid(false);
    } catch {
      Alert.alert(t.coordinatesLabel, t.locationError);
    } finally {
      setGettingLocation(false);
    }
  };

  // Auto-fill GPS coords when CREATING a job — but only for creators whose
  // flow records finished work on-site (field crew / completed-by-default
  // roles): they ARE standing at the job. Schedulers plan from elsewhere, so
  // grabbing their position just fills a wrong location (they still have the
  // "Usar mi ubicación" button). Quiet: denied permission / GPS failure just
  // skips. Never runs for edit or duplicate (those may already carry a
  // location), and never overwrites coords typed while the fix was resolving.
  const coordsTextRef = useRef('');
  // Client id for the job being CREATED — generated once per form session so
  // a retry after a mid-save failure re-uses it (duplicate insert = success)
  // instead of inserting another copy of the job.
  const draftJobIdRef = useRef(newUuid());
  // True once the edit prefill obtained the job's existing assignments (live
  // or cached). Guards the save's delete+reinsert against wiping crew that
  // simply failed to load.
  const assignsBaselineRef = useRef(false);
  /** The assignment rows this job was loaded with. The save rebuilds
   *  job_assignments by deleting and re-inserting from the pickers, so anything
   *  the form could not put INTO a picker would be destroyed. Keeping the
   *  originals lets the save carry those rows through untouched. */
  const loadedAssignsRef = useRef<{ employee_id: string | null; worker_name: string | null; is_lead: boolean | null; crew: boolean | null }[]>([]);
  useEffect(() => { coordsTextRef.current = coordsText; }, [coordsText]);
  useEffect(() => {
    if (editId || duplicate || !defaultsCompleted) return;
    let cancelled = false;
    (async () => {
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm !== 'granted' || cancelled) return;
        setGettingLocation(true);
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (cancelled || coordsTextRef.current.trim()) return;
        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
        const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        setJobLat(lat);
        setJobLng(lng);
        setCoordsText(`${lat}, ${lng}`);
        setCoordsInvalid(false);
      } catch {
        /* quiet — the user can still tap "Usar mi ubicación" */
      } finally {
        if (!cancelled) setGettingLocation(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, duplicate, defaultsCompleted]);

  // Try to pull coords from a map URL. Returns true when successful.
  // Address / city / state are NOT auto-filled — Google's /place/ slug puts
  // a business name, address, city, state, country in unpredictable order,
  // so guessing by comma-split was misaligning fields.
  const extractCoords = (link: string): boolean => {
    const m =
      link.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ||
      link.match(/[?&](?:q|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ||
      link.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (!m) return false;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    setJobLat(lat);
    setJobLng(lng);
    setCoordsText(`${lat}, ${lng}`);
    setCoordsInvalid(false);
    setMapLinkUnrecognized(false);
    return true;
  };

  const parseMapLink = async (link: string) => {
    setMapLink(link);
    if (!link.trim()) {
      setMapLinkUnrecognized(false);
      return;
    }
    if (extractCoords(link)) return;

    // Shortened links (maps.app.goo.gl, goo.gl/maps, apple.co) don't carry
    // coords directly. Follow the redirect; React Native's fetch follows
    // 30x by default and exposes the final URL on response.url.
    const isShortlink = /maps\.app\.goo\.gl|goo\.gl\/maps|apple\.co/i.test(link);
    if (isShortlink) {
      try {
        const res = await fetch(link, { method: 'GET' });
        if (res.url && res.url !== link && extractCoords(res.url)) return;
      } catch {
        // Network/CORS failure — fall through to the hint.
      }
    }

    const known = /google\.|goo\.gl|apple\.|maps\.app\.goo\.gl/i.test(link);
    setMapLinkUnrecognized(!known);
  };

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  // Custom job fields (job_field_templates) rendered in their assigned section
  // per business.job_field_layout. Custom field keys are `custom:<templateId>`.
  const allJobKeys = useMemo(
    () => [
      'client_id', 'priority', 'description', 'job_address', 'job_city', 'job_state',
      'coordinates', 'scheduled_date', 'time_start', 'total_hours',
      'assigned_workers', 'worker_notes', 'internal_notes',
      ...templates.map((tpl) => `custom:${tpl.id}`),
    ],
    [templates],
  );
  const jobLayout = useMemo(
    () => parseJobLayout(business?.job_field_layout, allJobKeys),
    [business?.job_field_layout, allJobKeys],
  );
  const customFieldsFor = (section: JobLayoutSection): FieldTemplate[] =>
    fieldsInSection(jobLayout, section)
      .filter((k) => k.startsWith('custom:'))
      .map((k) => templates.find((tpl) => `custom:${tpl.id}` === k))
      .filter((tpl): tpl is FieldTemplate => !!tpl);
  const renderCustomFields = (section: JobLayoutSection) =>
    customFieldsFor(section).map((tpl) => (
      <CustomFieldInput
        key={tpl.id}
        template={tpl}
        value={customFields[tpl.field_key] ?? ''}
        onChange={(v) => setCustomFields((f) => ({ ...f, [tpl.field_key]: v }))}
      />
    ));

  // Every section interleaves standard and custom fields in the saved layout
  // order (Ajustes → Trabajos → drag to reorder), so a custom field placed
  // between standard ones renders exactly where the user put it. Composite
  // blocks ride on their anchor key: branch picker with 'client_id', the
  // proposal-dates / status+priority block on 'priority', map-link+coords on
  // 'coordinates', the city/state row on the first of job_city/job_state,
  // and the whole lead/crew/drivers block on 'assigned_workers'.
  // Keys that failed the required-fields check on the last save attempt —
  // their blocks get a red outline so the culprit is visible, not just the
  // message at the bottom.
  const [missingKeys, setMissingKeys] = useState<string[]>([]);

  const renderJobFieldInner = (k: string): React.ReactNode => {
    if (k === 'client_id') {
      return (
        <Fragment key={k}>
          <View className="flex flex-col gap-2 mt-3">
            <Text className="text-sm font-semibold text-ink">{jrl('client_id', t.clientLabel)}</Text>
            <Pressable
              onPress={() => setClientPickerOpen(true)}
              className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5"
            >
              {selectedClient ? (
                <Text className="text-base text-ink flex-1" numberOfLines={1}>
                  {(() => {
                    const d = clientPickerDisplay(selectedClient);
                    return d.sub ? `${d.top} · ${d.sub}` : d.top;
                  })()}
                </Text>
              ) : (
                <Text className="text-base text-faint flex-1">{t.clientPlaceholder}</Text>
              )}
              {clientId ? (
                <Pressable
                  onPress={() => setClientId('')}
                  hitSlop={8}
                  className="mr-2 p-1 rounded-lg"
                >
                  <X size={14} color={c.faint} />
                </Pressable>
              ) : null}
              <ChevronDown size={16} color={c.faint} />
            </Pressable>
          </View>

          {/* Branch picker — multi-location businesses only. Hidden for field
             crew: their job auto-uses their own branch. */}
          {locations.length >= 2 && !restrictedCreator ? (
            <View className="flex flex-col gap-2 mt-3">
              <Text className="text-sm font-semibold text-ink">{locale === 'es' ? 'Ubicación' : 'Location'}</Text>
              <View className="flex-row flex-wrap gap-2">
                {[{ id: '', name: locale === 'es' ? 'Sin ubicación' : 'No location' }, ...locations].map((l) => {
                  const selected = locationId === l.id;
                  return (
                    <Pressable
                      key={l.id || 'none'}
                      onPress={() => setLocationId(l.id)}
                      className={`rounded-full border px-4 py-2 ${selected ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
                    >
                      <Text className={`text-sm font-medium ${selected ? 'text-primary' : 'text-muted'}`}>{l.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </Fragment>
      );
    }
    if (k === 'priority') {
      return (
        <Fragment key={k}>
          {isProposal ? (
            <View className="mt-3 gap-3">
              <DatePicker label={t.issueDateLabel} value={issueDate} onChange={setIssueDate} />
              <DatePicker label={t.expiryDateLabel} value={expiryDate} onChange={setExpiryDate} />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <DatePicker
                    label={t.projectStartLabel}
                    value={scheduledDate}
                    onChange={setScheduledDate}
                  />
                </View>
                {!fHidden('end_date') ? (
                  <View className="flex-1">
                    <DatePicker label={t.endDateLabel} value={endDate} onChange={setEndDate} />
                  </View>
                ) : null}
              </View>
              {totalTimeText ? (
                <View className="flex-row justify-end items-baseline gap-1.5">
                  <Text className="text-xs text-muted">{t.totalTimeLabel}:</Text>
                  <Text className="text-sm font-semibold text-primary">{totalTimeText}</Text>
                </View>
              ) : null}
            </View>
          ) : canSchedule ? (
            /* Hidden entirely for field crew who can only log completed work
               (no scheduling → no status/priority). */
            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                {/* Statuses the form can't represent (invoiced/sent/…) are shown
                   READ-ONLY so editing can't downgrade an invoiced job. */}
                {(!loadedStatus || ['posible', 'scheduled', 'in_progress', 'completed'].includes(loadedStatus)) ? (
                  <Select
                    label={t.statusLabel}
                    value={status}
                    onValueChange={(v) => setStatus(v as 'posible' | 'scheduled' | 'in_progress' | 'completed')}
                    options={[
                      { value: 'posible', label: tStatuses.posible },
                      { value: 'scheduled', label: tStatuses.scheduled },
                      { value: 'in_progress', label: tStatuses.in_progress },
                      { value: 'completed', label: tStatuses.completed },
                    ]}
                  />
                ) : (
                  <>
                    <Text className="text-sm font-medium text-ink mb-1.5">{t.statusLabel}</Text>
                    <View className="rounded-xl border border-border bg-surface px-4 py-3">
                      <Text className="text-sm text-muted">{(tStatuses as Record<string, string>)[loadedStatus] ?? loadedStatus}</Text>
                    </View>
                  </>
                )}
              </View>
              <View className="flex-1">
                <Select
                  label={t.priorityLabel}
                  value={priority}
                  onValueChange={(v) =>
                    setPriority(v as 'low' | 'normal' | 'high' | 'urgent')
                  }
                  options={[
                    { value: 'low', label: tPriorities.low },
                    { value: 'normal', label: tPriorities.normal },
                    { value: 'high', label: tPriorities.high },
                    { value: 'urgent', label: tPriorities.urgent },
                  ]}
                />
              </View>
            </View>
          ) : null}
        </Fragment>
      );
    }
    if (k === 'description') {
      if (fHidden('description')) return null;
      return (
        <View key={k} className="flex flex-col gap-2 mt-3">
          <Text className="text-sm font-semibold text-ink">{jrl('description', t.descriptionLabel)}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t.descriptionPlaceholder}
            placeholderTextColor={c.faint}
            multiline
            numberOfLines={3}
            className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink min-h-[80px]"
            style={{ textAlignVertical: 'top' }}
          />
        </View>
      );
    }
    // ── Location section keys ──
    if (k === 'coordinates') {
      if (fHidden('coordinates')) return null;
      return (
        <Fragment key={k}>
          {/* "Use my location" FIRST — the most common action when creating a
             job on-site (it also auto-runs for brand-new jobs). */}
          <Pressable
            onPress={useMyLocation}
            disabled={gettingLocation}
            className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 py-3"
          >
            {gettingLocation ? (
              <ActivityIndicator size="small" color={c.primary} />
            ) : (
              <Navigation size={15} color={c.primary} />
            )}
            <Text className="text-sm font-semibold text-primary">
              {gettingLocation ? t.gettingLocation : t.useMyLocation}
            </Text>
          </Pressable>

          {/* Map link paste — auto-fills address/city/state */}
          <View className="flex flex-col gap-2 mt-3">
            <View className="flex-row items-center gap-1.5">
              <Link2 size={13} color={c.faint} />
              <Text className="text-sm font-semibold text-ink">{jrl('coordinates', t.mapLinkLabel)}</Text>
            </View>
            <TextInput
              value={mapLink}
              onChangeText={parseMapLink}
              placeholder={t.mapLinkPlaceholder}
              placeholderTextColor={c.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink"
            />
            {mapLinkUnrecognized ? (
              <Text className="text-xs text-amber-600">{t.mapLinkHint}</Text>
            ) : null}
          </View>

          {/* Coordinates — lat, lng */}
          <View className="flex flex-col gap-2 mt-3">
            <View className="flex-row items-center gap-1.5">
              <Navigation size={13} color={c.faint} />
              <Text className="text-sm font-semibold text-ink">{t.coordinatesLabel}</Text>
            </View>
            <TextInput
              value={coordsText}
              onChangeText={onCoordsChange}
              placeholder={t.coordinatesPlaceholder}
              placeholderTextColor={c.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              className={`rounded-2xl border bg-card px-4 py-3 text-base text-ink ${
                coordsInvalid ? 'border-red-300' : 'border-border'
              }`}
            />
            {coordsInvalid ? (
              <Text className="text-xs text-red-500">{t.coordinatesInvalid}</Text>
            ) : null}
          </View>
        </Fragment>
      );
    }
    if (k === 'job_address') {
      if (fHidden('job_address')) return null;
      return (
        <View key={k} className="mt-3">
          <Input
            label={jrl('job_address', t.addressLabel)}
            placeholder={t.addressPlaceholder}
            value={address}
            onChangeText={setAddress}
          />
        </View>
      );
    }
    if (k === 'job_city' || k === 'job_state') {
      // City + state share one row — rendered at the first of the two keys
      // in layout order; the second returns null.
      if (fHidden('job_city') && fHidden('job_state')) return null;
      const locKeys = fieldsInSection(jobLayout, 'location');
      const first = locKeys.find((x) => x === 'job_city' || x === 'job_state');
      if (k !== first) return null;
      return (
        <View key={k} className="flex-row gap-3 mt-3">
          {!fHidden('job_city') && (
          <View className="flex-1">
            <Input
              label={jrl('job_city', t.cityLabel)}
              placeholder={t.cityPlaceholder}
              value={city}
              onChangeText={setCity}
            />
          </View>
          )}
          {!fHidden('job_state') && (
          <View style={fHidden('job_city') ? { flex: 1 } : { width: 110 }}>
            <Select
              label={jrl('job_state', t.stateLabel)}
              value={state}
              onValueChange={setState}
              placeholder={t.stateNone}
              searchable
              options={[
                // "—" first so a previously-picked state can be cleared.
                { value: '', label: t.stateNone },
                ...US_STATES.map((s) => ({ value: s, label: usStateName(s, locale) })),
              ]}
            />
          </View>
          )}
        </View>
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
        <View key={k} className="flex-row gap-3 mt-3">
          <View className="flex-1">
            <DatePicker label={jrl('scheduled_date', singleDate ? t.dateFieldLabel : t.dateLabel)} value={scheduledDate} onChange={setScheduledDate} />
          </View>
          {!singleDate ? (
            <View className="flex-1">
              <DatePicker label={t.endDateLabel} value={endDate} onChange={setEndDate} />
            </View>
          ) : null}
        </View>
      );
    }
    if (k === 'time_start') {
      // "Time" is a single toggle gating start time, end time AND the
      // all-day switch (which only makes sense when times are shown).
      if (fHidden('time_start')) return null;
      return (
        <Fragment key={k}>
          <View className="mt-4 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-ink">{t.allDayLabel}</Text>
            <Toggle value={allDay} onValueChange={setAllDay} />
          </View>
          {!allDay ? (
            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                <DatePicker
                  label={jrl('time_start', t.timeStartLabel)}
                  mode="time"
                  value={timeStart}
                  onChange={setTimeStart}
                />
              </View>
              <View className="flex-1">
                <DatePicker
                  label={jrl('time_end', t.timeEndLabel)}
                  mode="time"
                  value={timeEnd}
                  onChange={setTimeEnd}
                />
              </View>
            </View>
          ) : null}
        </Fragment>
      );
    }
    if (k === 'total_hours') {
      // Total hours — auto from start/end (read-only) when both times are
      // set, else manual entry. Credited to each worker in Reports.
      if (fHidden('total_hours')) return null;
      return (
        <View key={k} className="mt-3">
          <Text className="text-sm font-medium text-ink mb-2">{jrl('total_hours', t.totalHoursLabel)}</Text>
          {bothTimesSet ? (
            <View className="rounded-2xl border border-border bg-border-soft px-4 py-3.5 flex-row items-center justify-between">
              <Text className="text-base text-muted">
                {computedHours != null ? `${computedHours} h` : '—'}
              </Text>
              <Text className="text-xs text-faint">{t.totalHoursAutoHint}</Text>
            </View>
          ) : (
            <Input
              value={totalHours}
              onChangeText={(v) => setTotalHours(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          )}
          <Text className="text-xs text-faint mt-1.5">{t.totalHoursHint}</Text>
        </View>
      );
    }
    // ── Workers section key (whole lead/crew/drivers block) ──
    if (k === 'assigned_workers') {
      // Crew mode off = solo business: no lead/crew/driver pickers at all.
      // Saving still preserves any existing assignments (state loads from the
      // job) and field creators still self-assign (RLS needs it to see the job).
      if (business?.job_crew_mode === false) return null;
      return (
        <Fragment key={k}>
          {employees.length > 0 && canStaff ? (
            <>
              {/* Crew Finder — dispatcher tool; managers+ only. Hidden when the
                 business turned "Suggest crew" off in Settings > Jobs. */}
              {canAssign && business?.crew_finder_enabled !== false ? (
              <Pressable
                onPress={() => setCrewFinderOpen(true)}
                className="mb-4 flex-row items-center justify-center gap-1.5 rounded-2xl border border-primary/30 bg-primary/5 py-3"
              >
                <Navigation size={15} color={c.primary} />
                <Text className="text-sm font-semibold text-primary">{full.dashboard.crewFinder.openButton}</Text>
              </Pressable>
              ) : null}
              {/* Lead picker — one designated lead (crew mode only). Hidden for
                 field creators: the person logging the job IS the lead. */}
              {canAssign || (creatorStaff && !restrictedCreator) ? (
                <View className="mb-4">
                  <Text className="text-sm font-semibold text-ink mb-2">{t.leadLabel}</Text>
                  <Pressable
                    onPress={() => { setLeadSearch(''); setLeadPickerOpen(true); }}
                    className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5"
                  >
                    <Text className={`text-base flex-1 ${leadEmployee ? 'text-ink' : 'text-faint'}`} numberOfLines={1}>
                      {leadEmployee ? `${leadEmployee.first_name} ${leadEmployee.last_name}` : t.leadNone}
                    </Text>
                    <ChevronDown size={16} color={c.faint} />
                  </Pressable>
                </View>
              ) : null}

              {/* Crew — searchable multi-select. The lead is shown in its own
                 picker above and excluded here. */}
              <View className="mb-3">
                <Text className="text-sm font-semibold text-ink mb-2">{t.crewLabel}</Text>
                <Pressable
                  onPress={() => { setCrewSearch(''); setCrewPickerOpen(true); }}
                  className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5"
                >
                  <Text className={`text-base flex-1 ${assignedEmployees.length > 0 ? 'text-ink' : 'text-faint'}`} numberOfLines={1}>
                    {assignedEmployees.length > 0
                      ? t.crewSelectedCount.replace('{{count}}', String(assignedEmployees.length))
                      : t.crewPlaceholder}
                  </Text>
                  <ChevronDown size={16} color={c.faint} />
                </Pressable>
                {assignedEmployees.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2 mt-2">
                    {employees
                      .filter((emp) => assignedEmployees.includes(emp.id))
                      .map((emp) => (
                        <Pressable
                          key={emp.id}
                          onPress={() => toggleEmployee(emp.id)}
                          className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-primary/10 border border-primary/20"
                        >
                          <Text className="text-xs font-medium text-primary">
                            {emp.first_name} {emp.last_name}
                          </Text>
                          <X size={12} color={c.primary} />
                        </Pressable>
                      ))}
                  </View>
                ) : null}
              </View>

              {/* Workers carried as a NAME with no employee_id. CSV imports
                  create these — the old system's crew names never resolved to
                  employee records. The state was loaded and written back on
                  save but never rendered, so a job could list six workers on
                  its detail page and show "1 selected" here, looking like the
                  form had dropped five people. */}
              <View className="mt-4">
                <Text className="text-sm font-semibold text-ink mb-2">{t.additionalWorkersLabel}</Text>
                {manualWorkers.map((name, i) => (
                  <View key={i} className="flex-row items-center gap-2 mb-2">
                    <TextInput
                      value={name}
                      onChangeText={(v) => setManualWorkers((prev) => prev.map((w, j) => (j === i ? v : w)))}
                      placeholder={t.workerNumberPlaceholder.replace('{{count}}', String(i + 1))}
                      placeholderTextColor={c.faint}
                      className="flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink"
                    />
                    {manualWorkers.length > 1 ? (
                      <Pressable
                        onPress={() => setManualWorkers((prev) => prev.filter((_, j) => j !== i))}
                        hitSlop={8}
                        className="p-2"
                      >
                        <X size={16} color={c.faint} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                <Pressable onPress={() => setManualWorkers((prev) => [...prev, ''])} hitSlop={6} className="self-start py-1">
                  <Text className="text-sm font-semibold text-primary">{t.addWorker}</Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {/* Drivers — optional multi-select (like crew). Each driver is
              credited driverHours on top of the job's total hours. */}
          {employees.length > 0 && canStaff ? (
            <View className="mt-4">
              <Text className="text-sm font-semibold text-ink mb-2">{t.driverLabel}</Text>
              <Pressable
                onPress={() => { setDriverSearch(''); setDriverPickerOpen(true); }}
                className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5"
              >
                <Text className={`text-base flex-1 ${driverEmployeeIds.length > 0 ? 'text-ink' : 'text-faint'}`} numberOfLines={1}>
                  {driverEmployeeIds.length > 0
                    ? t.crewSelectedCount.replace('{{count}}', String(driverEmployeeIds.length))
                    : t.driverNone}
                </Text>
                <ChevronDown size={16} color={c.faint} />
              </Pressable>
              {driverEmployeeIds.length > 0 ? (
                <View className="flex-row flex-wrap gap-2 mt-2">
                  {employees
                    .filter((emp) => driverEmployeeIds.includes(emp.id))
                    .map((emp) => (
                      <Pressable
                        key={emp.id}
                        onPress={() => toggleDriver(emp.id)}
                        className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-primary/10 border border-primary/20"
                      >
                        <Text className="text-xs font-medium text-primary">
                          {emp.first_name} {emp.last_name}
                        </Text>
                        <X size={12} color={c.primary} />
                      </Pressable>
                    ))}
                </View>
              ) : null}
              {driverEmployeeIds.length > 0 ? (
                <View className="mt-3">
                  <Text className="text-sm font-semibold text-ink mb-2">{t.driverHoursLabel}</Text>
                  <Input
                    value={driverHours}
                    onChangeText={(v) => setDriverHours(v.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                  <Text className="text-xs text-faint mt-1.5">{t.driverHoursHint}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Fragment>
      );
    }
    // ── Notes section keys ──
    if (k === 'internal_notes') {
      if (restrictedCreator) return null; // office-only note
      if (!isProposal && fHidden('internal_notes')) return null;
      return (
        <View key={k} className="mt-3">
          <Text className="text-sm font-semibold text-ink mb-2">
            {isProposal ? t.internalNoteLabelProposal : jrl('internal_notes', t.internalNoteLabelJob)}
          </Text>
          <TextInput
            value={internalNotes}
            onChangeText={setInternalNotes}
            placeholder={isProposal ? t.internalNotePlaceholderProposal : t.internalNotePlaceholderJob}
            placeholderTextColor={c.faint}
            multiline
            numberOfLines={4}
            className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink min-h-[100px]"
            style={{ textAlignVertical: 'top' }}
          />
        </View>
      );
    }
    if (k === 'worker_notes') {
      // Show it if hidden BUT already has content (e.g. imported) so it's
      // always editable — otherwise stray worker notes can't be cleared.
      if (isProposal || (fHidden('worker_notes') && !workerNotes.trim())) return null;
      return (
        <View key={k} className="mt-4">
          <Text className="text-sm font-semibold text-ink mb-2">
            {t.workerNoteLabel}
          </Text>
          <TextInput
            value={workerNotes}
            onChangeText={setWorkerNotes}
            placeholder={t.workerNotePlaceholder}
            placeholderTextColor={c.faint}
            multiline
            numberOfLines={3}
            className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink min-h-[80px]"
            style={{ textAlignVertical: 'top' }}
          />
        </View>
      );
    }
    if (k.startsWith('custom:')) {
      const tpl = templates.find((tp) => `custom:${tp.id}` === k);
      return tpl ? (
        <CustomFieldInput
          key={tpl.id}
          template={tpl}
          value={customFields[tpl.field_key] ?? ''}
          onChange={(v) => setCustomFields((f) => ({ ...f, [tpl.field_key]: v }))}
        />
      ) : null;
    }
    return null;
  };

  // Server-side picker search: the picker must be usable BEFORE the full
  // client download finishes (minutes on big businesses). While the local list
  // is still empty we query the server (alphabetical page + term across client
  // fields and contact names); once the full list is cached locally, local
  // filtering takes over (richer matching + offline). Server errors fall back
  // to whatever the local list has.
  const [pickerResults, setPickerResults] = useState<Client[] | null>(null);
  useEffect(() => {
    if (!clientPickerOpen || !business || clients.length > 0) { setPickerResults(null); return; }
    let cancelled = false;
    const h = setTimeout(() => {
      searchClientsServer<Client>(supabase, business.id, clientSearch, 'id, first_name, last_name, company, city, state')
        .then((rows) => { if (!cancelled) setPickerResults(rows as Client[]); })
        .catch(() => { if (!cancelled) setPickerResults(null); });
    }, clientSearch.trim() ? 250 : 0);
    return () => { cancelled = true; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientPickerOpen, clientSearch, business?.id, clients.length > 0]);
  // Picking a server-search result must also land it in `clients` so the
  // selected-name display works before the background download completes.
  const ensureClientInList = (cl: Client) => {
    setClients((prev) => (prev.some((c) => c.id === cl.id) ? prev : [...prev, cl]));
  };

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => {
      const own = [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase();
      if (own.includes(q)) return true;
      // Also match on the client's contacts — search a contact, find the account.
      return (c.contacts ?? []).some((ct) => ct.name.toLowerCase().includes(q) || (ct.role ?? '').toLowerCase().includes(q));
    });
  }, [clients, clientSearch]);

  // The contact that matched the query (when the account matched via a contact,
  // not its own name) — shown under the client so you know who you searched.
  const matchedContactOf = (c: Client) => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return null;
    const own = [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase();
    if (own.includes(q)) return null;
    return (c.contacts ?? []).find((ct) => ct.name.toLowerCase().includes(q) || (ct.role ?? '').toLowerCase().includes(q)) ?? null;
  };

  // Accent-insensitive: "juan" should match "Jùan" (strip diacritics both sides).
  const deaccent = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filterEmployees = (list: Employee[], query: string) => {
    const q = deaccent(query.trim());
    if (!q) return list;
    return list.filter((e) => deaccent(`${e.first_name} ${e.last_name}`).includes(q));
  };
  const filteredLeadEmployees = useMemo(
    () => filterEmployees(employees, leadSearch),
    [employees, leadSearch],
  );
  // Crew picker excludes the current lead — the lead is always part of the
  // crew at save time but is shown in its own picker, not here.
  const crewEmployees = useMemo(
    () => employees.filter((e) => business?.job_crew_mode !== false ? e.id !== leadEmployeeId : true),
    [employees, leadEmployeeId, business?.job_crew_mode],
  );
  const filteredCrewEmployees = useMemo(
    () => filterEmployees(crewEmployees, crewSearch),
    [crewEmployees, crewSearch],
  );
  const leadEmployee = employees.find((e) => e.id === leadEmployeeId) ?? null;

  // ─── Double-booking detection ──────────────────────────────────────────────
  // Warn (never block) when an assigned person already has an overlapping job.
  // Fetch jobs sharing the date span once per date change; recompute conflicts
  // cheaply whenever the crew/drivers/times change.
  const [conflictJobs, setConflictJobs] = useState<ExistingAssignedJob[]>([]);
  useEffect(() => {
    if (!business || !scheduledDate) { setConflictJobs([]); return; }
    let cancelled = false;
    fetchJobsForConflictCheck(supabase, business.id, scheduledDate, endDate || scheduledDate)
      .then((js) => { if (!cancelled) setConflictJobs(js); })
      .catch(() => { if (!cancelled) setConflictJobs([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, scheduledDate, endDate]);

  const assignedPeople = useMemo(() => {
    const ids = new Set<string>([...assignedEmployees, ...driverEmployeeIds]);
    return employees.filter((e) => ids.has(e.id)).map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}`.trim() }));
  }, [assignedEmployees, driverEmployeeIds, employees]);

  const conflicts = useMemo(() => detectJobConflicts({
    newJob: { scheduledDate: scheduledDate || null, endDate: endDate || null, allDay, timeStart: timeStart || null, timeEnd: timeEnd || null },
    newJobId: editId,
    assigned: assignedPeople,
    existingJobs: conflictJobs,
  }), [scheduledDate, endDate, allDay, timeStart, timeEnd, assignedPeople, conflictJobs, editId]);
  const hardConflicts = conflicts.filter((c) => c.severity === 'hard');
  const softConflicts = conflicts.filter((c) => c.severity === 'soft');
  const conflictLine = (c: JobConflict) => {
    const when = c.allDay ? t.conflictAllDay : c.timeLabel;
    return `${c.employeeName} · ${c.jobTitle || t.conflictUntitled} · ${formatDateLong(c.jobDate, locale)}${when ? ` (${when})` : ''}`;
  };

  // Driver pool — ANY employee, not just the crew. A driver-only person (drove
  // but didn't work the job) is credited ONLY their driver hours in Reports,
  // never the job's total hours (which go to the assigned crew).
  const filteredDriverPool = useMemo(
    () => filterEmployees(employees, driverSearch),
    [employees, driverSearch],
  );
  const toggleDriver = (id: string) =>
    setDriverEmployeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  // Drop any drivers whose employee no longer exists.
  useEffect(() => {
    setDriverEmployeeIds((prev) => {
      const next = prev.filter((id) => employees.some((e) => e.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [employees]);

  const pickClient = (id: string) => {
    setClientId(id);
    setClientPickerOpen(false);
    setClientSearch('');
    // Don't auto-fill city/state from the client record — the job's location
    // is the worksite, which often differs from the client's mailing address.
  };

  // Open the quick-add sheet, pre-filling the first name with whatever the user
  // already typed into the picker search box.
  const openQuickAdd = () => {
    setQaFirstName(clientSearch.trim());
    setQaLastName('');
    setQaCompany('');
    setQaPhone('');
    setQaError('');
    // Two RN modals can't be on screen at once on iOS — the second silently
    // fails to present. Close the picker first; on iOS the picker's onDismiss
    // opens quick-add once it's fully gone. Android has no such restriction.
    if (Platform.OS === 'ios') {
      setPendingQuickAdd(true);
      setClientPickerOpen(false);
    } else {
      setClientPickerOpen(false);
      setQuickAddOpen(true);
    }
  };

  const saveQuickClient = async () => {
    if (!business) return;
    if (!qaFirstName.trim()) {
      setQaError(locale === 'es' ? 'El nombre es obligatorio' : 'First name is required');
      return;
    }
    setQaSaving(true);
    setQaError('');
    try {
      const { data, error: insErr } = await supabase
        .from('clients')
        .insert({
          business_id: business.id,
          first_name: qaFirstName.trim(),
          last_name: qaLastName.trim() || null,
          company: qaCompany.trim() || null,
          phone_cell: qaPhone.trim() || null,
        })
        .select('id, first_name, last_name, company, address, city, state')
        .single();
      if (insErr || !data) throw new Error(insErr?.message ?? (locale === 'es' ? 'No se pudo crear el cliente' : 'Could not create client'));
      const newClient: Client = {
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name ?? '',
        company: data.company ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
      };
      setClients((prev) => [...prev, newClient]);
      setClientId(newClient.id);
      setClientSearch('');
      setQuickAddOpen(false);
      setClientPickerOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : (locale === 'es' ? 'No se pudo crear el cliente' : 'Could not create client');
      setQaError(msg);
      Alert.alert(locale === 'es' ? 'Error' : 'Error', msg);
    } finally {
      setQaSaving(false);
    }
  };

  const toggleEmployee = (id: string) => {
    // Removing the lead from the crew is allowed — they stay lead (unpaid on
    // this job); the save path writes them as a crew=false assignment row.
    setAssignedEmployees((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);
  };

  // The job lead lives in its own picker. Leading is NOT crew membership: a
  // lead who should also be PAID for the job must be checked in the crew too
  // (e.g. the owner leads without billing hours). Clearing leaves nobody lead.
  const setLead = (id: string) => {
    setLeadEmployeeId(id || null);
  };

  // Photos picked while CREATING a job — staged locally (nothing uploads if
  // the form is abandoned) and queued right after save, when the job id
  // exists. Edit mode uses the live JobPhotosSection gallery.
  const [pendingPhotos, setPendingPhotos] = useState<{ uri: string }[]>([]);

  // Probed on mount — the Paste button only appears when the clipboard
  // actually holds an image, so it never sits there dead.
  const [canPastePhoto, setCanPastePhoto] = useState(false);
  useEffect(() => { void hasClipboardImage().then(setCanPastePhoto); }, []);

  const pickPendingPhoto = async (source: PhotoSource) => {
    if (pendingPhotos.length >= MAX_PHOTOS_PER_JOB) return;
    let uri: string;
    if (source === 'paste') {
      // Clipboard image → durable file, so it behaves like a picked asset.
      const pasted = await readClipboardImageToFile();
      if (!pasted) return;
      uri = pasted;
    } else {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      // Picker-side quality 0.6 — same compression as the detail gallery.
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.6,
            });
      if (result.canceled || !result.assets?.[0]) return;
      uri = result.assets[0].uri;
    }
    setPendingPhotos(prev => [...prev, { uri }].slice(0, MAX_PHOTOS_PER_JOB));
  };

  // Upload (or enqueue offline) the staged photos against the new job id —
  // same path/payload as the detail gallery's pickAndUpload. A failed photo
  // never blocks the save; the detail gallery is always there to retry.
  const queuePendingPhotos = async (jobId: string) => {
    if (!business) return;
    for (let i = 0; i < pendingPhotos.length; i++) {
      try {
        const path = jobPhotoPath(business.id, jobId, jobPhotoFilename('jpg'));
        // Offline: copy into the document dir so the queued upload survives an
        // app restart (the picker's temp uri can be cleared).
        let uploadUri = pendingPhotos[i].uri;
        if (!isOnlineNow()) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const FileSystem = require('expo-file-system');
            const durable = `${FileSystem.documentDirectory}offline_photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
            await FileSystem.copyAsync({ from: pendingPhotos[i].uri, to: durable });
            uploadUri = durable;
          } catch {
            /* fall back to the temp uri */
          }
        }
        await queuedUpload({
          table: 'job_photos',
          payload: {
            id: newUuid(),
            business_id: business.id,
            job_id: jobId,
            storage_path: path,
            sort_order: i,
            created_by: user?.id ?? null,
          },
          businessId: business.id,
          label: full.dashboard.jobs.detail.photos.addBtn,
          localUri: uploadUri,
          bucket: JOB_PHOTOS_BUCKET,
          storagePath: path,
          contentType: 'image/jpeg',
        });
      } catch {
        /* keep going — remaining photos still upload */
      }
    }
  };

  const renderJobField = (k: string): React.ReactNode => {
    const node = renderJobFieldInner(k);
    if (!node || !missingKeys.includes(k)) return node;
    return (
      <View key={`req-${k}`} className="rounded-2xl border-2 border-red-400 px-2 pt-2 mb-4">
        {node}
      </View>
    );
  };

  const save = async () => {
    if (!business) return;
    if (!title.trim()) {
      setError(isProposal ? t.errorTitleRequiredProposal : t.errorTitleRequiredJob);
      return;
    }
    // Enforce the per-business required job fields. Job mode only, only fields
    // on this form. Runs on save for both new + edit (a past job is only checked
    // if you re-save it).
    if (!isProposal) {
      const fieldVal: Record<string, string> = {
        client_id: clientId,
        description,
        job_address: address,
        job_city: city,
        job_state: state,
        coordinates: (mapLink.trim() || jobLat != null) ? 'x' : '',
        // 'Fecha' is ONE requirable unit covering start AND end date
        // (jobSections: scheduled_date represents both pickers). In
        // single-date mode (end_date hidden) only the start is required.
        scheduled_date: scheduledDate && (fHidden('end_date') || endDate) ? 'x' : '',
        time_start: timeStart,
        time_end: timeEnd,
        total_hours: effectiveTotalHours != null ? 'x' : '',
        assigned_workers: assignedEmployees.length ? 'x' : '',
        internal_notes: internalNotes,
      };
      const missingDefs = JOB_REQUIRABLE.filter(f => jobReq[f.key] && !fHidden(f.key) && !(restrictedCreator && f.key === 'internal_notes') && !(f.key === 'assigned_workers' && (business?.job_crew_mode === false || !canStaff)) && !String(fieldVal[f.key] ?? '').trim());
      setMissingKeys(missingDefs.map(f => f.key));
      if (missingDefs.length) {
        setError(`${locale === 'es' ? 'Campos requeridos' : 'Required fields'}: ${missingDefs.map(f => f.label).join(', ')}`);
        return;
      }
    }
    // Required custom fields — only enforced for sections that actually render.
    // schedule/workers render in job mode only; general/location/notes/additional
    // render in both modes.
    const sectionRendered = (section: JobLayoutSection): boolean =>
      section === 'schedule' || section === 'workers' ? !isProposal : true;
    const missingCustom: string[] = [];
    for (const section of ['general', 'location', 'schedule', 'workers', 'notes', 'additional'] as JobLayoutSection[]) {
      if (!sectionRendered(section)) continue;
      for (const tpl of customFieldsFor(section)) {
        if (tpl.required && String(customFields[tpl.field_key] ?? '').trim() === '') {
          missingCustom.push(tpl.field_label);
        }
      }
    }
    if (missingCustom.length) {
      setError(`${locale === 'es' ? 'Campos requeridos' : 'Required fields'}: ${missingCustom.join(', ')}`);
      return;
    }
    if (coordsText.trim() && coordsInvalid) {
      setError(t.coordinatesInvalid);
      return;
    }
    // Double-booking gate — hard conflicts (all-day overlap / colliding times)
    // ask for confirmation; soft same-day notes never block the save.
    if (hasHardConflict(conflicts)) {
      const ok = await confirm({
        title: t.conflictTitle,
        message: `${t.conflictConfirmMessage}\n\n${hardConflicts.map((c) => `• ${conflictLine(c)}`).join('\n')}`,
        confirmText: t.conflictSaveAnyway,
        cancelText: t.conflictGoBack,
        destructive: true,
      });
      if (!ok) return;
    }
    setSaving(true);
    setError('');
    try {
      let jobId: string;
      // Offline support is for WORK jobs (proposals keep their online numbering).
      let jobQueued = false;
      let optimisticJobRow: Record<string, unknown> | null = null;

      // Shared location/notes fields — populated for both modes so coords and
      // worker notes work everywhere. Items/pricing are intentionally NOT
      // touched here; those live on the detail page now.
      const locationAndNotes = {
        location_id: locationId || null,
        job_address: address.trim() || null,
        job_city: city.trim() || null,
        job_state: state || null,
        job_map_link: mapLink.trim() || null,
        job_lat: jobLat,
        job_lng: jobLng,
        internal_notes: internalNotes.trim() || null,
        worker_notes: workerNotes.trim() || null,
        published_to_crew: restrictedCreator ? true : publishedToCrew,
        custom_fields: customFields,
      };

      if (isProposal) {
        const proposalData = {
          ...locationAndNotes,
          client_id: clientId || null,
          title: title.trim(),
          description: description.trim() || null,
          notes: clientNotes.trim() || null,
          issue_date: issueDate,
          expiry_date: expiryDate || null,
          scheduled_date: scheduledDate || null,
          end_date: fHidden('end_date') ? null : (endDate || null),
        };

        if (editId) {
          const { error: upErr } = await supabase.from('jobs').update(proposalData).eq('id', editId);
          if (upErr) throw new Error(upErr.message);
          jobId = editId;
        } else {
          // Auto-number: COT-XXXX, based on count of existing proposals in this business.
          const { count } = await supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', business.id)
            .not('estimate_number', 'is', null);
          const estNum = `COT-${String((count ?? 0) + 1).padStart(4, '0')}`;
          const { data: created, error: insErr } = await supabase
            .from('jobs')
            .insert({
              business_id: business.id,
              status: 'proposal',
              priority: 'normal',
              estimate_number: estNum,
              created_by: user?.id ?? null,
              ...proposalData,
            })
            .select()
            .single();
          if (insErr || !created) throw new Error(insErr?.message ?? t.errorSaveGeneric);
          jobId = created.id;
        }
      } else {
        const jobData = {
          ...locationAndNotes,
          client_id: clientId || null,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          scheduled_date: scheduledDate || null,
          end_date: fHidden('end_date') ? null : (endDate || null),
          all_day: allDay,
          time_start: allDay ? null : (timeStart || null),
          time_end: allDay ? null : (timeEnd || null),
          total_hours: effectiveTotalHours,
          driver_employee_ids: driverEmployeeIds,
          driver_hours: driverEmployeeIds.length && driverHours.trim() ? parseFloat(driverHours) : null,
        };

        if (editId) {
          // Persist the (possibly changed) status — previously omitted, so
          // status edits silently didn't apply. Stamp the pipeline timestamp
          // only on a real transition (mirrors the detail stepper / 074).
          // Preserve the ORIGINAL status unless the user actually changed the
          // picker. Statuses the form can't represent (invoiced/sent/accepted/…)
          // load as "scheduled"; writing that back would downgrade the job.
          const mappedLoaded = loadedStatus && ['in_progress', 'posible', 'completed'].includes(loadedStatus)
            ? loadedStatus : 'scheduled';
          const userChangedStatus = status !== mappedLoaded;
          const statusToWrite = userChangedStatus ? status : (loadedStatus ?? status);
          const jobUpdate: Record<string, unknown> = { ...jobData, status: statusToWrite };
          if (userChangedStatus) {
            const nowIso = new Date().toISOString();
            if (statusToWrite === 'scheduled') jobUpdate.scheduled_at = nowIso;
            else if (statusToWrite === 'in_progress') jobUpdate.in_progress_at = nowIso;
            else if (statusToWrite === 'completed') jobUpdate.completed_at = nowIso;
          }
          const upRes = await queuedUpdate({ table: 'jobs', match: { id: editId }, payload: jobUpdate, businessId: business.id, label: `Trabajo: ${title.trim()}` });
          jobQueued = upRes.queued;
          jobId = editId;
        } else {
          // Client-generated id so creating a job offline works (and assignments
          // can reference it before it syncs). Stable across retries — see
          // draftJobIdRef.
          jobId = draftJobIdRef.current;
          // Stamp the pipeline timestamp(s) for the INITIAL status so the stepper
          // shows a date under each reached step (a job created straight as
          // "scheduled" previously had a blank scheduled_at). Backfill earlier
          // linear steps too.
          const nowIso = new Date().toISOString();
          const createStamps: Record<string, unknown> = {};
          if (status === 'scheduled' || status === 'in_progress' || status === 'completed') createStamps.scheduled_at = nowIso;
          if (status === 'in_progress' || status === 'completed') createStamps.in_progress_at = nowIso;
          if (status === 'completed') { createStamps.completed_at = nowIso; createStamps.completed_date = todayLocalISO(); }
          const payload = { id: jobId, business_id: business.id, status, created_by: user?.id ?? null, ...jobData, ...createStamps };
          const insRes = await queuedInsert({
            table: 'jobs',
            payload,
            businessId: business.id,
            label: `Trabajo: ${title.trim()}`,
          });
          jobQueued = insRes.queued;
          optimisticJobRow = { ...payload, clients: null, job_assignments: [] };
        }
      }

      void logAudit(supabase, business.id, editId ? 'job.updated' : 'job.created', 'job', jobId, {
        title: title.trim(),
      });

      // Replace assignments (jobs only — proposals don't carry crew yet).
      // Existing job_items are intentionally preserved; we no longer manage
      // line items from this form (moved to detail page).
      if (!isProposal) {
        try {
        // Unknown baseline + nothing picked → leave the server's crew alone
        // (deleting here wiped workers whenever the prefill couldn't load).
        const skipAssignmentReplace = !!editId && !assignsBaselineRef.current
          && assignedEmployees.length === 0 && !leadEmployeeId
          && manualWorkers.every((w) => !w.trim());
        if (!skipAssignmentReplace) {
        if (editId) await queuedDelete({ table: 'job_assignments', match: { job_id: jobId }, businessId: business.id, label: 'Asignaciones' });
        const assignments: {
          job_id: string;
          employee_id?: string;
          worker_name: string;
          is_lead?: boolean;
          crew?: boolean;
        }[] = [];
        assignedEmployees.forEach((empId) => {
          const emp = employees.find((e) => e.id === empId);
          if (emp) {
            assignments.push({
              job_id: jobId,
              employee_id: empId,
              worker_name: `${emp.first_name} ${emp.last_name}`,
              is_lead: empId === leadEmployeeId,
              crew: true,
            });
          }
        });
        // A lead OUTSIDE the crew gets a crew=false row: shown as lead
        // everywhere, credited zero hours in payroll (migration 189).
        if (leadEmployeeId && !assignments.some((a) => a.is_lead)) {
          const lead = employees.find((e) => e.id === leadEmployeeId);
          if (lead) {
            assignments.push({
              job_id: jobId,
              employee_id: leadEmployeeId,
              worker_name: `${lead.first_name} ${lead.last_name}`,
              is_lead: true,
              crew: false,
            });
          }
        }
        manualWorkers
          .map((w) => w.trim())
          .filter(Boolean)
          .forEach((name) => assignments.push({ job_id: jobId, worker_name: name }));
        // Carry through any loaded row the form could not represent. The save
        // deletes every assignment and re-inserts from the pickers, so without
        // this a row the UI cannot show is silently destroyed on any save —
        // renaming a job wiped its crew. Nothing here is user-visible; it just
        // refuses to lose data the form does not understand.
        if (editId) {
          const pickedIds = new Set(assignments.map((a) => a.employee_id).filter(Boolean) as string[]);
          const pickedNames = new Set(
            assignments.map((a) => (a.worker_name ?? '').trim().toLowerCase()).filter(Boolean),
          );
          for (const row of loadedAssignsRef.current) {
            const byId = row.employee_id && pickedIds.has(row.employee_id);
            const byName = (row.worker_name ?? '').trim() && pickedNames.has((row.worker_name ?? '').trim().toLowerCase());
            if (byId || byName) continue;
            if (!row.employee_id && !(row.worker_name ?? '').trim()) continue; // nothing to keep
            assignments.push({
              job_id: jobId,
              ...(row.employee_id ? { employee_id: row.employee_id } : {}),
              worker_name: (row.worker_name ?? '').trim(),
              ...(row.is_lead ? { is_lead: true } : {}),
              ...(row.crew === false ? { crew: false } : {}),
            });
          }
        }
        // Field creator: self-assign so they can see their own job (RLS 044/089
        // requires assigned + published for field reads) and become the lead if
        // none was picked — "the person logging the job is the lead".
        if (restrictedCreator && !editId) {
          const alreadyLead = assignments.some((a) => a.is_lead);
          const creatorName = (user?.name ?? '').trim();
          if (myEmployeeId) {
            const mine = assignments.find((a) => a.employee_id === myEmployeeId);
            if (mine) {
              // Creator already picked himself as crew — promote that row so
              // the job still gets a lead ("the person logging it is the lead").
              if (!alreadyLead) mine.is_lead = true;
            } else {
              assignments.push({ job_id: jobId, employee_id: myEmployeeId, worker_name: creatorName, is_lead: !alreadyLead, crew: true });
            }
          } else if (!alreadyLead && creatorName) {
            // No linked employee record yet (e.g. an invite not yet reconciled)
            // — still record the creator's NAME as lead so it's never blank.
            assignments.push({ job_id: jobId, worker_name: creatorName, is_lead: true, crew: true });
          }
        }
        // Per-assignment insert with client ids so an offline retry is idempotent.
        for (const a of assignments) {
          await queuedInsert({ table: 'job_assignments', payload: { id: newUuid(), ...a }, businessId: business.id, label: `Asignación: ${a.worker_name}` });
        }
        }
        } catch (assignErr) {
          // The job row is already saved — a failed assignment write must not
          // abort the save (retrying duplicated jobs before this guard).
          console.warn('job_assignments write failed', assignErr);
        }
      }

      // Staged photos (create mode) → upload now, or queue in the outbox when
      // offline — the client-generated job id makes both paths safe.
      if (!editId && pendingPhotos.length) await queuePendingPhotos(jobId);

      if (jobQueued && optimisticJobRow) {
        // Offline create: seed caches so the job shows in the list + opens, then
        // go to the list (the detail's joined client data isn't available yet).
        void prependCached(`jobs_list_${business.id}`, optimisticJobRow);
        void writeCached(`job_${jobId}`, optimisticJobRow);
        router.replace('/dashboard/trabajos' as never);
      } else if (editId && router.canGoBack()) {
        // Editing: pop the edit screen back to the ORIGINAL job detail (it
        // refetches on focus and keeps its own from/invoice params) instead of
        // replacing — replace stacked a duplicate detail, so the detail's Back
        // button returned to the detail again rather than the list.
        router.back();
      } else {
        router.replace(`/dashboard/trabajos/${jobId}` as never);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorSaveGeneric);
      setSaving(false);
    }
  };

  // expo-router tabs don't push tab switches onto history, so router.back()
  // from a hidden tab screen often lands on the very first tab (home) rather
  // than the trabajos list. Navigate explicitly to the right destination.
  const goBack = () => {
    if (sourceId && router.canGoBack()) {
      // Pop back to the detail/screen we came from (it refetches on focus)
      // instead of replacing — replace stacked a duplicate detail, so pressing
      // Back on the detail returned to the detail again instead of the list.
      router.back();
    } else if (sourceId) {
      router.replace(`/dashboard/trabajos/${sourceId}` as never);
    } else {
      router.replace('/dashboard/trabajos' as never);
    }
  };

  // Unsaved-changes guard on the back arrow + hardware back. `values` covers
  // every editable field (manual workers filtered so the trailing empty row
  // isn't counted); the snapshot is taken once data loads (edit/duplicate) or
  // at mount (new), so untouched forms never prompt. Defined before the
  // loading early-return to keep hook order stable.
  const dirty = useDirty(
    {
      title, clientId, publishedToCrew, status, priority, address, city, state,
      scheduledDate, endDate, allDay, timeStart, timeEnd, totalHours, description,
      internalNotes, workerNotes, assignedEmployees,
      manualWorkers: manualWorkers.filter((w) => w.trim()),
      leadEmployeeId, driverEmployeeIds, driverHours, clientNotes, issueDate, expiryDate, jobLat, jobLng,
    },
    !loadingEdit,
  );
  const { confirmLeave: confirmBack, unsavedSheet } = useUnsavedGuard({ dirty, onLeave: goBack });

  if (loadingEdit) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
          <SkeletonBlock className="h-7 w-56" />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const heading = editId
    ? (isProposal ? t.headingEditProposal : t.headingEditJob)
    : (isProposal ? t.headingNewProposal : t.headingNewJob);
  const subtitle = editId
    ? t.subtitleEdit
    : (isProposal ? t.subtitleNewProposal : t.subtitleNewJob);

  // ── Derived: total-time line + out-of-hours note (job mode schedule) ──
  const durationLabels = full.common.duration;
  const totalTimeText = formatProjectDuration(
    {
      startDate: scheduledDate,
      endDate,
      timeStart: allDay ? null : timeStart,
      timeEnd: allDay ? null : timeEnd,
    },
    durationLabels,
  );

  // Total hours: auto-computed from start+end times when both are set (the
  // field is then read-only), otherwise the manually-typed value. The result
  // is what gets saved and later credited to each assigned worker in Reports.
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

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable
          onPress={confirmBack}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-border-soft"
        >
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <View className="ml-2 flex-1">
          <Text className="text-lg font-bold text-ink">{heading}</Text>
          <Text className="text-xs text-faint">{subtitle}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          contentContainerClassName="px-5 pt-5 pb-44"
          keyboardShouldPersistTaps="handled"
        >
          {/* General info */}
          <Section title={t.generalInfo}>
            <Input
              label={isProposal ? t.titleLabelProposal : t.titleLabelJob}
              placeholder={t.titlePlaceholder}
              value={title}
              onChangeText={setTitle}
            />

            {/* Standard + custom fields, interleaved in saved layout order. */}
            {fieldsInSection(jobLayout, 'general').map(renderJobField)}
          </Section>

          {/* Location — shown for jobs AND estimates (the work has a place even
             at quote time). Save already persists it for both modes. */}
          {(secVisible('location') || customFieldsFor('location').length > 0) && (
            <Section title={t.locationHeading} icon={<MapPin size={14} color={c.primary} />}>
              {/* Standard + custom fields, interleaved in saved layout order. */}
              {fieldsInSection(jobLayout, 'location').map(renderJobField)}
            </Section>
          )}

          {/* Schedule (job mode only) */}
          {!isProposal && (secVisible('schedule') || customFieldsFor('schedule').length > 0) && (
            <Section title={t.scheduleHeading} icon={<CalendarIcon size={14} color={c.primary} />}>
              {/* Standard + custom fields, interleaved in saved layout order. */}
              {fieldsInSection(jobLayout, 'schedule').map(renderJobField)}

              {ohStatus && ohStatus.status !== 'ok' ? (
                <View className="mt-3 flex-row items-start gap-1.5">
                  <Text className="text-xs text-amber-600">⚠</Text>
                  <Text className="text-xs text-amber-600 flex-1">
                    {ohStatus.status === 'closed'
                      ? t.outOfHoursClosedNote
                      : `${t.outOfHoursNote} · ${formatTime12h(ohStatus.day.start)}–${formatTime12h(ohStatus.day.end)}`}
                  </Text>
                </View>
              ) : null}

              {totalTimeText ? (
                <View className="mt-3 flex-row justify-end items-baseline gap-1.5">
                  <Text className="text-xs text-muted">{t.totalTimeLabel}:</Text>
                  <Text className="text-sm font-semibold text-primary">{totalTimeText}</Text>
                </View>
              ) : null}
            </Section>
          )}

          {/* Workers (job mode only; crew mode off hides the standard pickers,
             so only custom fields can justify the section then) */}
          {!isProposal && ((secVisible('workers') && business?.job_crew_mode !== false && employees.length > 0 && canStaff) || customFieldsFor('workers').length > 0) && (
            <Section title={t.workersHeading} icon={<UsersIcon size={14} color={c.primary} />}>
              {/* Standard + custom fields, interleaved in saved layout order. */}
              {fieldsInSection(jobLayout, 'workers').map(renderJobField)}
            </Section>
          )}

          {/* Double-booking warning — assigned crew/drivers already on an
             overlapping job. Soft same-day notes appear below hard conflicts. */}
          {conflicts.length > 0 && (
            <View className="mb-4" style={{ gap: 10 }}>
              {hardConflicts.length > 0 && (
                <View className="rounded-2xl bg-card p-4" style={{ borderWidth: 1, borderColor: c.warning }}>
                  <View className="flex-row items-center mb-2" style={{ gap: 6 }}>
                    <AlertTriangle size={16} color={c.warning} />
                    <Text className="text-sm font-semibold" style={{ color: c.warning }}>{t.conflictTitle}</Text>
                  </View>
                  {hardConflicts.map((cf, i) => (
                    <Text key={`h${i}`} className="text-xs text-ink mb-0.5">{conflictLine(cf)}</Text>
                  ))}
                </View>
              )}
              {softConflicts.length > 0 && (
                <View className="rounded-2xl border border-border-soft bg-card p-4">
                  <View className="flex-row items-center mb-2" style={{ gap: 6 }}>
                    <AlertTriangle size={15} color={c.muted} />
                    <Text className="text-sm font-semibold text-muted">{t.conflictSoftHeading}</Text>
                  </View>
                  {softConflicts.map((cf, i) => (
                    <Text key={`s${i}`} className="text-xs text-faint mb-0.5">{conflictLine(cf)}</Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Items section removed — pricing/line items are managed on the
             detail page now so this form stays focused on scheduling. */}

          {/* Notes (section hideable in job mode) */}
          {/* Mirror the fields' own gates: internal notes are role-gated (field
             creators never see them) — an empty card must not render. */}
          {(isProposal
            || !fHidden('worker_notes')
            || (!restrictedCreator && !fHidden('internal_notes'))
            || customFieldsFor('notes').length > 0) && (
          <Section title={t.notesHeading} icon={<FileText size={14} color={c.primary} />}>
            {isProposal ? (
              <View className="mb-3">
                <Text className="text-sm font-semibold text-ink mb-2">
                  {t.clientNoteLabel}
                </Text>
                <TextInput
                  value={clientNotes}
                  onChangeText={setClientNotes}
                  placeholder={t.clientNotePlaceholder}
                  placeholderTextColor={c.faint}
                  multiline
                  numberOfLines={3}
                  className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink min-h-[80px]"
                  style={{ textAlignVertical: 'top' }}
                />
              </View>
            ) : null}
            {/* Standard + custom fields, interleaved in saved layout order. */}
            {fieldsInSection(jobLayout, 'notes').map(renderJobField)}
          </Section>
          )}

          {/* Additional details — custom fields assigned to the 'additional'
             section. Only rendered when there are any. */}
          {customFieldsFor('additional').length > 0 && (
            <Section title={locale === 'es' ? 'Detalles adicionales' : 'Additional details'}>
              {renderCustomFields('additional')}
            </Section>
          )}

          {/* Photos — edit mode shows the live gallery; create mode stages
             photos locally and queues the uploads right after save (see
             queuePendingPhotos), so nothing lands in storage if the form
             is abandoned. */}
          <Section title={full.dashboard.jobs.detail.photos.heading} icon={<ImagePlus size={14} color={c.primary} />}>
            {editId && business ? (
              <JobPhotosSection jobId={editId} businessId={business.id} canWrite />
            ) : (
              <View>
                {pendingPhotos.length > 0 ? (
                  <View className="flex-row flex-wrap" style={{ gap: 8, marginBottom: 10 }}>
                    {pendingPhotos.map(p => (
                      <View
                        key={p.uri}
                        style={{ width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3F4F6' }}
                      >
                        <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} />
                        <Pressable
                          onPress={() => setPendingPhotos(prev => prev.filter(x => x.uri !== p.uri))}
                          hitSlop={6}
                          style={{
                            position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                            borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <X size={12} color="#fff" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
                {pendingPhotos.length < MAX_PHOTOS_PER_JOB ? (
                  <View className="flex-row" style={{ gap: 10 }}>
                    <Pressable
                      onPress={() => void pickPendingPhoto('camera')}
                      className="flex-1 flex-row items-center justify-center rounded-xl border border-border py-2.5 active:bg-surface"
                    >
                      <Camera size={16} color={c.muted} />
                      <Text className="text-sm font-medium text-muted ml-1.5">
                        {full.dashboard.jobs.detail.photos.takePhoto}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void pickPendingPhoto('library')}
                      className="flex-1 flex-row items-center justify-center rounded-xl border border-border py-2.5 active:bg-surface"
                    >
                      <ImagePlus size={16} color={c.muted} />
                      <Text className="text-sm font-medium text-muted ml-1.5">
                        {full.dashboard.jobs.detail.photos.chooseFromLibrary}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {pendingPhotos.length < MAX_PHOTOS_PER_JOB && canPastePhoto ? (
                  <Pressable
                    onPress={() => void pickPendingPhoto('paste')}
                    className="flex-row items-center justify-center rounded-xl border border-border py-2.5 mt-2.5 active:bg-surface"
                  >
                    <ClipboardPaste size={16} color={c.muted} />
                    <Text className="text-sm font-medium text-muted ml-1.5">
                      {full.dashboard.jobs.detail.photos.pastePhoto}
                    </Text>
                  </Pressable>
                ) : null}
                {pendingPhotos.length > 0 ? (
                  <Text className="text-xs text-faint mt-2.5">
                    {full.dashboard.jobs.detail.photos.pendingHint}
                  </Text>
                ) : null}
              </View>
            )}
          </Section>

          {/* Crew visibility — LAST option of the form (per user preference).
             When off, the job lives only on the owner's scheduler. Hidden for
             field crew: their job is auto-published so they (and any assigned
             crew) can see it. */}
          {!restrictedCreator ? (
            <Section title={t.publishedToCrewLabel} icon={<Eye size={14} color={c.primary} />}>
              <Text className="text-xs text-muted mb-2.5">{t.publishedToCrewHint}</Text>
              <View className="flex-row p-1 rounded-2xl bg-border-soft">
                <Pressable
                  onPress={() => setPublishedToCrew(false)}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${!publishedToCrew ? 'bg-card' : ''}`}
                  style={!publishedToCrew ? {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 3,
                    elevation: 2,
                  } : undefined}
                >
                  <Lock size={13} color={!publishedToCrew ? c.primary : c.faint} />
                  <Text className={`text-sm font-semibold ${!publishedToCrew ? 'text-primary' : 'text-muted'}`}>{t.privateBadge}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPublishedToCrew(true)}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${publishedToCrew ? 'bg-card' : ''}`}
                  style={publishedToCrew ? {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 3,
                    elevation: 2,
                  } : undefined}
                >
                  <Eye size={13} color={publishedToCrew ? c.primary : c.faint} />
                  <Text className={`text-sm font-semibold ${publishedToCrew ? 'text-primary' : 'text-muted'}`}>{t.publicBadge}</Text>
                </Pressable>
              </View>
            </Section>
          ) : null}

          {error ? (
            <View className="mt-4 rounded-2xl bg-red-500/10 border border-red-100 px-4 py-3">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          {/* Save — last element of the form so it's where the thumb lands
             after filling the final field. */}
          <Pressable
            onPress={save}
            disabled={saving}
            className={`mt-4 items-center py-3.5 rounded-2xl ${
              saving ? 'bg-primary/50' : 'bg-primary active:opacity-80'
            }`}
          >
            <Text className="text-base font-semibold text-white">
              {saving ? '…' : tc.buttons.save}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Client picker modal */}
      <RNModal
        visible={clientPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setClientPickerOpen(false)}
        onDismiss={() => {
          // iOS: open quick-add only after the picker has fully dismissed.
          if (pendingQuickAdd) {
            setPendingQuickAdd(false);
            setQuickAddOpen(true);
          }
        }}
      >
        {/* Inline flex:1 (not the `flex-1` class) so this root reliably fills
            the modal host — as the Modal's direct child the NativeWind class
            wasn't expanding to full height, which left the scrim covering only
            the card area instead of the whole screen. */}
        {/* KeyboardAvoidingView: the sheet is anchored to the bottom, exactly
            where the keyboard opens, so its fields sat underneath it. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          {/* Heavier scrim so the form behind reads as a soft dark wash
              instead of being clearly legible through the picker. Color is an
              inline style (not a NativeWind opacity class) so it always
              renders without waiting on a Metro/NativeWind regeneration. */}
          <Pressable
            onPress={() => setClientPickerOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
          {/* Floating card: rounded on all corners, lifted off the screen
              edges with side + bottom margins and a soft shadow. */}
          <View
            className="bg-card rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
            style={{
              height: '80%',
              marginBottom: insets.bottom + 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 24,
              elevation: 24,
            }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="px-5 mb-3 flex-row items-center justify-between">
              <Text className="text-base font-semibold text-ink">{t.clientLabel}</Text>
              <Pressable onPress={() => setClientPickerOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>
            <View className="px-5 mb-3">
              <View className="flex-row items-center rounded-xl border border-border bg-card px-3">
                <Search size={16} color={c.faint} />
                <TextInput
                  value={clientSearch}
                  onChangeText={setClientSearch}
                  placeholder={t.clientSearchPlaceholder}
                  placeholderTextColor={c.faint}
                  className="flex-1 py-2.5 pl-2 text-sm text-ink"
                />
              </View>
            </View>
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => pickClient('')}
                className="flex-row items-center justify-between px-5 py-3.5 active:bg-surface"
              >
                <Text className={`text-base ${!clientId ? 'text-primary font-semibold' : 'text-muted'}`}>
                  {t.clientNone}
                </Text>
                {!clientId ? <Check size={16} color={c.primary} /> : null}
              </Pressable>
              {(pickerResults ?? filteredClients).map((cl) => {
                const isSel = cl.id === clientId;
                const { top, sub } = clientPickerDisplay(cl);
                return (
                  <Pressable
                    key={cl.id}
                    onPress={() => { ensureClientInList(cl); pickClient(cl.id); }}
                    className={`flex-row items-center justify-between px-5 py-3.5 active:bg-surface ${
                      isSel ? 'bg-primary/5' : ''
                    }`}
                  >
                    <View className="flex-1">
                      <Text
                        className={`text-base ${
                          isSel ? 'text-primary font-semibold' : 'text-ink'
                        }`}
                        numberOfLines={1}
                      >
                        {top}
                      </Text>
                      {sub ? (
                        <Text className="text-xs text-faint mt-0.5" numberOfLines={1}>
                          {sub}
                        </Text>
                      ) : null}
                      {(() => {
                        const ct = matchedContactOf(cl);
                        return ct ? (
                          <Text className="text-xs text-primary mt-0.5" numberOfLines={1}>
                            {ct.name}{ct.role ? `  ·  ${ct.role}` : ''}
                          </Text>
                        ) : null;
                      })()}
                    </View>
                    {isSel ? <Check size={16} color={c.primary} /> : null}
                  </Pressable>
                );
              })}
              {(pickerResults ?? filteredClients).length === 0 ? (
                <View className="px-5 py-8 items-center">
                  <Text className="text-sm text-faint">{t.clientNoResults}</Text>
                </View>
              ) : null}
              {/* Inline create — only when the role can create clients.
                 Pre-fills the first name with the current search text. */}
              {can.createClient(currentRole) ? (
                <Pressable
                  onPress={openQuickAdd}
                  className="flex-row items-center gap-2 px-5 py-3.5 active:bg-surface border-t border-border-soft"
                >
                  <UserPlus size={16} color={c.primary} />
                  <Text className="text-sm font-semibold text-primary">
                    {locale === 'es' ? 'Crear cliente nuevo' : 'Create new client'}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Quick-add client sheet — create a client without leaving the job
         draft. Mirrors the picker's bottom-sheet pattern. */}
      <RNModal
        visible={quickAddOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setQuickAddOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => setQuickAddOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
          <View
            className="bg-card rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
            style={{
              marginBottom: insets.bottom + 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 24,
              elevation: 24,
            }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="px-5 mb-3 flex-row items-center justify-between">
              <Text className="text-base font-semibold text-ink">
                {locale === 'es' ? 'Nuevo cliente' : 'New client'}
              </Text>
              <Pressable onPress={() => setQuickAddOpen(false)} hitSlop={8} className="p-1 rounded-lg">
                <X size={18} color={c.faint} />
              </Pressable>
            </View>
            <ScrollView className="px-5" keyboardShouldPersistTaps="handled">
              <View className="gap-3">
                <Input
                  label={locale === 'es' ? 'Nombre *' : 'First name *'}
                  value={qaFirstName}
                  onChangeText={setQaFirstName}
                />
                <Input
                  label={locale === 'es' ? 'Apellido' : 'Last name'}
                  value={qaLastName}
                  onChangeText={setQaLastName}
                />
                <Input
                  label={locale === 'es' ? 'Empresa' : 'Company'}
                  value={qaCompany}
                  onChangeText={setQaCompany}
                />
                <Input
                  label={locale === 'es' ? 'Celular' : 'Cell'}
                  value={qaPhone}
                  onChangeText={(v) => setQaPhone(formatPhoneInput(v))}
                  keyboardType="phone-pad"
                />
              </View>
              {qaError ? (
                <View className="mt-3 rounded-2xl bg-red-500/10 border border-red-100 px-4 py-3">
                  <Text className="text-sm text-red-600">{qaError}</Text>
                </View>
              ) : null}
              <Pressable
                onPress={saveQuickClient}
                disabled={qaSaving}
                className={`mt-4 items-center py-3.5 rounded-2xl ${
                  qaSaving ? 'bg-primary/50' : 'bg-primary active:opacity-80'
                }`}
              >
                <Text className="text-base font-semibold text-white">
                  {qaSaving ? '…' : tc.buttons.save}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Lead picker modal — single-select, mirrors the client picker. */}
      <RNModal
        visible={leadPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setLeadPickerOpen(false)}
      >
        {/* KeyboardAvoidingView: the sheet is anchored to the bottom, exactly
            where the keyboard opens, so its fields sat underneath it. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => setLeadPickerOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
          <View
            className="bg-card rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
            style={{
              height: '80%',
              marginBottom: insets.bottom + 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 24,
              elevation: 24,
            }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="px-5 mb-3 flex-row items-center justify-between">
              <Text className="text-base font-semibold text-ink">{t.leadLabel}</Text>
              <Pressable onPress={() => setLeadPickerOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>
            <View className="px-5 mb-3">
              <View className="flex-row items-center rounded-xl border border-border bg-card px-3">
                <Search size={16} color={c.faint} />
                <TextInput
                  value={leadSearch}
                  onChangeText={setLeadSearch}
                  placeholder={t.workerSearchPlaceholder}
                  placeholderTextColor={c.faint}
                  className="flex-1 py-2.5 pl-2 text-sm text-ink"
                />
              </View>
            </View>
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => { setLead(''); setLeadPickerOpen(false); }}
                className="flex-row items-center justify-between px-5 py-3.5 active:bg-surface"
              >
                <Text className={`text-sm ${!leadEmployeeId ? 'text-primary font-semibold' : 'text-muted'}`}>
                  {t.leadNone}
                </Text>
                {!leadEmployeeId ? <Check size={16} color={c.primary} /> : null}
              </Pressable>
              {filteredLeadEmployees.map((emp) => {
                const isSel = emp.id === leadEmployeeId;
                return (
                  <Pressable
                    key={emp.id}
                    onPress={() => { setLead(emp.id); setLeadPickerOpen(false); }}
                    className={`flex-row items-center justify-between px-5 py-3.5 active:bg-surface ${
                      isSel ? 'bg-primary/5' : ''
                    }`}
                  >
                    <Text
                      className={`text-sm flex-1 ${isSel ? 'text-primary font-semibold' : 'text-ink'}`}
                      numberOfLines={1}
                    >
                      {emp.first_name} {emp.last_name}
                    </Text>
                    {isSel ? <Check size={16} color={c.primary} /> : null}
                  </Pressable>
                );
              })}
              {filteredLeadEmployees.length === 0 ? (
                <View className="px-5 py-8 items-center">
                  <Text className="text-sm text-faint">{t.workerNoResults}</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Crew picker modal — multi-select. Tap toggles each row; the sheet
         only closes when the user taps Listo or the scrim. */}
      <RNModal
        visible={crewPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCrewPickerOpen(false)}
      >
        {/* KeyboardAvoidingView: the sheet is anchored to the bottom, exactly
            where the keyboard opens, so its fields sat underneath it. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => setCrewPickerOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
          <View
            className="bg-card rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
            style={{
              height: '80%',
              marginBottom: insets.bottom + 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 24,
              elevation: 24,
            }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="px-5 mb-3 flex-row items-center justify-between">
              <Text className="text-base font-semibold text-ink">{t.crewLabel}</Text>
              <View className="flex-row items-center gap-3">
                <Text className="text-xs text-faint">
                  {t.crewSelectedCount.replace('{{count}}', String(assignedEmployees.length))}
                </Text>
                <Pressable onPress={() => setCrewPickerOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                  <X size={22} color={c.faint} />
                </Pressable>
              </View>
            </View>
            <View className="px-5 mb-3">
              <View className="flex-row items-center rounded-xl border border-border bg-card px-3">
                <Search size={16} color={c.faint} />
                <TextInput
                  value={crewSearch}
                  onChangeText={setCrewSearch}
                  placeholder={t.workerSearchPlaceholder}
                  placeholderTextColor={c.faint}
                  className="flex-1 py-2.5 pl-2 text-sm text-ink"
                />
              </View>
            </View>
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
              {filteredCrewEmployees.map((emp) => {
                const isSel = assignedEmployees.includes(emp.id);
                return (
                  <Pressable
                    key={emp.id}
                    onPress={() => toggleEmployee(emp.id)}
                    className={`flex-row items-center justify-between px-5 py-3.5 active:bg-surface ${
                      isSel ? 'bg-primary/5' : ''
                    }`}
                  >
                    <Text
                      className={`text-sm flex-1 ${isSel ? 'text-primary font-semibold' : 'text-ink'}`}
                      numberOfLines={1}
                    >
                      {emp.first_name} {emp.last_name}
                    </Text>
                    {isSel ? <Check size={16} color={c.primary} /> : null}
                  </Pressable>
                );
              })}
              {filteredCrewEmployees.length === 0 ? (
                <View className="px-5 py-8 items-center">
                  <Text className="text-sm text-faint">{t.workerNoResults}</Text>
                </View>
              ) : null}
            </ScrollView>
            <View className="px-5 pt-3 border-t border-border-soft">
              <Pressable
                onPress={() => { Keyboard.dismiss(); setCrewPickerOpen(false); }}
                className="py-3 rounded-2xl bg-primary items-center active:opacity-80"
              >
                <Text className="text-sm font-semibold text-white">{t.crewDoneBtn}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Driver picker modal — multi-select over ALL employees. */}
      <RNModal
        visible={driverPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setDriverPickerOpen(false)}
      >
        {/* KeyboardAvoidingView: the sheet is anchored to the bottom, exactly
            where the keyboard opens, so its fields sat underneath it. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => setDriverPickerOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
          <View
            className="bg-card rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
            style={{
              height: '80%',
              marginBottom: insets.bottom + 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 24,
              elevation: 24,
            }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="px-5 mb-3 flex-row items-center justify-between">
              <Text className="text-base font-semibold text-ink">{t.driverLabel}</Text>
              <View className="flex-row items-center gap-3">
                <Text className="text-xs text-faint">
                  {t.crewSelectedCount.replace('{{count}}', String(driverEmployeeIds.length))}
                </Text>
                <Pressable onPress={() => setDriverPickerOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                  <X size={22} color={c.faint} />
                </Pressable>
              </View>
            </View>
            <View className="px-5 mb-3">
              <View className="flex-row items-center rounded-xl border border-border bg-card px-3">
                <Search size={16} color={c.faint} />
                <TextInput
                  value={driverSearch}
                  onChangeText={setDriverSearch}
                  placeholder={t.workerSearchPlaceholder}
                  placeholderTextColor={c.faint}
                  className="flex-1 py-2.5 pl-2 text-sm text-ink"
                />
              </View>
            </View>
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
              {filteredDriverPool.map((emp) => {
                const isSel = driverEmployeeIds.includes(emp.id);
                return (
                  <Pressable
                    key={emp.id}
                    onPress={() => toggleDriver(emp.id)}
                    className={`flex-row items-center justify-between px-5 py-3.5 active:bg-surface ${
                      isSel ? 'bg-primary/5' : ''
                    }`}
                  >
                    <Text
                      className={`text-sm flex-1 ${isSel ? 'text-primary font-semibold' : 'text-ink'}`}
                      numberOfLines={1}
                    >
                      {emp.first_name} {emp.last_name}
                    </Text>
                    {isSel ? <Check size={16} color={c.primary} /> : null}
                  </Pressable>
                );
              })}
              {filteredDriverPool.length === 0 ? (
                <View className="px-5 py-8 items-center">
                  <Text className="text-sm text-faint">{t.workerNoResults}</Text>
                </View>
              ) : null}
            </ScrollView>
            <View className="px-5 pt-3 border-t border-border-soft">
              <Pressable
                onPress={() => setDriverPickerOpen(false)}
                className="py-3 rounded-2xl bg-primary items-center active:opacity-80"
              >
                <Text className="text-sm font-semibold text-white">{t.crewDoneBtn}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </RNModal>

      {business ? (
        <CrewFinderSheet
          visible={crewFinderOpen}
          businessId={business.id}
          target={{ jobId: editId ?? null, lat: jobLat, lng: jobLng, scheduledDate: scheduledDate || null, clientId: clientId || null }}
          currentCrew={assignedEmployees}
          onAddCrew={(id) => setAssignedEmployees((prev) => (prev.includes(id) ? prev : [...prev, id]))}
          onSetDate={(d) => setScheduledDate(d)}
          onClose={() => setCrewFinderOpen(false)}
        />
      ) : null}
      {unsavedSheet}
    </SafeAreaView>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-5">
      <View className="flex-row items-center gap-2 mb-3 px-1">
        {icon}
        <Text className="text-xs font-semibold text-faint uppercase tracking-wide">
          {title}
        </Text>
      </View>
      <View className="bg-card rounded-2xl border border-border-soft p-4">
        {children}
      </View>
    </View>
  );
}

function CustomFieldInput({
  template, value, onChange,
}: { template: FieldTemplate; value: string; onChange: (v: string) => void }) {
  const c = useThemeColors();
  const tc = useLang().t.common;
  const label = template.required ? `${template.field_label} *` : template.field_label;
  const cfg = parseFieldConfig(template.field_config);
  if (template.field_type === 'note') {
    // Long free text — multiline, grows with content.
    return (
      <View className="mt-3">
        <Text className="text-sm font-semibold text-ink mb-2">{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          multiline
          numberOfLines={4}
          placeholderTextColor={c.faint}
          className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink min-h-[90px]"
          style={{ textAlignVertical: 'top' }}
        />
      </View>
    );
  }
  if (template.field_type === 'date') {
    return (
      <View className="mt-3">
        <DatePicker label={label} value={value} onChange={onChange} />
      </View>
    );
  }
  if (template.field_type === 'boolean') {
    // Two buttons (Yes / No), three states '' | 'true' | 'false' — nothing is
    // pre-selected so a required field forces a pick. Tapping active clears it.
    const yesActive = value === 'true';
    const noActive = value === 'false';
    return (
      <View className="mt-3">
        <Text className="text-sm font-semibold text-ink mb-2">{label}</Text>
        <View className="flex-row gap-2">
          <Pressable onPress={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-2xl border px-4 py-3 items-center ${yesActive ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
            <Text className={`text-sm font-semibold ${yesActive ? 'text-white' : 'text-ink'}`}>{tc.states.yes}</Text>
          </Pressable>
          <Pressable onPress={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-2xl border px-4 py-3 items-center ${noActive ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
            <Text className={`text-sm font-semibold ${noActive ? 'text-white' : 'text-ink'}`}>{tc.states.no}</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (template.field_type === 'select' && template.field_options?.length) {
    // Multi-select: chips, value stored comma-joined ("A, B") so display
    // paths read naturally. Single-select keeps the dropdown.
    if (cfg.multi) {
      const selected = splitMultiValue(value);
      return (
        <View className="mt-3">
          <Text className="text-sm font-semibold text-ink mb-2">{label}</Text>
          <View className="flex-row flex-wrap gap-2">
            {template.field_options.map((o) => {
              const on = selected.includes(o);
              return (
                <Pressable
                  key={o}
                  onPress={() => onChange(toggleMultiOption(value, o))}
                  className={`rounded-full border px-4 py-2 ${on ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
                >
                  <Text className={`text-sm font-medium ${on ? 'text-primary' : 'text-muted'}`}>{o}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }
    return (
      <View className="mt-3">
        <Select
          label={label}
          value={value}
          onValueChange={onChange}
          placeholder="—"
          options={[{ value: '', label: '—' }, ...template.field_options.map((o) => ({ value: o, label: o }))]}
        />
      </View>
    );
  }
  const isNumber = template.field_type === 'number';
  return (
    <View className="mt-3">
      <Input
        label={label}
        value={isNumber && cfg.thousands ? groupNumberString(value) : value}
        onChangeText={(v) => onChange(isNumber ? sanitizeNumberInput(v, cfg.integerOnly) : v)}
        keyboardType={isNumber ? (cfg.integerOnly ? 'number-pad' : 'decimal-pad') : 'default'}
      />
    </View>
  );
}
