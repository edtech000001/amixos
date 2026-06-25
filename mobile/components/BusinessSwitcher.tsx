import { useState } from 'react';
import { View, Text, Pressable, Modal as RNModal } from 'react-native';
import { ChevronDown, Check, Building2, CloudOff, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/auth/store';
import { useNetworkStore } from '@/lib/offline/network';
import { useLang } from '@/lib/i18n/LangProvider';

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
  const tw = full.dashboard.workspaces;
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const active = businesses.find((b) => b.id === activeId);

  if (!active) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="self-start flex-row items-center gap-2 border border-gray-200 bg-white rounded-2xl active:bg-gray-50"
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
          <Building2 size={12} color="#4F46E5" />
        </View>
        <Text className="flex-1 text-sm font-semibold text-gray-900">
          {active.name}
        </Text>
        <ChevronDown size={14} color="#4F46E5" />
      </Pressable>

      <RNModal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          className="flex-1 bg-black/40 justify-end"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl px-4 pb-8 pt-4"
          >
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <Text className="text-xs font-semibold text-gray-400 uppercase px-3 mb-2">
              {tw.switcherLabel}
            </Text>
            {!isOnline ? (
              <View className="flex-row items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
                <CloudOff size={14} color="#92400E" />
                <Text className="flex-1 text-xs font-medium text-amber-700">
                  Sin conexión · conéctate para cambiar de negocio
                </Text>
              </View>
            ) : null}
            <View className="bg-gray-50 rounded-2xl overflow-hidden">
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
                      setActiveBusiness(b.id);
                      setOpen(false);
                    }}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${
                      i < businesses.length - 1 ? 'border-b border-gray-100' : ''
                    } ${locked ? 'opacity-40' : 'active:bg-gray-100'}`}
                  >
                    <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                      <Building2 size={16} color="#4F46E5" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-900">
                        {b.name}
                      </Text>
                      {b.city ? (
                        <Text className="text-xs text-gray-500">
                          {b.city}
                          {b.state ? `, ${b.state}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    {isActive ? <Check size={18} color="#4F46E5" /> : null}
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
                router.push('/onboarding');
              }}
              className="flex-row items-center gap-3 mt-2 pt-3 px-4 pb-1 border-t border-gray-100 active:opacity-70"
            >
              <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                <Plus size={16} color="#4F46E5" />
              </View>
              <Text className="flex-1 text-sm font-semibold text-primary">
                {tw.createBusiness}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </RNModal>
    </>
  );
}
