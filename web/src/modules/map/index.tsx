'use client';

// Map module — web. Counterpart to mobile/modules/map/MapScreen.tsx but
// uses @react-google-maps/api (the Google Maps JS API wrapper) instead of
// react-native-maps. Same data shape, same three pin layers, same Google
// Geocoding backfill flow.
//
// Lazy-loaded via next/dynamic from the module route stub — its chunk
// only downloads when the user visits /dashboard/modulos/map.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleMap,
  Marker,
  useJsApiLoader,
} from '@react-google-maps/api';
import { Users, Briefcase, UserCircle2, X } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

type Layer = 'clients' | 'jobs' | 'employees';

interface ClientPin {
  id: string;
  type: 'client';
  lat: number;
  lng: number;
  first_name: string;
  last_name: string;
  company: string | null;
}
interface JobPin {
  id: string;
  type: 'job';
  lat: number;
  lng: number;
  title: string;
  status: string;
  scheduled_date: string | null;
  client_name: string | null;
}
interface EmployeePin {
  id: string;
  type: 'employee';
  lat: number;
  lng: number;
  first_name: string;
  last_name: string;
  job_id: string | null;
  job_title: string | null;
}
type AnyPin = ClientPin | JobPin | EmployeePin;

interface PinsResponse {
  clients: ClientPin[];
  jobs: JobPin[];
  employees: EmployeePin[];
  needsGeocoding: number;
}

const LAYER_COLORS: Record<Layer, string> = {
  clients:   '#0EA5E9',
  jobs:      '#10B981',
  employees: '#F59E0B',
};

// Default center: continental US. Replaced by the centroid of visible
// pins once data loads.
const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 };

export default function MapModule() {
  const router = useRouter();
  const { business } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.modules.map;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    id: 'amixos-map',
  });

  const [pins, setPins] = useState<PinsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    clients: true,
    jobs: true,
    employees: true,
  });
  const [selected, setSelected] = useState<AnyPin | null>(null);

  const apiBaseUrl = getApiBaseUrl();

  const load = useCallback(async () => {
    if (!business || !apiBaseUrl) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const jwt = await getJwt();
      const r = await fetch(`${apiBaseUrl}/api/v1/map/pins?business_id=${business.id}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (r.ok) {
        const j = await r.json();
        setPins((j?.data ?? null) as PinsResponse | null);
      } else {
        setPins(null);
      }
    } catch {
      setPins(null);
    }
    setLoading(false);
  }, [business, apiBaseUrl]);

  useEffect(() => { void load(); }, [load]);

  // Compute initial center + zoom from visible pins, mirroring the
  // mobile region calculation. Only recomputed on first data load —
  // toggling layers re-renders without forcing a recenter.
  const initialCenter = useMemo(() => {
    if (!pins) return DEFAULT_CENTER;
    const all: AnyPin[] = [...pins.clients, ...pins.jobs, ...pins.employees];
    if (all.length === 0) return DEFAULT_CENTER;
    const lats = all.map(p => p.lat);
    const lngs = all.map(p => p.lng);
    return {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
  }, [pins]);

  const visiblePins: AnyPin[] = useMemo(() => {
    if (!pins) return [];
    return [
      ...(layers.clients ? pins.clients : []),
      ...(layers.jobs ? pins.jobs : []),
      ...(layers.employees ? pins.employees : []),
    ];
  }, [pins, layers]);

  const onGeocode = async () => {
    if (!business || !apiBaseUrl) return;
    setGeocoding(true);
    try {
      const jwt = await getJwt();
      const r = await fetch(`${apiBaseUrl}/api/v1/map/geocode-clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ business_id: business.id }),
      });
      if (r.ok) {
        await load();
      }
    } catch {
      // ignore
    }
    setGeocoding(false);
  };

  const openSelected = () => {
    if (!selected) return;
    const id = selected.id;
    setSelected(null);
    if (selected.type === 'client') {
      router.push(`/dashboard/clientes/${id}`);
    } else if (selected.type === 'job') {
      router.push(`/dashboard/trabajos/${id}`);
    } else if (selected.type === 'employee') {
      const jobId = selected.job_id;
      if (jobId) router.push(`/dashboard/trabajos/${jobId}`);
    }
  };

  if (!apiKey) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center max-w-md mx-auto">
          <p className="text-sm font-semibold text-red-600 mb-1">Missing API key</p>
          <p className="text-xs text-gray-500">
            Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to <code>web/.env.local</code> and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Layer pills — match mobile chip styling. */}
      <div className="flex gap-2 p-4">
        <LayerPill
          Icon={Users}
          label={t.layers.clients}
          color={LAYER_COLORS.clients}
          active={layers.clients}
          count={pins?.clients.length ?? 0}
          onClick={() => setLayers(l => ({ ...l, clients: !l.clients }))}
        />
        <LayerPill
          Icon={Briefcase}
          label={t.layers.jobs}
          color={LAYER_COLORS.jobs}
          active={layers.jobs}
          count={pins?.jobs.length ?? 0}
          onClick={() => setLayers(l => ({ ...l, jobs: !l.jobs }))}
        />
        <LayerPill
          Icon={UserCircle2}
          label={t.layers.employees}
          color={LAYER_COLORS.employees}
          active={layers.employees}
          count={pins?.employees.length ?? 0}
          onClick={() => setLayers(l => ({ ...l, employees: !l.employees }))}
        />
      </div>

      {/* The map itself — fills the rest of the viewport. */}
      <div className="relative flex-1 mx-4 mb-4 rounded-2xl overflow-hidden border border-gray-100">
        {!isLoaded || loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={initialCenter}
            zoom={pins && visiblePins.length > 0 ? 10 : 4}
            options={{
              disableDefaultUI: false,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
            }}
          >
            {visiblePins.map(p => {
              const color =
                p.type === 'client'
                  ? LAYER_COLORS.clients
                  : p.type === 'job'
                    ? LAYER_COLORS.jobs
                    : LAYER_COLORS.employees;
              return (
                <Marker
                  key={`${p.type}-${p.id}`}
                  position={{ lat: p.lat, lng: p.lng }}
                  onClick={() => setSelected(p)}
                  // Color the default Google pin via SymbolPath. Simpler
                  // than uploading custom marker images for v1.
                  icon={{
                    path: 'M 0 0 C -2 -20 -10 -22 -10 -30 A 10 10 0 1 1 10 -30 C 10 -22 2 -20 0 0 z',
                    fillColor: color,
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 1.5,
                    scale: 1,
                  } as google.maps.Symbol}
                />
              );
            })}
          </GoogleMap>
        )}

        {/* Geocode banner. */}
        {!loading && pins && pins.needsGeocoding > 0 ? (
          <button
            onClick={onGeocode}
            disabled={geocoding}
            className="absolute bottom-4 left-4 right-4 md:right-auto md:max-w-md rounded-2xl bg-white border border-gray-200 shadow-md px-4 py-3 flex items-center gap-3 hover:bg-gray-50 disabled:opacity-60"
          >
            <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
              <Users size={16} className="text-sky-500" />
            </div>
            <span className="flex-1 text-sm text-gray-900 text-left">
              {geocoding
                ? t.geocodeRunning
                : t.geocodeMissing.replace('{{count}}', String(pins.needsGeocoding))}
            </span>
          </button>
        ) : null}

        {/* Selected pin sheet — mirrors the mobile bottom-sheet pattern. */}
        {selected ? (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white rounded-2xl border border-gray-100 shadow-xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: `${
                    selected.type === 'client'
                      ? LAYER_COLORS.clients
                      : selected.type === 'job'
                        ? LAYER_COLORS.jobs
                        : LAYER_COLORS.employees
                  }15`,
                }}
              >
                {selected.type === 'client' ? (
                  <Users size={20} color={LAYER_COLORS.clients} />
                ) : selected.type === 'job' ? (
                  <Briefcase size={20} color={LAYER_COLORS.jobs} />
                ) : (
                  <UserCircle2 size={20} color={LAYER_COLORS.employees} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-gray-900 truncate">
                  {selected.type === 'client'
                    ? `${selected.first_name} ${selected.last_name}`
                    : selected.type === 'job'
                      ? selected.title
                      : `${selected.first_name} ${selected.last_name}`}
                </p>
                {selected.type === 'client' && selected.company ? (
                  <p className="text-xs text-gray-500 truncate">{selected.company}</p>
                ) : selected.type === 'job' && selected.client_name ? (
                  <p className="text-xs text-gray-500 truncate">{selected.client_name}</p>
                ) : selected.type === 'employee' && selected.job_title ? (
                  <p className="text-xs text-gray-500 truncate">
                    {t.assignedToJob}: {selected.job_title}
                  </p>
                ) : null}
              </div>
              <button onClick={() => setSelected(null)} className="p-1 -mr-1 text-gray-500 hover:text-gray-900">
                <X size={18} />
              </button>
            </div>
            <button
              onClick={openSelected}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {t.openRecord}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface LayerPillProps {
  Icon: typeof Users;
  label: string;
  color: string;
  active: boolean;
  count: number;
  onClick: () => void;
}

function LayerPill({ Icon, label, color, active, count, onClick }: LayerPillProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-opacity ${
        active ? '' : 'opacity-50'
      }`}
      style={{ backgroundColor: active ? `${color}20` : '#F3F4F6', color: active ? color : '#6B7280' }}
    >
      <Icon size={14} />
      {label}
      <span
        className="bg-white/70 rounded-full px-1.5 py-0.5 min-w-[20px] text-center text-[10px] font-bold"
        style={{ color: active ? color : '#6B7280' }}
      >
        {count}
      </span>
    </button>
  );
}
