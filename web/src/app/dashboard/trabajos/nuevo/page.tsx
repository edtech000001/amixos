'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, MapPin, Calendar, Users, DollarSign, FileText, Search, Link2, ChevronDown, X } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Client { id: string; first_name: string; last_name: string; company: string | null; job_address?: string; city?: string; state?: string; }
interface Employee { id: string; first_name: string; last_name: string; role: string; }

interface LineItem {
  id: string;
  item_type: 'labor' | 'material' | 'equipment' | 'other';
  description: string;
  quantity: number;
  unit_price: number;
}

const ITEM_TYPES: Record<string, string> = {
  labor: 'Mano de obra', material: 'Material', equipment: 'Equipo', other: 'Otro',
};

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
    <Suspense fallback={<div className="p-6">Cargando...</div>}>
      <NuevoTrabajoContent />
    </Suspense>
  );
}

function NuevoTrabajoContent() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isProposal = searchParams.get('modo') === 'propuesta';

  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState<'scheduled' | 'in_progress'>('scheduled');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [description, setDescription] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([isProposal ? newItem() : newLaborItem()]);
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);
  const [manualWorkers, setManualWorkers] = useState<string[]>(['']);

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

  useEffect(() => {
    if (!business) return;
    const clientParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('client') ?? '' : '';
    if (clientParam) setClientId(clientParam);

    Promise.all([
      supabase.from('clients').select('id, first_name, last_name, company, address, city, state').eq('business_id', business.id).order('first_name'),
      supabase.from('employees').select('id, first_name, last_name, role').eq('business_id', business.id).eq('active', true).order('first_name'),
    ]).then(([{ data: cl }, { data: emp }]) => {
      setClients(cl ?? []);
      setEmployees(emp ?? []);
    });
  }, [business]);

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
    if (client && !isProposal) {
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
    if (!link.trim()) return;
    // Try to extract coordinates from Google/Apple Maps URLs
    // Google Maps: @lat,lng or ?q=lat,lng or place/.../@lat,lng
    // Apple Maps: ll=lat,lng or q=lat,lng
    const coordMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      link.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);

    // Try to extract place name / address from Google Maps URL
    // e.g. /place/123+Main+St,+City,+State/
    const placeMatch = link.match(/\/place\/([^/@]+)/);
    if (placeMatch) {
      const parts = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ').split(',').map(s => s.trim());
      if (parts.length >= 1 && !address) setAddress(parts[0]);
      if (parts.length >= 2 && !city) setCity(parts[1]);
      if (parts.length >= 3 && !state) {
        const st = parts[2].replace(/\d/g, '').trim();
        if (st.length === 2) setState(st.toUpperCase());
      }
    }
  };

  const toggleEmployee = (id: string) => {
    setAssignedEmployees(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const updateItem = (id: string, field: keyof LineItem, value: any) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const taxAmt = subtotal * (taxRate / 100);
  const total = isProposal ? subtotal + taxAmt - discount : subtotal;

  const save = async () => {
    if (!title.trim()) { setError(isProposal ? 'El título es requerido' : 'El título del trabajo es requerido'); return; }
    const validItems = items.filter(i => i.description.trim());
    if (isProposal && validItems.length === 0) { setError('Agrega al menos un ítem'); return; }
    setSaving(true); setError('');

    try {
      if (isProposal) {
        // Generate estimate number
        const { count } = await supabase.from('jobs').select('*', { count: 'exact', head: true })
          .eq('business_id', business!.id).not('estimate_number', 'is', null);
        const estNum = `COT-${String((count ?? 0) + 1).padStart(4, '0')}`;

        const { data: job, error: jobErr } = await supabase.from('jobs').insert({
          business_id: business!.id,
          client_id: clientId || null,
          title: title.trim(),
          description: description.trim() || null,
          status: 'proposal',
          priority: 'normal',
          estimate_number: estNum,
          notes: clientNotes.trim() || null,
          internal_notes: internalNotes.trim() || null,
          issue_date: issueDate,
          expiry_date: expiryDate || null,
          subtotal_amount: +subtotal.toFixed(2),
          tax_rate: taxRate,
          tax_amount: +taxAmt.toFixed(2),
          discount: +discount.toFixed(2),
          total_amount: +total.toFixed(2),
        }).select().single();

        if (jobErr || !job) throw new Error(jobErr?.message ?? 'Error creating proposal');

        // Job items
        if (validItems.length > 0) {
          await supabase.from('job_items').insert(
            validItems.map(i => ({
              job_id: job.id,
              item_type: i.item_type,
              description: i.description,
              quantity: i.quantity,
              unit_price: i.unit_price,
            }))
          );
        }

        router.push(`/dashboard/trabajos/${job.id}`);
      } else {
        // Regular job creation
        const { data: job, error: jobErr } = await supabase.from('jobs').insert({
          business_id: business!.id,
          client_id: clientId || null,
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          job_address: address.trim() || null,
          job_city: city.trim() || null,
          job_state: state || null,
          scheduled_date: scheduledDate || null,
          time_start: timeStart || null,
          time_end: timeEnd || null,
          internal_notes: internalNotes.trim() || null,
          total_amount: subtotal,
        }).select().single();

        if (jobErr || !job) throw new Error(jobErr?.message ?? 'Error creating job');

        // Job items
        if (validItems.length > 0) {
          await supabase.from('job_items').insert(
            validItems.map(i => ({
              job_id: job.id,
              item_type: i.item_type,
              description: i.description,
              quantity: i.quantity,
              unit_price: i.unit_price,
            }))
          );
        }

        // Employee assignments
        const assignments: any[] = [];
        assignedEmployees.forEach(empId => {
          const emp = employees.find(e => e.id === empId);
          if (emp) assignments.push({
            job_id: job.id, employee_id: empId,
            worker_name: `${emp.first_name} ${emp.last_name}`,
          });
        });
        manualWorkers.filter(w => w.trim()).forEach(name => {
          assignments.push({ job_id: job.id, worker_name: name.trim() });
        });
        if (assignments.length > 0) {
          await supabase.from('job_assignments').insert(assignments);
        }

        router.push(`/dashboard/trabajos/${job.id}`);
      }
    } catch (e: any) {
      setError(e.message || 'Error al guardar');
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/trabajos" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-500"/>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isProposal ? 'Nueva propuesta' : 'Nuevo trabajo'}
          </h1>
          <p className="text-xs text-gray-400">
            {isProposal ? 'Crea una propuesta de precio para tu cliente' : 'Completa los detalles del trabajo'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">

        {/* ── Información general */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Información general</p>
          <div className="flex flex-col gap-3">
            <Input label={isProposal ? 'Título *' : 'Título del trabajo *'}
              placeholder="ej. Instalación de pivote — Rancho García"
              value={title} onChange={e => setTitle(e.target.value)}/>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Cliente</label>
              <div className="relative" ref={clientDropdownRef}>
                <button type="button" onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary">
                  {selectedClient ? (
                    <span className="text-gray-900 truncate">
                      {selectedClient.first_name} {selectedClient.last_name}
                      {selectedClient.company && <span className="text-gray-400"> · {selectedClient.company}</span>}
                    </span>
                  ) : (
                    <span className="text-gray-400">— Sin cliente —</span>
                  )}
                  <ChevronDown size={14} className="text-gray-400 shrink-0 ml-2"/>
                </button>
                {clientDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                        <input autoFocus type="text" placeholder="Buscar cliente..."
                          value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <button type="button" onClick={() => handleClientChange('')}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${!clientId ? 'text-primary font-medium' : 'text-gray-500'}`}>
                        — Sin cliente —
                      </button>
                      {filteredClients.map(c => (
                        <button type="button" key={c.id} onClick={() => handleClientChange(c.id)}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors truncate ${clientId === c.id ? 'text-primary font-medium bg-primary/5' : 'text-gray-900'}`}>
                          {c.first_name} {c.last_name}
                          {c.company && <span className="text-gray-400 ml-1">· {c.company}</span>}
                        </button>
                      ))}
                      {filteredClients.length === 0 && (
                        <p className="px-4 py-3 text-xs text-gray-400 text-center">Sin resultados</p>
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

            {isProposal ? (
              /* Proposal: issue + expiry dates */
              <div className="grid grid-cols-2 gap-3">
                <Input label="Fecha de emisión" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}/>
                <Input label="Válida hasta" type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}/>
              </div>
            ) : (
              /* Job: status + priority */
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Estado</label>
                  <select value={status} onChange={e => setStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                    <option value="scheduled">Programado</option>
                    <option value="in_progress">En progreso</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Prioridad</label>
                  <select value={priority} onChange={e => setPriority(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                    <option value="low">Baja</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Descripción</label>
              <textarea rows={2} placeholder="Detalle del trabajo a realizar..."
                value={description} onChange={e => setDescription(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"/>
            </div>
          </div>
        </div>

        {/* ── Ubicación (job mode only) */}
        {!isProposal && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ubicación del trabajo</p>
            </div>
            <div className="flex flex-col gap-3">
              {/* Map link paste */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Link2 size={13} className="text-gray-400"/> Pegar enlace de mapa
                </label>
                <input type="url" placeholder="https://maps.google.com/... o https://maps.apple.com/..."
                  value={mapLink} onChange={e => parseMapLink(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"/>
                {mapLink && !mapLink.includes('google') && !mapLink.includes('apple') && !mapLink.includes('goo.gl') && (
                  <p className="text-xs text-amber-500">Pega un enlace de Google Maps o Apple Maps para auto-llenar la dirección</p>
                )}
              </div>
              <div className="border-t border-gray-100 pt-3"/>
              <Input label="Dirección" placeholder="123 County Road" value={address}
                onChange={e => setAddress(e.target.value)}/>
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <Input label="Ciudad" placeholder="Omaha" value={city}
                  onChange={e => setCity(e.target.value)}/>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Estado</label>
                  <select value={state} onChange={e => setState(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                    <option value="">—</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Horario (job mode only) */}
        {!isProposal && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fecha y hora</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Fecha" type="date" value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}/>
              <Input label="Hora inicio" type="time" value={timeStart}
                onChange={e => setTimeStart(e.target.value)}/>
              <Input label="Hora fin" type="time" value={timeEnd}
                onChange={e => setTimeEnd(e.target.value)}/>
            </div>
          </div>
        )}

        {/* ── Empleados (job mode only) */}
        {!isProposal && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trabajadores asignados</p>
            </div>
            {employees.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {employees.map(emp => (
                  <button key={emp.id} type="button" onClick={() => toggleEmployee(emp.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                      assignedEmployees.includes(emp.id)
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      assignedEmployees.includes(emp.id) ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {emp.first_name.charAt(0)}{emp.last_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-gray-400 font-normal">{emp.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-400">Trabajadores adicionales (manual)</p>
              {manualWorkers.map((w, i) => (
                <div key={i} className="flex gap-2">
                  <input type="text" placeholder={`Trabajador ${i + 1}`} value={w}
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
                + Agregar trabajador
              </button>
            </div>
          </div>
        )}

        {/* ── Líneas de trabajo / Ítems */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign size={15} className="text-primary"/>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {isProposal ? 'Ítems / Servicios' : 'Materiales y mano de obra'}
              </p>
            </div>
            <button onClick={() => setItems(prev => [...prev, isProposal ? newItem() : newLaborItem()])}
              className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
              <Plus size={13}/> Agregar
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {isProposal ? (
              /* Proposal: simpler grid without item_type */
              <>
                <div className="grid grid-cols-[1fr_70px_90px_80px_32px] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide pb-1">
                  <span>Descripción</span><span className="text-center">Cant.</span><span className="text-right">Precio/u</span><span className="text-right">Total</span><span/>
                </div>
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-[1fr_70px_90px_80px_32px] gap-2 items-center">
                    <input type="text" placeholder="Descripción del servicio o material"
                      value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.5" value={item.quantity || ''}
                      onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.01" value={item.unit_price || ''}
                      onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <p className="text-sm font-semibold text-gray-900 text-right pr-1">
                      ${(item.quantity * item.unit_price).toFixed(2)}
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
                  <span>Tipo</span><span>Descripción</span><span className="text-center">Cant.</span><span className="text-right">Precio/u</span><span className="text-right">Total</span><span/>
                </div>
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-[100px_1fr_70px_90px_80px_32px] gap-2 items-center">
                    <select value={item.item_type}
                      onChange={e => updateItem(item.id, 'item_type', e.target.value)}
                      className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                      {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input type="text" placeholder="Descripción" value={item.description}
                      onChange={e => updateItem(item.id, 'description', e.target.value)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.5" value={item.quantity || ''}
                      onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <input type="number" min="0" step="0.01" value={item.unit_price || ''}
                      onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                    <p className="text-sm font-semibold text-gray-900 text-right pr-1">
                      ${(item.quantity * item.unit_price).toFixed(2)}
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
              {isProposal ? (
                <div className="w-52 flex flex-col gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-3">
                    <span className="text-gray-500 whitespace-nowrap">Impuesto (%)</span>
                    <input type="number" min="0" max="30" step="0.5" value={taxRate || ''}
                      placeholder="0" onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-20 rounded-xl border border-gray-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-3">
                    <span className="text-gray-500">Descuento ($)</span>
                    <input type="number" min="0" step="0.01" value={discount || ''}
                      placeholder="0" onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                      className="w-20 rounded-xl border border-gray-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                  </div>
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100">
                    <span>Total</span>
                    <span className="text-primary">${total.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-right">
                  <p className="text-xs text-gray-400">Total estimado</p>
                  <p className="text-lg font-bold text-gray-900">${subtotal.toFixed(2)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Notas */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={15} className="text-primary"/>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Notas</p>
          </div>
          <div className="flex flex-col gap-3">
            {isProposal && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Nota para el cliente</label>
                <textarea rows={2} placeholder="Términos, condiciones, detalles adicionales para el cliente..."
                  value={clientNotes} onChange={e => setClientNotes(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"/>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {isProposal ? 'Nota interna' : 'Notas internas'}
              </label>
              <textarea rows={3} placeholder={isProposal ? 'Notas privadas (no visibles para el cliente)...' : 'Instrucciones especiales, detalles del sitio, acceso...'}
                value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"/>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <Link href="/dashboard/trabajos" className="flex-1">
            <Button variant="secondary" fullWidth>Cancelar</Button>
          </Link>
          <Button onClick={save} loading={saving} fullWidth>
            {isProposal ? 'Crear propuesta' : 'Crear trabajo'}
          </Button>
        </div>
      </div>
    </div>
  );
}
