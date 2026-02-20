import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if user has completed onboarding (has a business)
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', data.user.id)
        .limit(1);

      if (!businesses || businesses.length === 0) {
        return NextResponse.redirect(new URL('/onboarding', requestUrl.origin));
      }

      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL('/auth/login?error=auth_failed', requestUrl.origin));
}
