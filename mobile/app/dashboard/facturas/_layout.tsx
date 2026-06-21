import { Stack } from 'expo-router';

/**
 * Per-section stack. Within the dashboard dock, this whole section is ONE tab;
 * inside it the list / detail / form push and pop normally. Because the Tabs
 * navigator keeps each tab mounted, switching docks and coming back lands you
 * exactly where you left off (e.g. on an invoice detail or a half-filled form)
 * instead of resetting to the list. The initial route is `index`.
 */
export default function UfacturasSectionLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
