import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
  FileText,
  Briefcase,
  BarChart3,
  Sparkles,
  Rocket,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import type { SplashSlide } from '@amixos/shared';

const ICONS: Record<SplashSlide['key'], LucideIcon> = {
  welcome: Sparkles,
  clients: Users,
  invoices: FileText,
  employees: Briefcase,
  reports: BarChart3,
  more: Rocket,
};

const AUTO_ADVANCE_MS = 3500;
const INTERACTION_PAUSE_MS = 5000;

export default function SplashScreen() {
  const router = useRouter();
  const { t } = useLang();
  const s = t.splash;
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<SplashSlide>>(null);
  const lastInteractionRef = useRef<number>(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastInteractionRef.current < INTERACTION_PAUSE_MS) return;
      setIndex(prev => {
        if (prev >= s.slides.length - 1) return prev;
        const next = prev + 1;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [s.slides.length]);

  const onScrollBeginDrag = () => {
    lastInteractionRef.current = Date.now();
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  };

  const renderItem = ({ item }: ListRenderItemInfo<SplashSlide>) => {
    const Icon = ICONS[item.key];
    return (
      <View style={{ width }} className="px-8 items-center justify-center">
        <View className="w-24 h-24 rounded-3xl bg-primary/10 items-center justify-center mb-8">
          <Icon color="#4F46E5" size={48} strokeWidth={1.75} />
        </View>
        <Text className="text-2xl font-extrabold text-gray-900 text-center mb-3 tracking-tight">
          {item.title}
        </Text>
        <Text className="text-base text-gray-500 text-center leading-6 px-2">
          {item.subtitle}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="items-center pt-4 pb-2">
        <View
          className="w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center mb-3"
          style={{
            shadowColor: '#4F46E5',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 4,
          }}
        >
          <Text className="text-3xl font-extrabold text-primary">a</Text>
        </View>
        <Text className="text-xl font-extrabold text-gray-900 tracking-tight">
          Amixos
        </Text>
      </View>

      <View className="flex-1">
        <FlatList
          ref={listRef}
          data={s.slides}
          keyExtractor={item => item.key}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={onScrollBeginDrag}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
        />
      </View>

      <View className="px-6 pb-2">
        <View className="flex-row justify-center items-center mb-7" style={{ gap: 6 }}>
          {s.slides.map((_, i) => (
            <View
              key={i}
              className={`h-2 rounded-full ${
                i === index ? 'w-6 bg-primary' : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </View>

        <View style={{ gap: 12 }}>
          <Pressable
            onPress={() => router.push('/auth/register')}
            className="bg-primary rounded-2xl py-4 items-center active:opacity-80"
          >
            <Text className="text-white font-semibold text-base">
              {s.register}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/auth/login')}
            className="bg-white border border-gray-200 rounded-2xl py-4 items-center active:bg-gray-50"
          >
            <Text className="text-gray-900 font-semibold text-base">
              {s.login}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
