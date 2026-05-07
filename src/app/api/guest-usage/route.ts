import { NextResponse } from 'next/server'
import { GUEST_LIMIT } from '@/lib/guest'
import { getSupabaseClient } from '@/lib/supabase'

export async function POST(request: Request) {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    )
  }

  let body: { guestId?: string; mode?: string; provider?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { guestId, mode, provider } = body;

  if (!guestId) {
    return NextResponse.json({ error: 'Guest ID required' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('guest_usage')
    .select('optimization_count')
    .eq('guest_id', guestId)
    .single()

  const currentCount = existing?.optimization_count ?? 0

  if (currentCount >= GUEST_LIMIT) {
    return NextResponse.json(
      {
        error: 'Guest limit reached. Sign up for unlimited access.',
        limitReached: true,
        count: currentCount,
        limit: GUEST_LIMIT,
      },
      { status: 429 }
    )
  }

  const { error: upsertError } = await supabase
    .from('guest_usage')
    .upsert(
      {
        guest_id: guestId,
        optimization_count: currentCount + 1,
        last_used_at: new Date().toISOString(),
        last_mode: mode ?? null,
        last_provider: provider ?? null,
      },
      { onConflict: 'guest_id' }
    )

  if (upsertError) {
    return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 })
  }

  return NextResponse.json({
    count: currentCount + 1,
    limit: GUEST_LIMIT,
    remaining: GUEST_LIMIT - 1 - currentCount,
  })
}

export async function GET(request: Request) {
  const supabase = getSupabaseClient()
  const { searchParams } = new URL(request.url)
  const guestId = searchParams.get('guestId')

  if (!guestId) {
    return NextResponse.json({ count: 0, limit: GUEST_LIMIT, remaining: GUEST_LIMIT })
  }

  if (!supabase) {
    // Signal to client that server tracking is unavailable — don't overwrite local count.
    return NextResponse.json({ count: 0, limit: GUEST_LIMIT, remaining: GUEST_LIMIT, serverTracking: false })
  }

  const { data } = await supabase
    .from('guest_usage')
    .select('optimization_count')
    .eq('guest_id', guestId)
    .single()

  const count = data?.optimization_count ?? 0

  return NextResponse.json({
    count,
    limit: GUEST_LIMIT,
    remaining: Math.max(0, GUEST_LIMIT - count),
  })
}
