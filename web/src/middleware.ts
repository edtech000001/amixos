import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/', '/auth/login', '/auth/register', '/auth/callback', '/auth/forgot-password'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // If Supabase env vars aren't set, just pass through — don't crash
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith('/auth/'));

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    // Not logged in + protected route → redirect to login
    if (!user && !isPublic) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    // Logged in + auth pages → redirect to dashboard
    if (user && pathname.startsWith('/auth/') && pathname !== '/auth/callback') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  } catch {
    // If auth check fails for any reason, don't block the user — just pass through
    return NextResponse.next();
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
