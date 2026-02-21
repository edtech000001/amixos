import { NextResponse, type NextRequest } from 'next/server';

// Auth is handled client-side via localStorage (supabase-js).
// Middleware just passes requests through — each protected page
// redirects to login if no session is found.
export async function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
