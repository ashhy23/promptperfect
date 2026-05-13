import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/server/supabase';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: Request) {
  const routeSupabase = await createRouteHandlerClient();
  const {
    data: { user },
    error: authError,
  } = await routeSupabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // swallow: JSON parse error
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const session_id = typeof b.session_id === 'string' ? b.session_id.trim() : '';
  const prompt_original = typeof b.prompt_original === 'string' ? b.prompt_original : '';
  const prompt_optimized = typeof b.prompt_optimized === 'string' ? b.prompt_optimized : '';
  const mode = typeof b.mode === 'string' ? b.mode : 'better';
  const explanation = typeof b.explanation === 'string' ? b.explanation : '';
  const provider = typeof b.provider === 'string' ? b.provider : null;
  const optimize_session_id = typeof b.optimize_session_id === 'string' ? b.optimize_session_id : null;
  const user_id = user.id;

  if (!session_id || !prompt_original || !prompt_optimized) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Ensure app users row exists before writing user_id FK (upsert if needed)
  const { data: existingUser } = await admin
    .from('pp_users')
    .select('id')
    .eq('id', user_id)
    .maybeSingle();

  if (!existingUser) {
    const { data: authUser } = await admin.auth.admin.getUserById(user_id);
    if (authUser?.user) {
      await admin.from('pp_users').upsert(
        {
          id: user_id,
          email: authUser.user.email ?? '',
          password_hash: 'supabase_auth',
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          api_key: '',
        },
        { onConflict: 'id' },
      );
    }
  }

  const row: Record<string, unknown> = {
    session_id,
    prompt_original,
    prompt_optimized,
    mode,
    explanation,
    user_id,
  };
  if (provider) row.provider = provider;
  if (optimize_session_id) row.optimize_session_id = optimize_session_id;

  function isMissingColumnError(msg: string): boolean {
    return /optimize_session_id|provider|schema cache|could not find|column.*does not exist|PGRST204/i.test(msg);
  }

  let lastError: { message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin
      .from('pp_optimization_history')
      .insert(row)
      .select('id')
      .single();

    if (!error && data?.id) return NextResponse.json({ id: data.id });

    lastError = error ?? { message: 'Insert returned no id' };
    if (!isMissingColumnError(lastError.message)) break;
    if ('optimize_session_id' in row) { delete row.optimize_session_id; continue; }
    if ('provider' in row) { delete row.provider; continue; }
    break;
  }

  return NextResponse.json({ error: lastError?.message ?? 'Insert failed' }, { status: 500 });
}
