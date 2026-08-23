'use client';

// Field-crew quick-log modal (web). Records a completed job (title + optional
// client + notes); date is today and status is completed (set by the parent
// via logFieldJob). Parity with mobile/components/LogJobSheet.tsx.

import { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, MapPin } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';
import type { FieldClient, FieldJobLocation } from '@amixos/shared/lib/fieldHome';
import { Tooltip } from '@amixos/shared/ui/Tooltip';

export interface LogJobModalProps {
  open: boolean;
  onClose: () => void;
  clients: FieldClient[];
  clientsLoading: boolean;
  onSubmit: (input: { title: string; clientId: string | null; description: string | null; location: FieldJobLocation | null }) => Promise<boolean>;
}

type LocState = 'idle' | 'capturing' | 'done' | 'unavailable';

export function LogJobModal({ open, onClose, clients, clientsLoading, onSubmit }: LogJobModalProps) {
  const { t: full } = useLang();
  const f = full.dashboard.fieldHome;
  const tc = full.common;

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locState, setLocState] = useState<LocState>('idle');
  const [location, setLocation] = useState<FieldJobLocation | null>(null);

  // Auto-capture current location when the modal opens (browser permission
  // prompt). Non-blocking — the job still logs without it.
  useEffect(() => {
    if (!open) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setLocState('unavailable'); return; }
    setLocState('capturing');
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      pos => { if (!cancelled) { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocState('done'); } },
      () => { if (!cancelled) setLocState('unavailable'); },
      { enableHighAccuracy: false, timeout: 10000 },
    );
    return () => { cancelled = true; };
  }, [open]);

  const reset = () => { setTitle(''); setClientId(null); setNotes(''); setSearch(''); setError(null); setBusy(false); setLocState('idle'); setLocation(null); };
  const close = () => { reset(); onClose(); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? clients.filter(c => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, search]);

  const submit = async () => {
    if (busy) return;
    if (!title.trim()) { setError(f.titleRequired); return; }
    setBusy(true); setError(null);
    const ok = await onSubmit({ title: title.trim(), clientId, description: notes.trim() || null, location });
    setBusy(false);
    if (ok) close(); else setError(f.saveError2);
  };

  const locText = location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : '';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <h2 className="text-lg font-bold text-ink">{f.logTitle}</h2>
          <Tooltip tip="close">
            <button onClick={close} className="p-1 rounded-lg hover:bg-border-soft"><X size={20} className="text-muted" /></button>
          </Tooltip>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {/* Title */}
          <label className="block text-sm font-medium text-ink mb-1.5">{f.jobTitleLabel}</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={f.jobTitlePlaceholder}
            className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink mb-4 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />

          {/* Location geostamp (auto-captured) */}
          <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-surface border border-border-soft">
            <MapPin size={15} className={locState === 'done' ? 'text-emerald-600' : 'text-faint'} />
            <span className={`text-xs ${locState === 'done' ? 'text-ink' : 'text-faint'}`}>
              {locState === 'capturing' ? f.locCapturing : locState === 'done' ? locText : f.locUnavailable}
            </span>
          </div>

          {/* Client */}
          <label className="block text-sm font-medium text-ink mb-1.5">{f.clientLabel}</label>
          <div className="flex items-center border border-border rounded-xl px-3 mb-2">
            <Search size={16} className="text-faint" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={f.clientSearch}
              className="flex-1 px-2 py-2.5 text-sm text-ink focus:outline-none"
            />
          </div>
          <div className="border border-border-soft rounded-xl overflow-y-auto max-h-52 mb-4">
            <button
              onClick={() => setClientId(null)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface border-b border-border-soft text-left"
            >
              <span className={`text-sm ${clientId === null ? 'text-primary font-semibold' : 'text-muted'}`}>{f.noClientOption}</span>
              {clientId === null ? <Check size={16} className="text-primary" /> : null}
            </button>
            {clientsLoading ? (
              <p className="text-sm text-faint text-center py-6">…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-faint text-center py-6">{f.noResults}</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => setClientId(c.id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface border-b border-border-soft last:border-b-0 text-left"
                >
                  <span className={`text-sm truncate ${clientId === c.id ? 'text-primary font-semibold' : 'text-ink'}`}>{c.name}</span>
                  {clientId === c.id ? <Check size={16} className="text-primary shrink-0" /> : null}
                </button>
              ))
            )}
          </div>

          {/* Notes */}
          <label className="block text-sm font-medium text-ink mb-1.5">{f.notesLabel}</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink mb-4 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />

          {error ? (
            <div className="mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-100 text-sm text-red-600">{error}</div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-soft">
          <button onClick={close} className="px-4 py-2.5 rounded-xl bg-border-soft text-ink text-sm font-semibold hover:bg-border">{tc.buttons.cancel}</button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '…' : tc.buttons.save}
          </button>
        </div>
      </div>
    </div>
  );
}
