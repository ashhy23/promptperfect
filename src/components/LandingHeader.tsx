'use client';

import Link from 'next/link';

export function LandingHeader() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-[#050505]">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-[#ECECEC]">
          PromptPerfect
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          by{' '}
          <a
            href="https://beaglecorp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#4552FF] underline-offset-2 hover:underline"
          >
            Beagle
          </a>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/app"
          className="cursor-pointer rounded-lg bg-[#4552FF] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Try for free
        </Link>
        <Link
          href="/login"
          className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white dark:border-zinc-700 dark:text-zinc-300"
        >
          Log in
        </Link>
      </div>
    </header>
  );
}
