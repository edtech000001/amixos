import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Handle OAuth/verification errors
  if (error) {
    console.error('Auth callback error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(errorDescription ?? error)}`, requestUrl.origin)
    );
  }

  if (code) {
    try {
      const supabase = createSupabaseServerClient();
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('Code exchange error:', exchangeError);
        return NextResponse.redirect(
          new URL('/auth/login?error=verification_failed', requestUrl.origin)
        );
      }

      if (data?.user) {
        // Check if user has a business set up yet
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', data.user.id)
          .limit(1);

        if (!businesses || businesses.length === 0) {
          return NextResponse.redirect(new URL('/onboarding', requestUrl.origin));
        }

        return NextResponse.redirect(new URL('/dashboard', requestUrl.origin));
      }
    } catch (err) {
      console.error('Callback exception:', err);
    }
  }

  // Fallback
  return NextResponse.redirect(new URL('/auth/login', requestUrl.origin));
}
