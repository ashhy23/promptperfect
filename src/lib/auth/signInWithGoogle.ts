import type { AuthError } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOAuthCallbackUrl } from '@/lib/auth/oauthRedirect';

/**
 * Google OAuth for login/signup. Uses `skipBrowserRedirect` + explicit
 * `window.location.assign` so navigation always runs (some Supabase SSR +
 * PKCE setups do not trigger the library’s internal redirect reliably).
 */
export async function signInWithGoogle(client: SupabaseClient): Promise<{
  error: AuthError | Error | null;
}> {
  try {
    const redirectTo = getOAuthCallbackUrl();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'online',
          prompt: 'select_account',
        },
      },
    });

    if (error) return { error };

    const url = data?.url;
    if (!url) {
      return {
        error: new Error(
          'Google sign-in did not return a redirect URL. In Supabase: Authentication → Google — enable the provider, paste Client ID/Secret from Google Cloud, and add your app callback to Redirect URLs (e.g. /auth/callback).',
        ),
      };
    }

    if (typeof window !== 'undefined') {
      window.location.assign(url);
    }

    return { error: null };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e
          : new Error('Google sign-in failed. Please try again.'),
    };
  }
}
