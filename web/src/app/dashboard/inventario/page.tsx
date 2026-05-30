'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Inventory moved under the module store — canonical URL is now
// /dashboard/modulos/inventory. Keep this route as a redirect so old
// bookmarks and any external links still resolve.
export default function InventarioLegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/modulos/inventory');
  }, [router]);
  return null;
}
