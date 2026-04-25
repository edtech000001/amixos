import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_STORAGE_KEY, type Locale } from '@amixos/shared';

// Read the user's preferred locale on the server.
// Order of preference:
//   1. Cookie (set by client when user toggles)
//   2. Accept-Language header (best-effort)
//   3. DEFAULT_LOCALE
export function getServerLocale(): Locale {
  const cookieValue = cookies().get(LOCALE_STORAGE_KEY)?.value;
  if (isLocale(cookieValue)) return cookieValue;

  const acceptLanguage = headers().get('accept-language');
  if (acceptLanguage) {
    const primary = acceptLanguage.split(',')[0]?.split('-')[0]?.trim().toLowerCase();
    if (isLocale(primary)) return primary;
  }

  return DEFAULT_LOCALE;
}
