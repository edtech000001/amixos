import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Home, LayoutGrid, Lock, GripVertical, Minus, Plus } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useDockStore } from '@/lib/dockStore';
import { SortableList } from '@/components/SortableList';
import { useThemeColors } from '@/lib/ThemeProvider';
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
  const c = useThemeColors();

  const eligible = useMemo(() => eligibleDockApps(currentRole), [currentRole]);
  // The middle selection, in the user's saved order.
  const selectedKeys = useMemo(() => effectiveDockKeys(keys, currentRole), [keys, currentRole]);
  const byKey = useMemo(() => new Map(eligible.map(a => [a.key, a])), [eligible]);
  // Selected apps as ordered DockApp objects (drag list); available = the rest.
  const selectedApps = useMemo(
    () => selectedKeys.map(k => byKey.get(k)).filter((a): a is DockApp => !!a),
    [selectedKeys, byKey],
  );
  const availableApps = useMemo(
    () => eligible.filter(a => !selectedKeys.includes(a.key)),
    [eligible, selectedKeys],
  );
  const maxLabel = String(MAX_DOCK_MIDDLE);

  const persist = (next: string[]) => {
    if (!user?.id) return;
    save(supabase, user.id, next).then(({ error }) => { if (error) setMsg(t.savedError); });
  };

  const onReorder = (items: { id: string }[]) => {
    setMsg(null);
    persist(items.map(it => it.id));
  };

  const removeApp = (app: DockApp) => {
    if (selectedKeys.length <= MIN_DOCK_MIDDLE) { setMsg(t.minReached); return; }
    setMsg(null);
    persist(selectedKeys.filter(k => k !== app.key));
  };

  const addApp = (app: DockApp) => {
    if (selectedKeys.length >= MAX_DOCK_MIDDLE) { setMsg(t.maxReached.replace('{{max}}', maxLabel)); return; }
    setMsg(null);
    persist([...selectedKeys, app.key]);
  };

  const FixedRow = ({ label, Icon }: { label: string; Icon: typeof Home }) => (
    <View className="flex-row items-center gap-3 px-4 py-4 border-b border-border-soft">
      <View className="w-10 h-10 rounded-xl bg-border-soft items-center justify-center">
        <Icon size={18} color={c.muted} />
      </View>
      <Text className="flex-1 text-base font-semibold text-ink">{label}</Text>
      <View className="flex-row items-center gap-1 px-2 py-1 rounded-lg bg-border-soft">
        <Lock size={11} color={c.faint} />
        <Text className="text-[11px] font-medium text-muted">{t.fixedBadge}</Text>
      </View>
    </View>
  );

  const SectionLabel = ({ label }: { label: string }) => (
    <Text className="text-xs font-semibold uppercase tracking-wide text-faint mt-6 mb-2 px-1">
      {label}
    </Text>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-1">
        <Pressable onPress={() => router.back()} hitSlop={10} className="p-2 -ml-2">
          <ChevronLeft size={24} color={c.ink} />
        </Pressable>
      </View>
      <ScrollView contentContainerClassName="px-6 pt-2 pb-36">
        <Text className="text-2xl font-bold text-ink mb-1">{t.title}</Text>
        <Text className="text-sm text-muted mb-2">{t.intro.replace('{{max}}', maxLabel)}</Text>

        {msg ? (
          <View className="mb-3 rounded-xl bg-amber-500/10 border border-amber-100 px-4 py-2.5">
            <Text className="text-xs text-amber-700">{msg}</Text>
          </View>
        ) : null}

        {/* In the bar — Inicio (fixed) → draggable selection → Más (fixed) */}
        <SectionLabel label={t.inBarLabel} />
        <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
          <FixedRow label={t.inicioLabel} Icon={Home} />

          <SortableList<{ id: string; app: DockApp }>
            items={selectedApps.map(a => ({ id: a.key, app: a }))}
            onReorder={onReorder}
            renderItem={({ app }) => {
              const Icon = app.Icon;
              const canRemove = selectedKeys.length > MIN_DOCK_MIDDLE;
              return (
                <View className="flex-row items-center gap-3 px-4 py-4 border-b border-border-soft bg-card">
                  <GripVertical size={18} color={c.faint} />
                  <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                    <Icon size={18} color={c.primary} />
                  </View>
                  <Text className="flex-1 text-base font-semibold text-ink">{sb[app.labelKey]}</Text>
                  <Pressable
                    onPress={() => removeApp(app)}
                    hitSlop={8}
                    className={`w-7 h-7 rounded-full items-center justify-center ${
                      canRemove ? 'bg-red-500/10' : 'bg-border-soft'
                    }`}
                  >
                    <Minus size={16} color={canRemove ? c.danger : c.faint} strokeWidth={3} />
                  </Pressable>
                </View>
              );
            }}
          />

          <FixedRow label={t.masLabel} Icon={LayoutGrid} />
        </View>
        <Text className="text-xs text-faint mt-2 px-1">{t.reorderHint}</Text>

        {/* Available — not in the bar; tap + to add (reachable from Más meanwhile) */}
        {availableApps.length ? (
          <>
            <SectionLabel label={t.availableLabel} />
            <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
              {availableApps.map(app => {
                const Icon = app.Icon;
                return (
                  <Pressable
                    key={app.key}
                    onPress={() => addApp(app)}
                    className="flex-row items-center gap-3 px-4 py-4 border-b border-border-soft active:bg-surface"
                  >
                    <View className="w-10 h-10 rounded-xl bg-border-soft items-center justify-center">
                      <Icon size={18} color={c.muted} />
                    </View>
                    <Text className="flex-1 text-base font-semibold text-ink">{sb[app.labelKey]}</Text>
                    <View className="w-7 h-7 rounded-full bg-primary/10 items-center justify-center">
                      <Plus size={16} color={c.primary} strokeWidth={3} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text className="text-xs text-faint mt-4 px-1">{t.maxNote.replace('{{max}}', maxLabel)}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
