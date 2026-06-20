import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  CalendarScreen,
  type CalItem,
  type CalendarEventInput,
} from '@amixos/shared/screens/dashboard/CalendarScreen';
import {
  eventToItem,
  jobToItem,
  type RawEvent,
  type RawJob,
} from '@amixos/shared/lib/calendarModel';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';

interface JobRow {
  id: string;
  title: string;
  status: string;
  scheduled_date: string | null;
  end_date: string | null;
  time_start: string | null;
  time_end: string | null;
  all_day: boolean | null;
  job_city: string | null;
  job_state: string | null;
  // PostgREST returns the joined client as an object (many-to-one), but the
  // typed client widens it to an array — accept either shape.
  clients: ClientJoin | ClientJoin[] | null;
  job_assignments: AssignmentJoin[] | null;
}

type ClientJoin = { first_name: string | null; last_name: string | null };
type AssignmentJoin = {
  employee_id: string | null;
  is_lead: boolean | null;
  worker_name: string | null;
  employees: ClientJoin | ClientJoin[] | null;
};

function joinedClientName(c: ClientJoin | ClientJoin[] | null): string | null {
  const obj = Array.isArray(c) ? c[0] : c;
  if (!obj) return null;
  return `${obj.first_name ?? ''} ${obj.last_name ?? ''}`.trim() || null;
}

function leadName(assignments: AssignmentJoin[] | null): string | null {
  const lead = assignments?.find(a => a.is_lead);
  if (!lead) return null;
  return joinedClientName(lead.employees) ?? lead.worker_name ?? null;
}

// Employee-backed assignees only (the availability roster is employees), so
// free-text worker_name assignments without an id are skipped.
function jobAssignees(assignments: AssignmentJoin[] | null): { id: string; name: string }[] {
  if (!assignments) return [];
  return assignments
    .filter(a => a.employee_id)
    .map(a => ({ id: a.employee_id as string, name: joinedClientName(a.employees) ?? a.worker_name ?? '' }));
}

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayStartISO(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
}
function dayEndISO(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
}

export default function CalendarioRoute() {
  const supabase = createSupabaseClient();
  const router = useRouter();
  const { business, user } = useApp();

  const [items, setItems] = useState<CalItem[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [leads, setLeads] = useState<{ id: string; name: string }[]>([]);
  const rangeRef = useRef<{ start: Date; end: Date } | null>(null);

  useEffect(() => {
    if (!business) return;
    const businessId = business.id;
    fetchAll<{ id: string; first_name: string; last_name: string }>((from, to) =>
      supabase
        .from('clients')
        .select('id, first_name, last_name')
        .eq('business_id', businessId)
        .order('first_name')
        .range(from, to),
    ).then(rows =>
      setClients(rows.map(c => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() }))),
    );
    fetchAll<{ id: string; first_name: string; last_name: string }>((from, to) =>
      supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('business_id', businessId)
        .eq('active', true)
        .order('first_name')
        .range(from, to),
    ).then(rows =>
      setLeads(rows.map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}`.trim() }))),
    );
  }, [business]);

  const fetchItems = useCallback(
    async (start: Date, end: Date): Promise<CalItem[]> => {
      if (!business) return [];
      const businessId = business.id;
      const startISO = dayStartISO(start);
      const endISO = dayEndISO(end);
      const startYmd = ymd(start);
      const endYmd = ymd(end);

      const events = await fetchAll<RawEvent>((from, to) =>
        supabase
          .from('calendar_events')
          .select('id, title, description, start_time, end_time, location, event_type, all_day, client_id')
          .eq('business_id', businessId)
          .lte('start_time', endISO)
          .or(`end_time.gte.${startISO},and(end_time.is.null,start_time.gte.${startISO})`)
          .order('start_time')
          .range(from, to),
      );

      const jobs = await fetchAll<JobRow>((from, to) =>
        supabase
          .from('jobs')
          .select(
            'id, title, status, scheduled_date, end_date, time_start, time_end, all_day, job_city, job_state, clients(first_name, last_name), job_assignments(employee_id, is_lead, worker_name, employees(first_name, last_name))',
          )
          .eq('business_id', businessId)
          .not('status', 'in', '("cancelled","declined")')
          .lte('scheduled_date', endYmd)
          .or(`end_date.gte.${startYmd},and(end_date.is.null,scheduled_date.gte.${startYmd})`)
          .range(from, to),
      );

      const eventItems = events.map(eventToItem);
      const jobItems = jobs
        .map<RawJob>(j => ({
          id: j.id,
          title: j.title,
          status: j.status,
          scheduled_date: j.scheduled_date,
          end_date: j.end_date,
          time_start: j.time_start,
          time_end: j.time_end,
          all_day: j.all_day,
          job_city: j.job_city,
          job_state: j.job_state,
          client_name: joinedClientName(j.clients),
          lead_name: leadName(j.job_assignments),
          assignees: jobAssignees(j.job_assignments),
        }))
        .map(jobToItem)
        .filter((it): it is CalItem => it !== null);

      return [...eventItems, ...jobItems];
    },
    [business],
  );

  const load = useCallback(
    async (start: Date, end: Date) => {
      setItems(await fetchItems(start, end));
    },
    [fetchItems],
  );

  const reload = useCallback(() => {
    if (rangeRef.current) load(rangeRef.current.start, rangeRef.current.end);
  }, [load]);

  // Re-fetch when the active business changes (switching workspaces). The
  // visible range stays the same, so onRangeChange won't fire on its own —
  // without this the calendar keeps showing the previous business's items.
  useEffect(() => {
    reload();
  }, [reload]);

  const onRangeChange = useCallback(
    (start: Date, end: Date) => {
      rangeRef.current = { start, end };
      load(start, end);
    },
    [load],
  );

  const toISO = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();

  const saveEvent = async (input: CalendarEventInput, editingId: string | null) => {
    if (!business) return;
    const start = input.allDay ? toISO(input.date, '00:00') : toISO(input.date, input.timeStart);
    const end = input.allDay ? toISO(input.endDate, '23:59') : toISO(input.endDate, input.timeEnd);
    const row = {
      title: input.title.trim(),
      description: input.description.trim() || null,
      event_type: input.eventType,
      location: input.location.trim() || null,
      client_id: input.clientId || null,
      all_day: input.allDay,
      start_time: start,
      end_time: end,
    };
    if (editingId) {
      await supabase.from('calendar_events').update(row).eq('id', editingId);
    } else {
      await supabase
        .from('calendar_events')
        .insert({ ...row, business_id: business.id, created_by: user?.id ?? null });
    }
    reload();
  };

  const deleteEvent = async (id: string) => {
    await supabase.from('calendar_events').delete().eq('id', id);
    setItems(prev => prev.filter(it => it.id !== id || it.kind !== 'event'));
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <CalendarScreen
        items={items}
        clients={clients}
        leads={leads}
        onRangeChange={onRangeChange}
        onFetchRange={fetchItems}
        onSaveEvent={saveEvent}
        onDeleteEvent={deleteEvent}
        onJobPress={id => router.push(`/dashboard/trabajos/${id}?from=calendar` as never)}
      />
    </SafeAreaView>
  );
}
