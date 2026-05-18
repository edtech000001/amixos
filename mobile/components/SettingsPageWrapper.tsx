import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

interface SettingsPageProps {
  title: string;
  children: ReactNode;
}

/**
 * Shared shell for individual settings sub-pages. Header with a back arrow
 * (returns to the settings list), title, and a scrollable content area with
 * dock clearance padding.
 */
export function SettingsPageWrapper({ title, children }: SettingsPageProps) {
  const router = useRouter();
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
        <Text className="ml-1 text-lg font-semibold text-gray-900">{title}</Text>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-6 pb-36"
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
