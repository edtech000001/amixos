import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session token if needed — keeps cookies fresh.
  // Dashboard auth redirects stay client-side (AppContext).
  const { data: { user } } = await supabase.auth.getUser();

  // Already signed in → the landing / login / register pages skip straight
  // into the app. Without this a new tab on amixos.com showed the marketing
  // page and "Log in" showed the form, so a signed-in user looked signed out.
  const { pathname, searchParams } = request.nextUrl;
  if (user && (pathname === '/' || pathname === '/auth/login' || pathname === '/auth/register')) {
    // Honor ?next= (invite links), same-origin only — "//host" is not a path.
    const next = searchParams.get('next');
    const url = request.nextUrl.clone();
    url.search = '';
    url.pathname = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
    const redirect = NextResponse.redirect(url);
    // Carry over any refreshed session cookies from getUser().
    supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
