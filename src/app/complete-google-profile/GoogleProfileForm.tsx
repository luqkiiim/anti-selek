"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { FlashMessage } from "@/components/ui/chrome";
import { withCallbackUrl } from "@/lib/authCallback";

const subscribeToHydration = () => () => {};

export function GoogleProfileForm({ name, email, callbackUrl, linking }: {
  name: string;
  email: string;
  callbackUrl: string;
  linking: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const disabled = loading || !hydrated;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!linking && !name) {
      setError("Enter your name.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await signIn("google-complete", {
        ...(linking ? { password: data.get("password") } : { name, gender: data.get("gender") }),
        redirect: false,
        redirectTo: callbackUrl,
      });
      if (result?.ok && !result.error) {
        window.location.assign(callbackUrl);
        return;
      }
      setError(linking
        ? "Couldn’t confirm your password. Check it or start Google sign-in again."
        : "Couldn’t finish signup. Go back to sign in and continue with Google again.");
    } catch {
      setError("Couldn’t finish Google sign-in. Try again.");
    }
    setLoading(false);
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="mt-6 space-y-4" aria-busy={loading}>
      <p className="break-all text-sm text-gray-600">{email}</p>
      {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
      {linking ? (
        <>
          <p className="text-sm text-gray-600">Confirm your password once to connect Google to your existing account.</p>
          <label className="block space-y-2 text-sm font-medium">
            <span>Password</span>
            <input className="field" type="password" name="password" autoComplete="current-password" required disabled={disabled} />
          </label>
          <Link className="text-sm font-semibold text-blue-600 hover:underline" href="/forgot-password">
            Forgot password?
          </Link>
        </>
      ) : (
        <>
          <label className="block space-y-2 text-sm font-medium">
            <span>Name</span>
            <input className="field" name="name" autoComplete="name" defaultValue={name} maxLength={100} required disabled={disabled} />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Gender for Mixed pairing</span>
            <select className="field" name="gender" defaultValue="" required disabled={disabled}>
              <option value="" disabled>Choose gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
          </label>
        </>
      )}
      <button type="submit" className="app-button-primary w-full px-4 py-2" disabled={disabled}>
        {loading ? "Continuing…" : linking ? "Connect and sign in" : "Create account"}
      </button>
      <Link className="text-sm font-semibold text-blue-600 hover:underline" href={withCallbackUrl("/signin", callbackUrl)}>
        Back to sign in
      </Link>
    </form>
  );
}
