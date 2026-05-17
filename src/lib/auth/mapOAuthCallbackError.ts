/**
 * User-facing messages for OAuth / auth callback failures.
 * Supabase often returns technical strings (e.g. profile fetch from Google).
 */
export function mapOAuthCallbackError(
  raw: string,
  code?: string | null,
): string {
  const msg = raw.trim();
  const lower = msg.toLowerCase();
  const c = (code ?? '').toLowerCase();

  if (
    c === 'bad_oauth_callback' ||
    lower.includes('user profile from external provider') ||
    lower.includes('error getting user profile')
  ) {
    return (
      'Google sign-in could not read your profile. In Google Cloud Console, verify the OAuth client ' +
      '(Web application) Client ID and Secret match Supabase → Authentication → Google. Enable the ' +
      'OAuth consent screen, add your email as a test user if the app is in Testing mode, and set ' +
      'Authorized redirect URI to: https://<your-project-ref>.supabase.co/auth/v1/callback'
    );
  }

  if (lower.includes('email') && lower.includes('already')) {
    return (
      'An account with this email already exists. Sign in with your password instead, or use the same ' +
      'Google account after linking in Supabase Auth settings.'
    );
  }

  if (c === 'bad_oauth_state' || lower.includes('oauth state')) {
    return 'Sign-in expired or was interrupted. Clear cookies for this site and try Google again.';
  }

  if (lower.includes('access_denied') || lower.includes('cancelled')) {
    return 'Google sign-in was cancelled. Try again when you are ready.';
  }

  if (lower.includes('redirect') && lower.includes('url')) {
    return (
      'Redirect URL mismatch. Add this app URL to Supabase → Authentication → URL Configuration ' +
      '(Redirect URLs), e.g. http://localhost:3000/auth/callback and your production /auth/callback.'
    );
  }

  return msg || 'Sign-in failed. Please try again.';
}
