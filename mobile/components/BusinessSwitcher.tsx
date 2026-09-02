import { useState } from 'react';
import { View, Text, Pressable, Modal as RNModal } from 'react-native';
import { ChevronDown, Check, Building2, CloudOff, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/auth/store';
import { useNetworkStore } from '@/lib/offline/network';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';

/**
 * Tap the active business name to open a bottom sheet listing every business
 * the user is a member of. Picking one flips the entire app's data context
 * via setActiveBusiness — every dashboard query that reads `business.id`
 * starts seeing the newly-selected business's data.
 *
 * Hidden entirely if the user is only a member of one business (nothing to
 * switch to).
 */
export function BusinessSwitcher() {
  const businesses = useAuthStore((s) => s.businesses);
  const activeId = useAuthStore((s) => s.activeBusinessId);
  const setActiveBusiness = useAuthStore((s) => s.setActiveBusiness);
  // Switching is blocked offline: each business can customize its role
  // permissions (business_roles), and those overrides can't be fetched without
  // a connection — so switching offline would silently apply the looser
  // built-in defaults, granting access the owner may have restricted.
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { t: full } = useLang();
  const c = useThemeColors();
  const tw = full.dashboard.workspaces;
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const active = businesses.find((b) => b.id === activeId);

  if (!active) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="self-start flex-row items-center gap-2 border border-border bg-card rounded-2xl active:bg-surface"
        accessibilityLabel={tw.switcherLabel}
        style={{
          paddingLeft: 20,
          paddingRight: 12,
          paddingTop: 8,
          paddingBottom: 8,
          shadowColor: '#000',
          shadowOpacity: 0.04,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        }}
      >
        <View className="w-5 h-5 rounded-md bg-primary/10 items-center justify-center">
          <Building2 size={12} color={c.primary} />
        </View>
        <Text className="flex-1 text-sm font-semibold text-ink">
          {active.name}
        </Text>
        <ChevronDown size={14} color={c.primary} />
      </Pressable>

      <RNModal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* Backdrop is an absolute FIRST child and the card a plain sibling,
            per the sheet contract in CLAUDE.md: nesting the card inside the
            backdrop Pressable stops its ScrollView receiving drags. */}
        <View className="flex-1 justify-end">
          <Pressable
            onPress={() => setOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
          />
          <View
            className="bg-card rounded-t-3xl px-4 pb-8 pt-4"
          >
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <Text className="text-xs font-semibold text-faint uppercase px-3 mb-2">
              {tw.switcherLabel}
            </Text>
            {!isOnline ? (
              <View className="flex-row items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-100">
                <CloudOff size={14} color={c.warning} />
                <Text className="flex-1 text-xs font-medium text-amber-700">
                  Sin conexión · conéctate para cambiar de negocio
                </Text>
              </View>
            ) : null}
            <View className="bg-surface rounded-2xl overflow-hidden">
              {businesses.map((b, i) => {
                const isActive = b.id === activeId;
                // Offline: only the current business stays selectable (no switch).
                const locked = !isOnline && !isActive;
                return (
                  <Pressable
                    key={b.id}
                    disabled={locked}
                    onPress={() => {
                      if (locked) return;
                      const switching = b.id !== activeId;
                      setActiveBusiness(b.id);
                      setOpen(false);
                      // Land on the dashboard so nothing scoped to the previous
                      // business (a detail screen, an open sheet) is left showing
                      // stale/out-of-context data. Only on a real switch.
                      if (switching) router.replace('/dashboard');
                    }}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${
                      i < businesses.length - 1 ? 'border-b border-border-soft' : ''
                    } ${locked ? 'opacity-40' : 'active:bg-border-soft'}`}
                  >
                    <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                      <Building2 size={16} color={c.primary} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">
                        {b.name}
                      </Text>
                      {b.city ? (
                        <Text className="text-xs text-muted">
                          {b.city}
                          {b.state ? `, ${b.state}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    {isActive ? <Check size={18} color={c.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>

            {/* Create another business — reuses the existing onboarding flow.
                Single-business owners reach it here too (the switcher now
                always renders). */}
            <Pressable
              onPress={() => {
                setOpen(false);
                // adding=1 → onboarding shows a "Cancel" escape (the user
                // already has a business and can back out).
                router.push('/onboarding?adding=1');
              }}
              className="flex-row items-center gap-3 mt-2 pt-3 px-4 pb-1 border-t border-border-soft active:opacity-70"
            >
              <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                <Plus size={16} color={c.primary} />
              </View>
              <Text className="flex-1 text-sm font-semibold text-primary">
                {tw.createBusiness}
              </Text>
            </Pressable>
          </View>
        </View>
      </RNModal>
    </>
  );
}
