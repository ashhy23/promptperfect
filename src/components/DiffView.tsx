"use client";

import { useMemo } from "react";

export interface DiffViewProps {
  original: string;
  optimized: string;
}

// ── Tokeniser ─────────────────────────────────────────────────────────────────
// Splits text into alternating word / whitespace tokens so every character is
// preserved and whitespace renders correctly with white-space: pre-wrap.
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

// ── LCS diff ──────────────────────────────────────────────────────────────────
type Op = { type: "equal" | "insert" | "delete"; value: string };

function computeDiff(a: string[], b: string[]): Op[] {
  const m = a.length;
  const n = b.length;

  // Safety cap — fall back to full replace for very large inputs
  if (m * n > 120_000) {
    return [
      ...a.map((v) => ({ type: "delete" as const, value: v })),
      ...b.map((v) => ({ type: "insert" as const, value: v })),
    ];
  }

  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ops: Op[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ type: "equal", value: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: "insert", value: b[j - 1] });
      j--;
    } else {
      ops.unshift({ type: "delete", value: a[i - 1] });
      i--;
    }
  }
  return ops;
}

// ── Main component ─────────────────────────────────────────────────────────────
export function DiffView({ original, optimized }: DiffViewProps) {
  const { ops, removedCount, addedCount } = useMemo(() => {
    const tokA = tokenize(original);
    const tokB = tokenize(optimized);
    const ops = computeDiff(tokA, tokB);
    const removedCount = ops.filter(
      (o) => o.type === "delete" && o.value.trim().length > 0,
    ).length;
    const addedCount = ops.filter(
      (o) => o.type === "insert" && o.value.trim().length > 0,
    ).length;
    return { ops, removedCount, addedCount };
  }, [original, optimized]);

  // Before pane: equal + delete tokens
  const beforeOps = ops.filter((o) => o.type !== "insert");
  // After pane: equal + insert tokens
  const afterOps = ops.filter((o) => o.type !== "delete");

  return (
    <div className="overflow-hidden rounded-xl border border-[#1e1e1e] bg-[#080808]">
      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-[#161616] bg-[#0a0a0a] px-5 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#444]">
          Word diff
        </span>
        <div className="mx-1 h-3 w-px bg-[#222]" />
        <span className="flex items-center gap-1 rounded-md bg-rose-950/50 px-2 py-0.5 text-[11.5px] font-medium text-rose-400 ring-1 ring-inset ring-rose-900/40">
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="shrink-0">
            <path d="M1.5 4.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          {removedCount} removed
        </span>
        <span className="flex items-center gap-1 rounded-md bg-[#4552FF]/10 px-2 py-0.5 text-[11.5px] font-medium text-[#7C86FF] ring-1 ring-inset ring-[#4552FF]/20">
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="shrink-0">
            <path d="M4.5 1.5v6M1.5 4.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          {addedCount} added
        </span>
      </div>

      {/* ── Split panes ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 divide-x divide-[#161616]">
        {/* Before */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-[#161616] bg-[#0c0c0c] px-4 py-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500/70" />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-rose-500/70">
              Original
            </span>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-5 text-[13.5px] leading-[1.75] text-[#999] [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin] whitespace-pre-wrap break-words">
          {beforeOps.map((tok, i) =>
            tok.type === "delete" ? (
              <mark
                key={`d-${i}`}
                className="rounded-[3px] bg-rose-950/70 px-[1px] text-rose-400 line-through decoration-rose-700/60 [text-decoration-thickness:1px]"
              >
                {tok.value}
              </mark>
            ) : (
              <span key={`e-${i}`}>{tok.value}</span>
            ),
          )}
          </div>
        </div>

        {/* After */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-[#161616] bg-[#0c0c0c] px-4 py-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4552FF]/80" />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#4552FF]/80">
              Optimized
            </span>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-5 text-[13.5px] leading-[1.75] text-[#999] [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin] whitespace-pre-wrap break-words">
          {afterOps.map((tok, i) =>
            tok.type === "insert" ? (
              <mark
                key={`i-${i}`}
                className="rounded-[3px] bg-[#4552FF]/[0.12] px-[1px] text-[#818cf8]"
              >
                {tok.value}
              </mark>
            ) : (
              <span key={`e-${i}`}>{tok.value}</span>
            ),
          )}
          </div>
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-t border-[#161616] bg-[#0a0a0a] px-5 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] text-[#444]">
          <mark className="rounded-[3px] bg-rose-950/70 px-1 text-rose-400 line-through decoration-rose-700/60 [text-decoration-thickness:1px] no-underline">
            word
          </mark>
          removed
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-[#444]">
          <mark className="rounded-[3px] bg-[#4552FF]/[0.12] px-1 text-[#818cf8]">
            word
          </mark>
          added
        </span>
      </div>
    </div>
  );
}
