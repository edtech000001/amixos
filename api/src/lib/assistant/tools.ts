import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { checkRequiredFields } from './draft';
import { geocodeAddress } from '../geocoding';
import { buildCrewSuggestions } from '../crewFinder';
import { fetchCrewFinderData, type CrewFinderTarget } from '../crewFinderData';
import type { AssistantContext, JobDraft } from './types';

// Tool surface for the Ami loop. All executors run on ctx.db — the caller's
// RLS-scoped client — so cross-business access is structurally impossible.
// Definitions use strict schemas + prescriptive "call this when…" text.

// ── Definitions (fixed order — part of the cached prompt prefix) ───────────

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  // NOTE: no `strict` and no nullable type-unions — the API's schema compiler
  // caps union-typed parameters at 16 per request, which strict-nullable
  // schemas blow past. Optional = omitted from `required`; the executors and
  // buildDraft() defensively validate every input anyway.
  {
    name: 'query_jobs',
    description:
      'Busca trabajos del negocio. Devuelve total_count (el TOTAL exacto que cumple los filtros — úsalo para "¿cuántos trabajos…?") y hasta `limit` filas de detalle. Usa crew_member para filtrar por persona asignada ("¿cuántos trabajos tiene Elmer?" → crew_member="Elmer", responde con total_count). Usa created_from/created_to para "¿qué agregué ayer?" (fecha de creación) y date_from/date_to para fecha agendada. Llama con include_assignments=true y sin filtros (recientes primero) para ver la cuadrilla de los últimos trabajos cuando el usuario diga "la misma cuadrilla de siempre".',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'scheduled_date >= YYYY-MM-DD' },
        date_to: { type: 'string', description: 'scheduled_date <= YYYY-MM-DD' },
        created_from: { type: 'string', description: 'created_at >= YYYY-MM-DD (fecha en que se agregó)' },
        created_to: { type: 'string', description: 'created_at <= YYYY-MM-DD (inclusive)' },
        status: { type: 'string', description: 'proposal|sent|accepted|scheduled|in_progress|completed|invoiced' },
        client_id: { type: 'string' },
        search: { type: 'string', description: 'texto a buscar en el título' },
        crew_member: { type: 'string', description: 'nombre (parcial) de un empleado — solo trabajos donde está asignado en la cuadrilla; las filas incluyen la cuadrilla completa' },
        crew_lead_only: { type: 'boolean', description: 'con crew_member: solo trabajos donde esa persona es el líder' },
        include_assignments: { type: 'boolean', description: 'incluir nombres de cuadrilla/líder' },
        limit: { type: 'integer', description: 'máx 100, default 10' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'query_clients',
    description:
      'Busca clientes por nombre o empresa. Devuelve total_count (el total exacto — úsalo para "¿cuántos clientes tengo?"; omite search para contar todos). Llama SIEMPRE antes de proponer un trabajo con nombre de cliente; si no hay coincidencia, propone con client_resolved=false conservando client_name.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'nombre, apellido o empresa (parcial); omite para listar/contar todos' },
        limit: { type: 'integer', description: 'máx 10' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'query_employees',
    description:
      'Busca empleados (el roster ya está en el contexto; usa esto solo para refrescar o desambiguar nombres repetidos).',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        limit: { type: 'integer', description: 'máx 25' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'query_timesheets',
    description:
      'Consulta registros de horas trabajadas (checadas). Usa esto para "¿trabajó X ayer?", "¿cuántas horas hizo X esta semana?".',
    input_schema: {
      type: 'object',
      properties: {
        employee_id: { type: 'string' },
        employee_name: { type: 'string', description: 'si no tienes el id' },
        date_from: { type: 'string', description: 'work_date >= YYYY-MM-DD' },
        date_to: { type: 'string', description: 'work_date <= YYYY-MM-DD' },
        limit: { type: 'integer', description: 'máx 31' },
      },
      required: ['date_from', 'date_to'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_crew',
    description:
      'Clasifica a los empleados por CERCANÍA y DISPONIBILIDAD — la misma lógica del botón "Sugerir cuadrilla" del formulario. Úsala para "¿quién está más cerca de X?", "¿quién anda por Colorado?", "¿quién está libre el martes?". La ubicación de cada empleado se toma de su trabajo actual/más próximo con pin en el mapa, o de su casa geocodificada. Da place (ciudad, estado o dirección — se geocodifica) O job_search (título parcial de un trabajo — usa su pin o el del cliente), y date opcional para disponibilidad. Para "líderes", filtra los resultados por el rol del roster.',
    input_schema: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'lugar libre: "Colorado", "Fort Morgan CO", una dirección' },
        job_search: { type: 'string', description: 'título (parcial) de un trabajo existente — usa sus coordenadas' },
        date: { type: 'string', description: 'YYYY-MM-DD — para marcar quién está libre ese día' },
        limit: { type: 'integer', description: 'máx 25, default 10' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_job',
    description:
      'Genera el BORRADOR de un trabajo nuevo (o la versión corregida de un borrador pendiente). NO crea el trabajo — el usuario debe presionar Confirmar. Llama solo cuando tengas título y suficientes datos; los ids de crew/drivers deben venir del roster o de query_employees, y client_id de query_clients. Omite los campos que no apliquen.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['scheduled', 'in_progress', 'completed'] },
        priority: { type: 'string', description: 'low | normal | high | urgent' },
        scheduled_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string' },
        all_day: { type: 'boolean', description: 'default true; false solo si el usuario dio horas de inicio/fin' },
        time_start: { type: 'string', description: 'HH:MM 24h' },
        time_end: { type: 'string' },
        total_hours: { type: 'number' },
        client_id: { type: 'string' },
        client_name: { type: 'string' },
        client_resolved: { type: 'boolean' },
        crew: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              employee_id: { type: 'string' },
              worker_name: { type: 'string' },
              is_lead: { type: 'boolean' },
            },
            required: ['worker_name'],
            additionalProperties: false,
          },
        },
        driver_employee_ids: { type: 'array', items: { type: 'string' } },
        driver_hours: { type: 'number' },
        custom_fields: {
          type: 'array',
          description: 'valores de campos personalizados (field_key de las plantillas, valor como texto)',
          items: {
            type: 'object',
            properties: {
              field_key: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['field_key', 'value'],
            additionalProperties: false,
          },
        },
        internal_notes: { type: 'string' },
        worker_notes: { type: 'string' },
      },
      required: ['title', 'status', 'client_resolved'],
      additionalProperties: false,
    },
  },
];

// ── Executors ───────────────────────────────────────────────────────────────

const clamp = (n: unknown, max: number, dflt: number) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : dflt;
  return Math.min(Math.max(v, 1), max);
};

type ToolInput = Record<string, any>;

export async function executeQueryJobs(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 100, 10);
  const crewTerm = typeof input.crew_member === 'string' ? input.crew_member.trim() : '';
  // A crew filter implies the caller cares about crews — return them.
  const withAssignments = !!input.include_assignments || !!crewTerm;
  let select = withAssignments
    ? 'id, title, status, priority, scheduled_date, total_hours, created_at, clients(first_name, last_name, company), job_assignments(worker_name, is_lead), driver_employee_ids, driver_hours'
    : 'id, title, status, priority, scheduled_date, total_hours, created_at, clients(first_name, last_name, company)';
  // The crew filter rides on a SEPARATE aliased inner-join embed so the plain
  // job_assignments embed still lists the FULL crew, not just the match.
  if (crewTerm) select += ', crew_match:job_assignments!inner(worker_name, is_lead)';
  // count:'exact' rides on the same query so the model always knows the REAL
  // total even when rows are truncated to `limit` ("¿cuántos trabajos tengo?").
  let q = ctx.db.from('jobs').select(select, { count: 'exact' }).eq('business_id', ctx.businessId);
  if (crewTerm) {
    q = q.ilike('crew_match.worker_name', `%${crewTerm}%`);
    if (input.crew_lead_only) q = q.eq('crew_match.is_lead', true);
  }
  if (input.status) q = q.eq('status', input.status);
  if (input.client_id) q = q.eq('client_id', input.client_id);
  if (input.date_from) q = q.gte('scheduled_date', input.date_from);
  if (input.date_to) q = q.lte('scheduled_date', input.date_to);
  if (input.created_from) q = q.gte('created_at', `${input.created_from}T00:00:00`);
  if (input.created_to) q = q.lte('created_at', `${input.created_to}T23:59:59`);
  if (input.search) q = q.ilike('title', `%${input.search}%`);
  const { data, error, count } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  const jobs = (data ?? []).map((j: any) => ({
    id: j.id,
    title: j.title,
    status: j.status,
    scheduled_date: j.scheduled_date,
    total_hours: j.total_hours,
    created_at: j.created_at,
    client: j.clients
      ? `${j.clients.first_name ?? ''} ${j.clients.last_name ?? ''}`.trim() + (j.clients.company ? ` (${j.clients.company})` : '')
      : null,
    ...(withAssignments
      ? {
          crew: (j.job_assignments ?? []).map((a: any) => `${a.worker_name}${a.is_lead ? ' (líder)' : ''}`),
          driver_employee_ids: j.driver_employee_ids ?? [],
          driver_hours: j.driver_hours,
        }
      : {}),
  }));
  return { total_count: count ?? jobs.length, showing: jobs.length, jobs };
}

export async function executeQueryClients(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 10, 5);
  const term = String(input.search ?? '').trim();
  let q = ctx.db
    .from('clients')
    .select('id, first_name, last_name, company, phone_cell, city', { count: 'exact' })
    .eq('business_id', ctx.businessId);
  if (term) {
    // Token-split OR match across name/company so "Bob Karlton" hits
    // first_name=Bob + last_name=Karlton.
    // Strip PostgREST grammar chars (, ( ) . \ ") so a search term can't
    // break out of the ilike filter and inject extra OR conditions; cap to 3.
    const tokens = term
      .split(/\s+/)
      .map(t => t.replace(/[,().\\"]/g, ''))
      .filter(Boolean)
      .slice(0, 3);
    if (tokens.length) {
      const ors = tokens
        .map(t => `first_name.ilike.%${t}%,last_name.ilike.%${t}%,company.ilike.%${t}%`)
        .join(',');
      q = q.or(ors);
    }
  }
  const { data, error, count } = await q.order('first_name').limit(limit);
  if (error) throw new Error(error.message);
  const clients = (data ?? []).map((c: any) => ({
    id: c.id,
    name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
    company: c.company,
    phone: c.phone_cell,
    city: c.city,
  }));
  return { total_count: count ?? clients.length, showing: clients.length, clients };
}

export async function executeQueryEmployees(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 25, 25);
  let q = ctx.db
    .from('employees')
    .select('id, first_name, last_name, role')
    .eq('business_id', ctx.businessId);
  if (input.search) {
    // Same sanitization as query_clients: strip PostgREST grammar chars and
    // cap to 3 tokens so the term can't inject extra filter conditions.
    const tokens = String(input.search)
      .trim()
      .split(/\s+/)
      .map(t => t.replace(/[,().\\"]/g, ''))
      .filter(Boolean)
      .slice(0, 3);
    if (tokens.length) {
      const ors = tokens
        .map(t => `first_name.ilike.%${t}%,last_name.ilike.%${t}%`)
        .join(',');
      q = q.or(ors);
    }
  }
  const { data, error } = await q.limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((e: any) => ({
    id: e.id,
    name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim(),
    role: e.role,
  }));
}

export async function executeQueryTimesheets(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 31, 14);
  let employeeId: string | null = input.employee_id ?? null;
  if (!employeeId && input.employee_name) {
    const t = String(input.employee_name).trim().toLowerCase();
    const match = ctx.employees.find(e => e.name.toLowerCase().includes(t));
    if (match) employeeId = match.id;
  }
  let q = ctx.db
    .from('timesheets')
    .select('work_date, worker_name, clock_in, clock_out, hours_total, employee_id')
    .eq('business_id', ctx.businessId)
    .gte('work_date', input.date_from)
    .lte('work_date', input.date_to);
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q.order('work_date', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function executeSuggestCrew(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 25, 10);
  const jobSearch = typeof input.job_search === 'string' ? input.job_search.trim() : '';
  const place = typeof input.place === 'string' ? input.place.trim() : '';
  const date = typeof input.date === 'string' && YMD_RE.test(input.date) ? input.date : null;

  // Resolve the target point: an existing job's pin (or its client's), or a
  // geocoded freeform place. Date-only calls still rank by availability.
  let target: CrewFinderTarget = { jobId: null, lat: null, lng: null, scheduledDate: date, clientId: null };
  let targetLabel: string | null = null;
  if (jobSearch) {
    const { data, error } = await ctx.db
      .from('jobs')
      .select('id, title, scheduled_date, job_lat, job_lng, client_id')
      .eq('business_id', ctx.businessId)
      .ilike('title', `%${jobSearch}%`)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const job = data?.[0];
    if (!job) return { error: `no encontré un trabajo que coincida con "${jobSearch}"` };
    target = {
      jobId: job.id,
      lat: job.job_lat,
      lng: job.job_lng,
      scheduledDate: date ?? job.scheduled_date ?? null,
      clientId: job.client_id ?? null,
    };
    targetLabel = job.title;
  } else if (place) {
    const geo = await geocodeAddress(place);
    if (!geo.ok) return { error: `no pude ubicar "${place}" en el mapa (${geo.reason})` };
    target = { jobId: null, lat: geo.lat, lng: geo.lng, scheduledDate: date, clientId: null };
    targetLabel = place;
  } else if (!date) {
    return { error: 'da place, job_search o date' };
  }

  const data = await fetchCrewFinderData(ctx.db, ctx.businessId, target);
  const suggestions = buildCrewSuggestions(data);
  const roleById = new Map(ctx.employees.map(e => [e.id, e.role]));
  return {
    target: targetLabel,
    target_has_coords: data.targetHasCoords,
    date: target.scheduledDate,
    // Employees whose location can't be resolved rank last with distance null;
    // this count tells the model why ("sin dirección geocodificada").
    employees_without_location: data.needsGeocodeCount,
    suggestions: suggestions.slice(0, limit).map(s => ({
      employee_id: s.employeeId,
      name: s.name,
      role: roleById.get(s.employeeId) ?? null,
      distance_mi: s.distanceMi,
      location_basis: s.basis,
      free_on_date: s.isFreeOnDate,
      next_free_date: s.nextFreeDate,
      nearby_jobs_count: s.nearbyJobs.length,
    })),
  };
}

// ── propose_job — normalize into a JobDraft (no DB write) ──────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (v: unknown): string | undefined =>
  typeof v === 'string' && DATE_RE.test(v) ? v : undefined;
const asStr = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
};
const asNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

export function buildDraft(ctx: AssistantContext, input: ToolInput): JobDraft {
  const warnings: string[] = [];
  const employeeIds = new Set(ctx.employees.map(e => e.id));
  const templateKeys = new Set(ctx.fieldTemplates.map(f => f.field_key));

  // Crew: keep only rows with a name; drop unknown employee ids to manual names.
  const crew = (Array.isArray(input.crew) ? input.crew : [])
    .map((c: any) => {
      const name = asStr(c?.worker_name) ?? '';
      if (!name) return null;
      const id = asStr(c?.employee_id);
      if (id && !employeeIds.has(id)) {
        warnings.push(`Empleado no reconocido: ${name} (se agregará por nombre)`);
        return { worker_name: name, is_lead: !!c?.is_lead };
      }
      return id
        ? { employee_id: id, worker_name: name, is_lead: !!c?.is_lead }
        : { worker_name: name, is_lead: !!c?.is_lead };
    })
    .filter(Boolean) as JobDraft['crew'];
  // Single lead, and the lead must be a registered crew member.
  let leadSeen = false;
  for (const c of crew) {
    if (c.is_lead) {
      if (leadSeen || !c.employee_id) c.is_lead = false;
      else leadSeen = true;
    }
  }

  const drivers = (Array.isArray(input.driver_employee_ids) ? input.driver_employee_ids : [])
    .filter((id: unknown): id is string => typeof id === 'string' && employeeIds.has(id));

  const custom: Record<string, string> = {};
  const rawFields: { field_key?: unknown; value?: unknown }[] = Array.isArray(input.custom_fields)
    ? input.custom_fields
    : [];
  for (const f of rawFields) {
    const k = asStr(f?.field_key);
    if (!k) continue;
    if (!templateKeys.has(k)) {
      warnings.push(`Campo desconocido ignorado: ${k}`);
      continue;
    }
    custom[k] = String(f?.value ?? '');
  }

  const clientId = asStr(input.client_id);
  const clientName = asStr(input.client_name);
  const clientResolved = !!clientId && input.client_resolved !== false;
  if (clientName && !clientResolved) {
    warnings.push(`Cliente "${clientName}" sin coincidencia — el trabajo se creará sin cliente vinculado`);
  }

  let status: JobDraft['status'] =
    input.status === 'in_progress' || input.status === 'completed' ? input.status : 'scheduled';
  if (ctx.restrictedCreator && status !== 'completed') {
    status = 'completed';
    warnings.push('Tu rol registra trabajos como completados');
  }

  const allDay = input.all_day !== false;

  const draft: JobDraft = {
    job_id: randomUUID(),
    business_id: ctx.businessId,
    title: asStr(input.title) ?? 'Trabajo',
    description: asStr(input.description),
    status,
    priority: ['low', 'normal', 'high', 'urgent'].includes(input.priority) ? input.priority : undefined,
    scheduled_date: asDate(input.scheduled_date),
    end_date: asDate(input.end_date),
    all_day: allDay,
    time_start: allDay ? undefined : asStr(input.time_start),
    time_end: allDay ? undefined : asStr(input.time_end),
    total_hours: asNum(input.total_hours),
    client_id: clientResolved ? clientId : undefined,
    client_name: clientName,
    client_resolved: clientResolved,
    crew,
    driver_employee_ids: drivers,
    driver_hours: drivers.length ? asNum(input.driver_hours) : undefined,
    custom_fields: custom,
    internal_notes: asStr(input.internal_notes),
    worker_notes: asStr(input.worker_notes),
    warnings,
  };

  // Required-field check (same contract confirmDraft enforces) — surfaced as
  // warnings on the card AND fed back to the model so Ami asks for what's
  // missing instead of letting Confirmar fail.
  const es = ctx.locale !== 'en';
  const reqCheck = checkRequiredFields(ctx, draft);
  if (reqCheck.missing.length) {
    warnings.push(
      `${es ? 'Faltan campos requeridos' : 'Missing required fields'}: ${reqCheck.missing.join(', ')} — ${es ? 'no se podrá confirmar sin ellos' : "can't be confirmed without them"}`,
    );
  }
  if (reqCheck.unsupported.length) {
    warnings.push(
      es
        ? `Este negocio requiere ${reqCheck.unsupported.join(', ')}, que Ami aún no maneja — crea este trabajo en la pantalla Trabajos`
        : `This business requires ${reqCheck.unsupported.join(', ')}, which Ami can't fill yet — create this job from the Jobs screen`,
    );
  }
  return draft;
}
