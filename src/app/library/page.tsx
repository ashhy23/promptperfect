'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Bookmark, ChevronDown, ChevronUp, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { createSupabaseBrowserClient } from '@/lib/client/supabaseBrowser';
import {
  buildAppUserFromSupabaseUser,
  readEnginePrefs,
} from '@/lib/client/enginePrefsStorage';
import { resolveAuthUserAndSession } from '@/lib/client/ppUserSync';

const REOPTIMIZE_SESSION_KEY = 'pp_reoptimize';
const PREVIEW_LEN = 120;
const PAGE_SIZE = 25;

interface PPUser {
  id: string;
  name: string | null;
  email: string;
  provider: string;
  model: string;
}

interface SavedPromptRow {
  id: string;
  user_id: string;
  title: string;
  original_prompt: string;
  optimized_prompt: string;
  explanation: string;
  mode: string;
  provider: string;
  created_at: string;
}

// ── Timestamp ─────────────────────────────────────────────────────────────────
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const ageMs = Date.now() - d.getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      return formatDistanceToNow(d, { addSuffix: true });
    }
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
  } catch {
    // swallow: invalid ISO string or Intl unavailable — return raw value
    return iso;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function previewText(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= PREVIEW_LEN) return t || '—';
  return `${t.slice(0, PREVIEW_LEN)}…`;
}

function rowMatchesSearch(row: SavedPromptRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const title = (row.title ?? '').toLowerCase();
  const orig  = (row.original_prompt ?? '').toLowerCase();
  const opt   = (row.optimized_prompt ?? '').toLowerCase();
  return title.includes(q) || orig.includes(q) || opt.includes(q);
}

type LibraryModeFilter = 'all' | 'better' | 'specific' | 'cot';

function rowMatchesModeFilter(row: SavedPromptRow, filter: LibraryModeFilter): boolean {
  if (filter === 'all') return true;
  const m = (row.mode ?? '').trim().toLowerCase();
  if (filter === 'better')   return m === 'better';
  if (filter === 'specific') return m === 'specific';
  if (filter === 'cot')      return m === 'cot' || m === 'chain-of-thought' || m === 'chain_of_thought';
  return true;
}

function modeBadgeLabel(mode: string): string {
  const m = mode.trim().toLowerCase();
  if (m === 'cot' || m === 'chain-of-thought' || m === 'chain_of_thought') return 'CoT';
  return mode;
}

// ── Skeleton loading rows ─────────────────────────────────────────────────────
function LibrarySkeleton() {
  return (
    <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Loading saved prompts">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="animate-pulse rounded-xl border border-[#252525] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/5 rounded bg-[#252525]" />
              <div className="h-3 w-4/5 rounded bg-[#1e1e1e]" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="h-5 w-12 rounded bg-[#252525]" />
              <div className="h-3 w-16 rounded bg-[#1e1e1e]" />
              <div className="h-4 w-4 rounded bg-[#1e1e1e]" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function LibraryEmptyState({
  message,
  description,
  children,
}: {
  message: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center rounded-2xl border border-dashed border-[#2a2a2a] bg-gradient-to-b from-white/[0.03] to-transparent px-8 py-20 text-center"
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#252525] bg-[#111]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="#4552FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <p className="font-[family-name:var(--font-space-grotesk),sans-serif] text-[17px] font-semibold text-[#E7E6D9]">
        {message}
      </p>
      {description && (
        <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-[#71717A]">
          {description}
        </p>
      )}
      {children ? (
        <div className="mt-8 flex flex-col items-center gap-3">{children}</div>
      ) : null}
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────
function DeleteConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-[#2a2a2a] bg-[#0e0e0e] p-6 shadow-2xl">
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
          <Trash2 className="h-5 w-5 text-red-400" aria-hidden />
        </div>
        <h2
          id="delete-modal-title"
          className="mt-3 font-[family-name:var(--font-space-grotesk),sans-serif] text-[16px] font-semibold text-[#E7E6D9]"
        >
          Delete saved prompt?
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#71717A]">
          This will permanently remove the prompt from your library. This action cannot be undone.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[10px] border border-[#2a2a2a] bg-[#111] px-4 py-2.5 text-[13px] font-semibold text-[#ECECEC] transition-colors hover:border-[#3a3a3a] hover:bg-[#1a1a1a]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-[10px] border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-[13px] font-semibold text-red-400 transition-colors hover:bg-red-500/25"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LibraryPage() {
  const router = useRouter();
  const [mounted, setMounted]       = useState(false);
  const [authReady, setAuthReady]   = useState(false);
  const [user, setUser]             = useState<PPUser | null>(null);
  const [rows, setRows]             = useState<SavedPromptRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<LibraryModeFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  /** ID pending confirmation before delete; null = no modal open */
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          rowMatchesSearch(row, searchQuery) && rowMatchesModeFilter(row, modeFilter),
      ),
    [rows, searchQuery, modeFilter],
  );

  // Reset visible count whenever filters change so "Load more" starts fresh
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, modeFilter]);

  const visibleRows = filteredRows.slice(0, visibleCount);
  const hasMore     = filteredRows.length > visibleCount;

  const loadSaved = useCallback(async (userId: string) => {
    const client = createSupabaseBrowserClient();
    if (!client) {
      setError('Library is unavailable.');
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await client
        .from('pp_saved_prompts')
        .select(
          'id,user_id,title,original_prompt,optimized_prompt,explanation,mode,provider,created_at',
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (qErr) throw qErr;
      setRows((data as SavedPromptRow[]) ?? []);
    } catch {
      setError('Could not load saved prompts.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteConfirmed = useCallback(async () => {
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    if (!id || !user) return;

    setError(null);
    setRows((r) => r.filter((row) => row.id !== id));
    setExpandedId((prev) => (prev === id ? null : prev));

    const client = createSupabaseBrowserClient();
    if (!client) {
      setError('Library is unavailable.');
      void loadSaved(user.id);
      return;
    }

    const { error: delErr } = await client
      .from('pp_saved_prompts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (delErr) {
      setError('Could not delete prompt.');
      void loadSaved(user.id);
    }
  }, [deleteConfirmId, user, loadSaved]);

  const handleReoptimize = useCallback(
    (row: SavedPromptRow) => {
      try {
        sessionStorage.setItem(
          REOPTIMIZE_SESSION_KEY,
          JSON.stringify({
            text: row.original_prompt,
            mode: row.mode,
            autoOptimize: true,
          }),
        );
      } catch {
        // swallow: quota / private mode blocks draft storage
      }
      router.push('/app');
    },
    [router],
  );

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const client = createSupabaseBrowserClient();
    if (!client) {
      setUser(null);
      setRows([]);
      setLoading(false);
      setAuthReady(true);
      return;
    }
    let cancelled = false;
    void resolveAuthUserAndSession(client).then(({ user }) => {
      if (cancelled) return;
      if (!user?.id) {
        setUser(null);
        setRows([]);
        setLoading(false);
        setAuthReady(true);
        return;
      }
      const u = buildAppUserFromSupabaseUser(user, readEnginePrefs()) as PPUser;
      setUser(u);
      void loadSaved(u.id);
      setAuthReady(true);
    });
    return () => { cancelled = true; };
  }, [mounted, loadSaved]);

  // ── Auth / mount gate ──────────────────────────────────────────────────────
  if (!mounted || !authReady) {
    return (
      <div className="min-h-screen bg-[#050505] px-6 py-8 font-sans">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 h-8 w-32 animate-pulse rounded bg-[#1a1a1a]" />
          <LibrarySkeleton />
        </div>
      </div>
    );
  }

  // ── Unauthenticated ────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] px-6 py-12 font-sans text-[#ECECEC]">
        <div className="mx-auto max-w-md text-center">
          <div className="mb-6">
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 text-sm text-[#888] transition-colors hover:text-[#ECECEC]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to optimizer
            </Link>
          </div>
          <Bookmark className="mx-auto mb-4 h-16 w-16 text-[#4552FF]" strokeWidth={1} aria-hidden />
          <h2 className="mb-2 font-[family-name:var(--font-space-grotesk),sans-serif] text-2xl font-bold text-[#E7E6D9]">
            Your Prompt Library
          </h2>
          <p className="mb-8 text-sm text-[#888]">
            Save and revisit your best optimized prompts. Create a free account to get started.
          </p>
          <LibraryEmptyState
            message="Sign in to view your saved prompts"
            description="Create a free account to save and revisit your best optimized prompts across any device."
          >
            <Link
              href="/signup"
              className="inline-flex h-11 items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,#4552FF,#5c6aff)] px-8 text-[15px] font-semibold text-white transition-opacity hover:opacity-95"
            >
              Sign up free
            </Link>
            <Link
              href="/login"
              className="text-sm text-[#888] transition-colors hover:text-[#ECECEC]"
            >
              Already have an account? Log in
            </Link>
          </LibraryEmptyState>
        </div>
      </div>
    );
  }

  // ── Authenticated ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Delete confirm modal */}
      {deleteConfirmId && (
        <DeleteConfirmModal
          onConfirm={() => void handleDeleteConfirmed()}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      <div className="min-h-screen bg-[#050505] px-6 py-8 font-sans text-[#ECECEC]">
        <header className="mx-auto mb-8 flex max-w-4xl flex-wrap items-center justify-between gap-4 border-b border-[#1a1a1a] pb-4">
          <div className="flex flex-col gap-1">
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 text-sm text-[#888] transition-colors hover:text-[#ECECEC]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to optimizer
            </Link>
            <h1 className="font-[family-name:var(--font-space-grotesk),sans-serif] text-2xl font-bold text-[#E7E6D9]">
              Prompt Library
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className="text-[13px] text-[#888]">{user.name || user.email}</span>
            <span className="text-[12px] text-[#71717A]">{rows.length} saved</span>
          </div>
        </header>

        <main className="mx-auto max-w-4xl">
          {/* Search */}
          <label className="relative mb-4 block">
            <span className="sr-only">Search saved prompts</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717A]"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts…"
              autoComplete="off"
              className="w-full rounded-[12px] border border-[#252525] bg-[#0A0A0A] py-2.5 pl-10 pr-4 text-[14px] text-white outline-none placeholder:text-[#71717A] focus:border-[#4552FF]"
            />
          </label>

          {/* Mode filter pills */}
          <div
            className="mb-4 flex flex-wrap gap-2"
            role="group"
            aria-label="Filter by optimization mode"
          >
            {(
              [
                { id: 'all' as const,      label: 'All' },
                { id: 'better' as const,   label: 'Better' },
                { id: 'specific' as const, label: 'Specific' },
                { id: 'cot' as const,      label: 'CoT' },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setModeFilter(id)}
                aria-pressed={modeFilter === id}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  modeFilter === id
                    ? 'border-[#4552FF] bg-[#4552FF]/20 text-[#ECECEC]'
                    : 'border-[#2a2a2a] bg-[#0A0A0A] text-[#B0B0B0] hover:border-[#4552FF]/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content area */}
          {loading ? (
            <LibrarySkeleton />
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-center text-sm text-red-400">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <LibraryEmptyState
              message="No saved prompts yet"
              description="Optimize a prompt to get started, then hit the bookmark icon to save it here for quick access."
            >
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#4552FF,#5c6aff)] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
              >
                Optimize a prompt to get started
              </Link>
            </LibraryEmptyState>
          ) : filteredRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#71717A]">
              No prompts match your filters.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {visibleRows.map((row) => {
                  const expanded = expandedId === row.id;
                  return (
                    <li
                      key={row.id}
                      className="rounded-xl border border-[#252525] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 transition hover:border-[#3F3F46]"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : row.id)}
                        className="flex w-full items-start justify-between gap-2 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate font-[family-name:var(--font-space-grotesk),sans-serif] text-[15px] font-medium text-[#E7E6D9]">
                            {row.title}
                          </h2>
                          <p className="mt-1 truncate text-[13px] text-[#aaa]">
                            {previewText(row.original_prompt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                              row.mode === 'better'
                                ? 'bg-[#4552FF]/20 text-[#4552FF]'
                                : row.mode === 'specific'
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-orange-500/20 text-orange-400'
                            }`}
                          >
                            {modeBadgeLabel(row.mode)}
                          </span>
                          <time
                            dateTime={row.created_at}
                            className="text-[11px] text-[#71717A]"
                            title={new Date(row.created_at).toLocaleString()}
                          >
                            {formatTimestamp(row.created_at)}
                          </time>
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 text-[#71717A]" aria-hidden />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-[#71717A]" aria-hidden />
                          )}
                        </div>
                      </button>

                      {expanded && (
                        <div className="mt-4 border-t border-[#252525] pt-4">
                          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-[11px] text-[#71717A]">Original</p>
                              <p className="whitespace-pre-wrap text-sm text-[#B0B0B0]">
                                {row.original_prompt || '—'}
                              </p>
                            </div>
                            <div>
                              <p className="mb-1 text-[11px] text-[#71717A]">Optimized</p>
                              <p className="whitespace-pre-wrap text-sm text-[#ECECEC]">
                                {row.optimized_prompt || '—'}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleReoptimize(row)}
                              className="inline-flex items-center gap-1.5 text-sm text-[#4552FF] hover:underline"
                            >
                              <ArrowRight size={14} aria-hidden />
                              Re-optimize
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(row.id)}
                              className="inline-flex items-center gap-1.5 text-sm text-red-400 hover:underline"
                            >
                              <Trash2 size={14} aria-hidden />
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Load more */}
              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    className="rounded-[10px] border border-[#2a2a2a] bg-[#111] px-6 py-2.5 text-[13px] font-semibold text-[#ECECEC] transition-colors hover:border-[#3a3a3a] hover:bg-[#1a1a1a]"
                  >
                    Load more
                    <span className="ml-2 text-[#71717A]">
                      ({filteredRows.length - visibleCount} remaining)
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
