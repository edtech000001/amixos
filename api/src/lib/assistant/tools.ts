import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
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
      'Busca trabajos del negocio. Usa created_from/created_to para "¿qué agregué ayer?" (fecha de creación) y date_from/date_to para fecha agendada. Llama con include_assignments=true y sin filtros (recientes primero) para ver la cuadrilla de los últimos trabajos cuando el usuario diga "la misma cuadrilla de siempre".',
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
        include_assignments: { type: 'boolean', description: 'incluir nombres de cuadrilla/líder' },
        limit: { type: 'integer', description: 'máx 20, default 10' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'query_clients',
    description:
      'Busca clientes por nombre o empresa. Llama SIEMPRE antes de proponer un trabajo con nombre de cliente; si no hay coincidencia, propone con client_resolved=false conservando client_name.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'nombre, apellido o empresa (parcial)' },
        limit: { type: 'integer', description: 'máx 10' },
      },
      required: ['search'],
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
  const limit = clamp(input.limit, 20, 10);
  const select = input.include_assignments
    ? 'id, title, status, priority, scheduled_date, total_hours, created_at, clients(first_name, last_name, company), job_assignments(worker_name, is_lead), driver_employee_ids, driver_hours'
    : 'id, title, status, priority, scheduled_date, total_hours, created_at, clients(first_name, last_name, company)';
  let q = ctx.db.from('jobs').select(select).eq('business_id', ctx.businessId);
  if (input.status) q = q.eq('status', input.status);
  if (input.client_id) q = q.eq('client_id', input.client_id);
  if (input.date_from) q = q.gte('scheduled_date', input.date_from);
  if (input.date_to) q = q.lte('scheduled_date', input.date_to);
  if (input.created_from) q = q.gte('created_at', `${input.created_from}T00:00:00`);
  if (input.created_to) q = q.lte('created_at', `${input.created_to}T23:59:59`);
  if (input.search) q = q.ilike('title', `%${input.search}%`);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((j: any) => ({
    id: j.id,
    title: j.title,
    status: j.status,
    scheduled_date: j.scheduled_date,
    total_hours: j.total_hours,
    created_at: j.created_at,
    client: j.clients
      ? `${j.clients.first_name ?? ''} ${j.clients.last_name ?? ''}`.trim() + (j.clients.company ? ` (${j.clients.company})` : '')
      : null,
    ...(input.include_assignments
      ? {
          crew: (j.job_assignments ?? []).map((a: any) => `${a.worker_name}${a.is_lead ? ' (líder)' : ''}`),
          driver_employee_ids: j.driver_employee_ids ?? [],
          driver_hours: j.driver_hours,
        }
      : {}),
  }));
}

export async function executeQueryClients(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 10, 5);
  const term = String(input.search ?? '').trim();
  if (!term) return [];
  // Token-split OR match across name/company so "Bob Karlton" hits
  // first_name=Bob + last_name=Karlton.
  const tokens = term.split(/\s+/).filter(Boolean).slice(0, 3);
  const ors = tokens
    .map(t => `first_name.ilike.%${t}%,last_name.ilike.%${t}%,company.ilike.%${t}%`)
    .join(',');
  const { data, error } = await ctx.db
    .from('clients')
    .select('id, first_name, last_name, company, phone_cell, city')
    .eq('business_id', ctx.businessId)
    .or(ors)
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
    company: c.company,
    phone: c.phone_cell,
    city: c.city,
  }));
}

export async function executeQueryEmployees(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 25, 25);
  let q = ctx.db
    .from('employees')
    .select('id, first_name, last_name, role')
    .eq('business_id', ctx.businessId);
  if (input.search) {
    const t = String(input.search).trim();
    q = q.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%`);
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

  return {
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
}
