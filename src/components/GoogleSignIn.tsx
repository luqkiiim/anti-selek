"use client";

import { createContext, useContext, useState, type FormEvent } from "react";
import Image from "next/image";
import { FlashMessage } from "@/components/ui/chrome";

export const GoogleSignInContext = createContext(false);

async function startGoogle(input: { mode: "sign-in"; callbackUrl: string } | { mode: "connect"; password: string }) {
  const response = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.url !== "string") {
    throw new Error(typeof result?.error === "string" ? result.error : "Could not start Google sign-in. Try again.");
  }
  window.location.assign(result.url);
}

export function GoogleSignInButton({ callbackUrl, disabled }: { callbackUrl: string; disabled?: boolean }) {
  const available = useContext(GoogleSignInContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (!available) return null;

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      await startGoogle({ mode: "sign-in", callbackUrl });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not start Google sign-in. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        aria-busy={loading}
        className="flex min-h-10 w-full items-center justify-center gap-2.5 rounded-full border border-[#747775] bg-white px-3 py-2 text-sm font-medium text-[#1f1f1f] hover:bg-gray-50 disabled:opacity-60"
        style={{ fontFamily: '"Google Sans", Arial, sans-serif' }}
      >
        <Image src="/brands/google-g.png" alt="" width={20} height={20} className="h-auto w-5" />
        {loading ? "Opening Google…" : "Continue with Google"}
      </button>
      {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
    </div>
  );
}

export function GoogleConnection({ connected }: { connected: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("google") === "failed"
      ? "Could not connect Google. Use the Google account with the same email as your Anti Selek account."
      : ""
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setLoading(true);
    setError("");
    try {
      await startGoogle({ mode: "connect", password });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not connect Google. Try again.");
      setLoading(false);
    }
  }

  if (connected) return <p className="text-sm font-semibold text-gray-900">Google connected</p>;

  return (
    <div className="space-y-3">
      {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
      {showPassword ? (
        <form method="post" onSubmit={handleSubmit} className="space-y-3" aria-busy={loading}>
          <label className="block space-y-2 text-sm font-medium">
            <span>Confirm your Anti Selek password</span>
            <input className="field" type="password" name="password" autoComplete="current-password" required disabled={loading} />
          </label>
          <button type="submit" className="app-button-primary px-4 py-2" disabled={loading}>
            {loading ? "Opening Google…" : "Continue"}
          </button>
          <button type="button" className="app-button-secondary ml-2 px-4 py-2" onClick={() => setShowPassword(false)} disabled={loading}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="app-button-secondary px-4 py-2" onClick={() => setShowPassword(true)}>
          Connect Google
        </button>
      )}
    </div>
  );
}
