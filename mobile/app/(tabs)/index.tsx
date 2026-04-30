import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
  FileText,
  Briefcase,
  BarChart3,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';

const ICONS: Record<string, LucideIcon> = {
  clients: Users,
  invoices: FileText,
  employees: Briefcase,
  reports: BarChart3,
};

export default function SplashScreen() {
  const router = useRouter();
  const { t } = useLang();
  const s = t.splash;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-1 px-6 pt-6 pb-6 justify-between">
        <View className="items-center">
          <View className="w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center mb-4">
            <Text className="text-3xl font-extrabold text-primary">a</Text>
          </View>
          <Text className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Amixos
          </Text>
          <Text className="text-lg text-gray-700 mt-1.5 font-semibold">
            {s.tagline}
          </Text>
          <Text className="text-sm text-gray-500 mt-2 text-center px-2">
            {s.hook}
          </Text>
        </View>

        <View className="flex-row flex-wrap justify-between">
          {s.features.map(f => {
            const Icon = ICONS[f.key];
            return (
              <View
                key={f.key}
                className="w-[48%] bg-gray-50 rounded-2xl py-5 px-4 mb-3 border border-gray-100 items-center"
              >
                <View className="w-12 h-12 rounded-xl bg-primary/10 items-center justify-center mb-2">
                  {Icon ? <Icon color="#4F46E5" size={24} /> : null}
                </View>
                <Text className="text-base font-semibold text-gray-900">
                  {f.title}
                </Text>
              </View>
            );
          })}
        </View>

        <View className="gap-3">
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
