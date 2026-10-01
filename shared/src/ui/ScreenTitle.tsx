import { Pressable, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeColors } from '../theme';

/**
 * A screen's big title, with an optional back arrow in front of it. Mobile
 * passes `onBack` when the screen was opened from the Más menu (not pinned
 * to the dock) so there's always a way back to that list.
 */
export function ScreenTitle({ title, onBack }: { title: string; onBack?: () => void }) {
  const c = useThemeColors();
  if (!onBack) return <Text className="text-2xl font-bold text-ink">{title}</Text>;
  return (
    <View className="flex-row items-center -ml-2">
      <Pressable onPress={onBack} hitSlop={12} className="p-1.5 mr-0.5 rounded-lg active:bg-border-soft" accessibilityRole="button">
        <ChevronLeft size={24} color={c.ink} />
      </Pressable>
      <Text className="text-2xl font-bold text-ink flex-shrink" numberOfLines={1}>{title}</Text>
    </View>
  );
}
