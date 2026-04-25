import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LangProvider } from '@/lib/i18n/LangProvider';

export default function RootLayout() {
  return (
    <LangProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </LangProvider>
  );
}
