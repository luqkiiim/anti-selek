"use client";

import { RotateCcw } from "lucide-react";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app-page flex min-h-screen items-center justify-center px-6 py-16">
      <section className="app-panel w-full max-w-md p-6 text-center">
        <p className="app-eyebrow">Something went wrong</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          We hit an unexpected error.
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Please try again. If it keeps happening, refresh the page and continue from there.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="app-button-primary mx-auto mt-6 inline-flex items-center gap-2"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </section>
    </main>
  );
}
