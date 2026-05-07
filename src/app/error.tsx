'use client'

import Link from 'next/link'
import { useEffect } from 'react'

// TODO: replace console.error with a structured logger hook (e.g. useLogger)
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-xl font-semibold text-[#ECECEC]">Something went wrong.</h2>
      <p className="text-sm text-[#71717A]">
        Try again, or head back to the home page. If it keeps happening, ping us in Discord.
      </p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-[10px] bg-[linear-gradient(135deg,#4552FF,#5c6aff)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-[10px] border border-[#2a2a2a] bg-[#111] px-4 py-2 text-sm font-semibold text-[#ECECEC] transition-colors hover:border-[#3a3a3a] hover:bg-[#1a1a1a]"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
