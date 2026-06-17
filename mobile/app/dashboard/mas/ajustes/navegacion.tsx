import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Home, LayoutGrid, Check, Lock } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useDockStore } from '@/lib/dockStore';
import {
  eligibleDockApps,
  effectiveDockKeys,
  MAX_DOCK_MIDDLE,
  MIN_DOCK_MIDDLE,
  type DockApp,
} from '@/lib/dockApps';

export default function NavegacionSettings() {
  const router = useRouter();
  const { t: full } = useLang();
  const sb = full.dashboard.sidebar;
  const t = full.dashboard.settings.navigation;
  const { currentRole, user } = useApp();
  const supabase = useMemo(() => createSupabaseClient(), []);
  const keys = useDockStore(s => s.keys);
  const save = useDockStore(s => s.save);
  const [msg, setMsg] = useState<string | null>(null);

  const eligible = useMemo(() => eligibleDockApps(currentRole), [currentRole]);
  const selected = useMemo(() => new Set(effectiveDockKeys(keys, currentRole)), [keys, currentRole]);
  const maxLabel = String(MAX_DOCK_MIDDLE);

  const toggle = (app: DockApp) => {
    const isOn = selected.has(app.key);
    if (isOn && selected.size <= MIN_DOCK_MIDDLE) { setMsg(t.minReached); return; }
    if (!isOn && selected.size >= MAX_DOCK_MIDDLE) { setMsg(t.maxReached.replace('{{max}}', maxLabel)); return; }
    setMsg(null);
    const nextSet = new Set(selected);
    if (isOn) nextSet.delete(app.key); else nextSet.add(app.key);
    // Persist in catalog order so the dock order is deterministic.
    const next = eligible.filter(a => nextSet.has(a.key)).map(a => a.key);
    if (user?.id) save(supabase, user.id, next).then(({ error }) => { if (error) setMsg(t.savedError); });
  };

  const FixedRow = ({ label, Icon }: { label: string; Icon: typeof Home }) => (
    <View className="flex-row items-center gap-3 px-4 py-4 border-b border-gray-50">
      <View className="w-10 h-10 rounded-xl bg-gray-100 items-center justify-center">
        <Icon size={18} color="#6B7280" />
      </View>
      <Text className="flex-1 text-base font-semibold text-gray-900">{label}</Text>
      <View className="flex-row items-center gap-1 px-2 py-1 rounded-lg bg-gray-100">
        <Lock size={11} color="#9CA3AF" />
        <Text className="text-[11px] font-medium text-gray-500">{t.fixedBadge}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-1">
        <Pressable onPress={() => router.back()} hitSlop={10} className="p-2 -ml-2">
          <ChevronLeft size={24} color="#111827" />
        </Pressable>
      </View>
      <ScrollView contentContainerClassName="px-6 pt-2 pb-36">
        <Text className="text-2xl font-bold text-gray-900 mb-1">{t.title}</Text>
        <Text className="text-sm text-gray-500 mb-5">{t.intro.replace('{{max}}', maxLabel)}</Text>

        {msg ? (
          <View className="mb-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-2.5">
            <Text className="text-xs text-amber-700">{msg}</Text>
          </View>
        ) : null}

        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Inicio — always first, fixed */}
          <FixedRow label={t.inicioLabel} Icon={Home} />

          {eligible.map(app => {
            const Icon = app.Icon;
            const on = selected.has(app.key);
            return (
              <Pressable
                key={app.key}
                onPress={() => toggle(app)}
                className="flex-row items-center gap-3 px-4 py-4 border-b border-gray-50 active:bg-gray-50"
              >
                <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                  <Icon size={18} color="#4F46E5" />
                </View>
                <Text className="flex-1 text-base font-semibold text-gray-900">{sb[app.labelKey]}</Text>
                <View
                  className={`w-6 h-6 rounded-md items-center justify-center border ${
                    on ? 'bg-primary border-primary' : 'border-gray-300 bg-white'
                  }`}
                >
                  {on ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          })}

          {/* Más — always last, fixed */}
          <FixedRow label={t.masLabel} Icon={LayoutGrid} />
        </View>

        <Text className="text-xs text-gray-400 mt-3 px-1">{t.maxNote.replace('{{max}}', maxLabel)}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
