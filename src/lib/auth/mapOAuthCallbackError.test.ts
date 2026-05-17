import { describe, it, expect } from 'vitest';
import { mapOAuthCallbackError } from './mapOAuthCallbackError';

describe('mapOAuthCallbackError', () => {
  it('maps Google profile fetch failures', () => {
    const msg = mapOAuthCallbackError(
      'Error getting user profile from external provider',
      'bad_oauth_callback',
    );
    expect(msg).toMatch(/Google Cloud Console/i);
    expect(msg).toMatch(/supabase\.co\/auth\/v1\/callback/i);
  });

  it('passes through unknown messages', () => {
    expect(mapOAuthCallbackError('Custom failure')).toBe('Custom failure');
  });
});
