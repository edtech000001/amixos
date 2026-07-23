// Polyfill crypto.getRandomValues FIRST (before anything that generates
// tokens) so secureShareToken() uses a cryptographic RNG on RN/Hermes instead
// of its Math.random fallback. Must precede all other imports.
import 'react-native-get-random-values';
import '../global.css';
import { LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { cssInterop } from 'nativewind';
import * as SplashScreen from 'expo-splash-screen';
import { LangProvider } from '@/lib/i18n/LangProvider';
import { ThemeProvider, useTheme } from '@/lib/ThemeProvider';
import { useProtectedRoute } from '@/lib/auth/gate';
// Importing the auth store at module load wires up the single
// onAuthStateChange listener and the safety timeout.
import '@/lib/auth/store';

// SafeAreaView from react-native-safe-area-context is a third-party component,
// so NativeWind v4 does NOT auto-apply `className` to it. Screens using
// `<SafeAreaView className="flex-1">` had the class silently dropped, collapsing
// the root and leaving the body blank (forms, detail, and Más screens). Register
// it once here so className → style works app-wide.
cssInterop(SafeAreaView, { className: 'style' });

// expo-router calls SplashScreen._internal_preventAutoHideAsync() at startup.
// The native call throws "No native splash screen registered" because the
// dev client doesn't always have one wired — harmless functionally, but
// shows up as an unhandled-rejection warning in dev. Two-pronged swallow:
//   1. Wrap the public internal so OUR code path catches it.
//   2. Tell React Native's LogBox to ignore the warning by message, since
//      the rejection bubbles up from inside the expo-splash-screen module
//      via a code path our wrap can't reach.
LogBox.ignoreLogs([
  // NativeWind's CssInterop "upgrade warning": fires on any conditional
  // className that adds style features after first render — harmless (the
  // component just remounts) and dev-only, but dozens of copies bury real
  // warnings.
  /CssInterop upgrade warning/,
  /The previous warning was caused by a component/,
  // Plain text form (when the throw is caught + logged directly).
  'No native splash screen registered',
  // Rejection-envelope form. RegExp scoped to this specific cause so we
  // don't accidentally silence ALL unhandled rejections (which would hide
  // real bugs).
  /Possible unhandled promise rejection.*No native splash screen/,
]);

const _orig = (SplashScreen as { _internal_preventAutoHideAsync?: () => Promise<unknown> })._internal_preventAutoHideAsync;
if (_orig) {
  (SplashScreen as unknown as { _internal_preventAutoHideAsync: () => Promise<unknown> })._internal_preventAutoHideAsync = async () => {
    try {
      return await _orig();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('No native splash screen')) return;
      throw e;
    }
  };
}

// Sub-component so useProtectedRoute can access expo-router's segments + router
// (those hooks must be called inside the router tree).
function AuthAwareApp() {
  useProtectedRoute();
  return <Stack screenOptions={{ headerShown: false }} />;
}

// Status-bar icons follow the theme: dark glyphs on the light bg, light glyphs
// on the dark bg. Must live inside ThemeProvider to read the resolved theme.
function ThemedStatusBar() {
  const { resolved } = useTheme();
  return <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <LangProvider>
            <ThemedStatusBar />
            <AuthAwareApp />
          </LangProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
