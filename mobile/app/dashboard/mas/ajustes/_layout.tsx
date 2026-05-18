import { Stack } from 'expo-router';

/**
 * Stack layout for the Ajustes section. Within the dashboard tabs, ajustes
 * is treated as a single destination — but inside it we want proper push/back
 * navigation between the list and each section. This Stack handles that.
 */
export default function AjustesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
