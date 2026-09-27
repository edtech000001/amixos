// Keeping the user's language on their Supabase profile, not just on the device.
//
// Auth emails are rendered by Supabase from `{{ .Data.locale }}` — the `locale`
// key inside raw_user_meta_data. The email/password register routes write it at
// signup, but nothing else ever did:
//
//   • OAuth sign-ups (signInWithOAuth) send no options.data at all, so a Google
//     or Apple user had NO locale and every auth email fell back to Spanish —
//     permanently, with no way for them to change it.
//   • The in-app language switcher wrote only a cookie / AsyncStorage, so
//     switching to English fixed the UI and left the emails in Spanish.
//
// Both are fixed by calling syncUserLocale() — at the OAuth callback, and
// whenever the switcher changes language.

type MinimalAuthClient = {
  auth: {
    getUser: () => Promise<{ data: { user: { user_metadata?: Record<string, unknown> } | null } }>;
    updateUser: (attrs: { data: Record<string, unknown> }) => Promise<{ error: unknown }>;
  };
};

/**
 * Writes `locale` into the signed-in user's metadata when it differs from
 * what's stored. No-ops when signed out.
 *
 * Best effort by design: a language preference is not worth failing a sign-in
 * or a settings toggle over, so every failure is swallowed. The caller never
 * needs to await it.
 */
export async function syncUserLocale(
  supabase: MinimalAuthClient,
  locale: string,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const meta = user.user_metadata ?? {};
    if (meta.locale === locale) return;

    // Spread the existing metadata rather than sending `{ locale }` alone.
    // GoTrue merges here, but spreading is correct under either behaviour and
    // costs nothing — and silently dropping first_name would break the
    // greeting in every template.
    await supabase.auth.updateUser({ data: { ...meta, locale } });
  } catch {
    // Swallowed on purpose — see the docblock.
  }
}
