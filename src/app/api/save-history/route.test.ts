import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const { mockGetUser, mockFrom, mockInsert, mockCreateClient } = vi.hoisted(
  () => {
    const mockInsert = vi.fn();
    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 'hist-1' }, error: null });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsertChain = vi.fn().mockReturnValue({ select: mockSelect });
    const mockMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 'user-123' }, error: null });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelectUser = vi.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = vi.fn((table: string) => {
      if (table === 'pp_users') {
        return { select: mockSelectUser };
      }
      if (table === 'pp_optimization_history') {
        return { insert: mockInsertChain };
      }
      return {};
    });
    return {
      mockGetUser: vi.fn(),
      mockFrom,
      mockInsert,
      mockCreateClient: vi.fn(),
    };
  },
);

vi.mock('@/lib/server/supabase', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/save-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/save-history POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockCreateClient.mockReturnValue({ from: mockFrom });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'not authenticated' },
    });
    const res = await POST(
      makeRequest({
        session_id: 's1',
        prompt_original: 'a',
        prompt_optimized: 'b',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing required fields/i);
  });

  it('returns 200 on valid POST with all fields', async () => {
    const res = await POST(
      makeRequest({
        session_id: 'session-abc',
        prompt_original: 'Write a blog post about AI',
        prompt_optimized: 'Here is an optimized prompt...',
        mode: 'better',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('hist-1');
  });
});
