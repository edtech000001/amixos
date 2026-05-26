// Map module — mobile. Fullscreen MapView with three pin layers:
// clients, jobs, and "employees today" (derived from job_assignments).
// The user toggles which layers are visible via three pill buttons in
// the top bar. Tapping a pin opens a small callout with "Open record".
//
// Geocoding: clients without coords don't render. If any exist, a thin
// banner appears at the bottom inviting the user to backfill them via
// the API. One-tap → backfill → reload.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Users, Briefcase, UserCircle2, X } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
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

// Layer accent colors. Used both for the pill toggle (when active) and
// for the marker pin color.
const LAYER_COLORS: Record<Layer, string> = {
  clients:   '#0EA5E9', // sky blue
  jobs:      '#10B981', // emerald
  employees: '#F59E0B', // amber
};

// Fallback when no pins exist — center on the continental US so the map
// at least shows context.
const DEFAULT_REGION: Region = {
  latitude: 39.5,
  longitude: -98.35,
  latitudeDelta: 40,
  longitudeDelta: 60,
};

export default function MapScreen() {
  const router = useRouter();
  const { business } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.modules.map;
  // Module name comes from the same shared dict as everything else so
  // the header label stays in sync if the module is ever renamed.
  const moduleName = full.dashboard.modules.list.map.name;

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

  // Derive an initial region that frames every visible pin. If there are
  // no pins yet, fall back to the continental US default so the map at
  // least shows something.
  const initialRegion = useMemo<Region>(() => {
    if (!pins) return DEFAULT_REGION;
    const all: AnyPin[] = [
      ...(layers.clients ? pins.clients : []),
      ...(layers.jobs ? pins.jobs : []),
      ...(layers.employees ? pins.employees : []),
    ];
    if (all.length === 0) return DEFAULT_REGION;
    const lats = all.map(p => p.lat);
    const lngs = all.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const latDelta = Math.max((maxLat - minLat) * 1.3, 0.05);
    const lngDelta = Math.max((maxLng - minLng) * 1.3, 0.05);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
    // Recompute initial region only on the first data load — re-zooming
    // every time the user toggles a layer would be jarring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const j = await r.json();
        const { geocoded = 0 } = j?.data ?? {};
        Alert.alert('', t.geocodeDone.replace('{{count}}', String(geocoded)));
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
      router.push(`/dashboard/clientes/${id}` as never);
    } else if (selected.type === 'job') {
      router.push(`/dashboard/trabajos/${id}` as never);
    } else if (selected.type === 'employee') {
      // Employees pin where the JOB is — opening goes to that job, not
      // an employee detail screen (we don't have one in core yet).
      const jobId = selected.job_id;
      if (jobId) router.push(`/dashboard/trabajos/${jobId}` as never);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="ml-1 text-lg font-semibold text-gray-900">{moduleName}</Text>
      </View>

      {/* Layer toggle pills — three colored chips at the top. Tapping
          toggles visibility of that pin set on the map. */}
      <View className="flex-row px-4 pb-3 gap-2">
        <LayerPill
          icon={Users}
          label={t.layers.clients}
          color={LAYER_COLORS.clients}
          active={layers.clients}
          count={pins?.clients.length ?? 0}
          onPress={() => setLayers(l => ({ ...l, clients: !l.clients }))}
        />
        <LayerPill
          icon={Briefcase}
          label={t.layers.jobs}
          color={LAYER_COLORS.jobs}
          active={layers.jobs}
          count={pins?.jobs.length ?? 0}
          onPress={() => setLayers(l => ({ ...l, jobs: !l.jobs }))}
        />
        <LayerPill
          icon={UserCircle2}
          label={t.layers.employees}
          color={LAYER_COLORS.employees}
          active={layers.employees}
          count={pins?.employees.length ?? 0}
          onPress={() => setLayers(l => ({ ...l, employees: !l.employees }))}
        />
      </View>

      <View className="flex-1">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#4F46E5" />
          </View>
        ) : (
          <MapView
            // No `provider` prop → react-native-maps uses the platform
            // default: Apple Maps on iOS (free, no extra native SDK), Google
            // Maps on Android (its built-in default). The web map uses
            // Google for the recognizable look. Switching iOS to Google
            // would require manually installing the GoogleMaps iOS pod via
            // a config plugin or post-prebuild step — out of scope for v1.
            style={{ flex: 1 }}
            initialRegion={initialRegion}
          >
            {visiblePins.map(p => (
              <Marker
                key={`${p.type}-${p.id}`}
                coordinate={{ latitude: p.lat, longitude: p.lng }}
                pinColor={LAYER_COLORS[p.type === 'client' ? 'clients' : p.type === 'job' ? 'jobs' : 'employees']}
                onPress={() => setSelected(p)}
                tracksViewChanges={false}
              />
            ))}
          </MapView>
        )}

        {/* Geocode banner — only when there are clients still missing
            coordinates. Tap-to-backfill saves a settings detour. */}
        {!loading && pins && pins.needsGeocoding > 0 ? (
          <Pressable
            onPress={onGeocode}
            disabled={geocoding}
            className="absolute bottom-4 left-4 right-4 rounded-2xl bg-white border border-gray-200 px-4 py-3 flex-row items-center gap-3"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          >
            <View className="w-8 h-8 rounded-full bg-sky-100 items-center justify-center">
              <Users size={16} color="#0EA5E9" />
            </View>
            <Text className="flex-1 text-sm text-gray-900">
              {geocoding
                ? t.geocodeRunning
                : t.geocodeMissing.replace('{{count}}', String(pins.needsGeocoding))}
            </Text>
            {geocoding ? <ActivityIndicator size="small" color="#4F46E5" /> : null}
          </Pressable>
        ) : null}

        {/* Selected pin sheet — single tap on a marker; bottom sheet
            shows name + Open button. Modeled after the existing job
            assignment sheet to keep visual language consistent. */}
        {selected ? (
          <View
            className="absolute bottom-0 left-0 right-0 bg-white px-5 pt-4 pb-8 rounded-t-3xl"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: -2 },
              elevation: 8,
            }}
          >
            <View className="flex-row items-start gap-3 mb-3">
              <View
                className="w-12 h-12 rounded-2xl items-center justify-center"
                style={{ backgroundColor: `${
                  selected.type === 'client'
                    ? LAYER_COLORS.clients
                    : selected.type === 'job'
                      ? LAYER_COLORS.jobs
                      : LAYER_COLORS.employees
                }15` }}
              >
                {selected.type === 'client' ? (
                  <Users size={20} color={LAYER_COLORS.clients} />
                ) : selected.type === 'job' ? (
                  <Briefcase size={20} color={LAYER_COLORS.jobs} />
                ) : (
                  <UserCircle2 size={20} color={LAYER_COLORS.employees} />
                )}
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
                  {selected.type === 'client'
                    ? `${selected.first_name} ${selected.last_name}`
                    : selected.type === 'job'
                      ? selected.title
                      : `${selected.first_name} ${selected.last_name}`}
                </Text>
                {selected.type === 'client' && selected.company ? (
                  <Text className="text-xs text-gray-500" numberOfLines={1}>{selected.company}</Text>
                ) : selected.type === 'job' && selected.client_name ? (
                  <Text className="text-xs text-gray-500" numberOfLines={1}>{selected.client_name}</Text>
                ) : selected.type === 'employee' && selected.job_title ? (
                  <Text className="text-xs text-gray-500" numberOfLines={1}>
                    {t.assignedToJob}: {selected.job_title}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={8} className="p-1 -mr-1">
                <X size={18} color="#6B7280" />
              </Pressable>
            </View>
            <Pressable
              onPress={openSelected}
              className="rounded-xl bg-primary py-3 items-center active:opacity-80"
            >
              <Text className="text-sm font-semibold text-white">{t.openRecord}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

interface LayerPillProps {
  icon: typeof Users;
  label: string;
  color: string;
  active: boolean;
  count: number;
  onPress: () => void;
}

function LayerPill({ icon: Icon, label, color, active, count, onPress }: LayerPillProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full ${
        active ? '' : 'opacity-50'
      }`}
      style={{ backgroundColor: active ? `${color}20` : '#F3F4F6' }}
    >
      <Icon size={14} color={active ? color : '#6B7280'} />
      <Text
        className="text-xs font-semibold"
        style={{ color: active ? color : '#6B7280' }}
      >
        {label}
      </Text>
      <View className="bg-white/70 rounded-full px-1.5 py-0.5 min-w-[20px] items-center">
        <Text
          className="text-[10px] font-bold"
          style={{ color: active ? color : '#6B7280' }}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}
