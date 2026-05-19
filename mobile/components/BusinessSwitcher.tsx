import { useState } from 'react';
import { View, Text, Pressable, Modal as RNModal } from 'react-native';
import { ChevronDown, Check, Building2 } from 'lucide-react-native';
import { useAuthStore } from '@/lib/auth/store';
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
  const { t: full } = useLang();
  const tw = full.dashboard.workspaces;

  const [open, setOpen] = useState(false);
  const active = businesses.find((b) => b.id === activeId);

  if (!active) return null;

  // Single-business users don't need a switcher — just show the name.
  if (businesses.length <= 1) {
    return (
      <View className="flex-row items-center gap-2">
        <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center">
          <Building2 size={16} color="#4F46E5" />
        </View>
        <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
          {active.name}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-2 active:opacity-70"
        accessibilityLabel={tw.switcherLabel}
      >
        <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center">
          <Building2 size={16} color="#4F46E5" />
        </View>
        <Text className="text-base font-semibold text-gray-900 max-w-[180px]" numberOfLines={1}>
          {active.name}
        </Text>
        <ChevronDown size={16} color="#6B7280" />
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
            <View className="bg-gray-50 rounded-2xl overflow-hidden">
              {businesses.map((b, i) => {
                const isActive = b.id === activeId;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => {
                      setActiveBusiness(b.id);
                      setOpen(false);
                    }}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${
                      i < businesses.length - 1 ? 'border-b border-gray-100' : ''
                    } active:bg-gray-100`}
                  >
                    <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                      <Building2 size={16} color="#4F46E5" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
                        {b.name}
                      </Text>
                      {b.city ? (
                        <Text className="text-xs text-gray-500" numberOfLines={1}>
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
          </Pressable>
        </Pressable>
      </RNModal>
    </>
  );
}
