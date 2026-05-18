import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { mapOAuthCallbackError } from '@/lib/auth/mapOAuthCallbackError';

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/app';
  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;

  const errorCode = searchParams.get('error_code');
  const errorDescription =
    searchParams.get('error_description')?.trim() ||
    searchParams.get('error')?.trim();

  if (errorDescription) {
    const friendly = mapOAuthCallbackError(errorDescription, errorCode);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(friendly)}`,
    );
  }

  const code = searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        'Sign-in did not complete. Please try again.',
      )}`,
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        'Authentication is not configured on the server.',
      )}`,
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // swallow: setAll can fail when called from a Server Component context
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const friendly = mapOAuthCallbackError(error.message, error.code);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(friendly)}`,
    );
  }

  const next = safeNextPath(searchParams.get('next'));
  const dest = new URL(next, origin);
  dest.searchParams.set('auth', 'callback');
  return NextResponse.redirect(dest.toString());
}
