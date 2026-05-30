import { useEffect } from 'react';
import { useRouter } from 'expo-router';

// Inventory moved under the module store — canonical route is now
// /dashboard/mas/modulos/inventory. Keep this route as a redirect so any
// existing in-app links resolve.
export default function InventarioLegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/mas/modulos/inventory');
  }, [router]);
  return null;
}
