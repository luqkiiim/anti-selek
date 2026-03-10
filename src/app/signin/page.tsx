"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

import { FlashMessage } from "@/components/ui/chrome";

function SigninForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-page flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="app-panel relative overflow-hidden px-6 py-8 sm:px-8">
            <div className="pointer-events-none absolute inset-y-0 right-[-6rem] top-[-2rem] w-56 rounded-full bg-[radial-gradient(circle,_rgba(22,119,242,0.16),_transparent_65%)] blur-2xl" />
            <div className="relative">
              <p className="app-eyebrow">Court control</p>
              <h1 className="mt-3 app-title text-gray-900">Sign in to your badminton dashboard.</h1>
              <p className="mt-4 max-w-xl text-sm text-gray-600 sm:text-base">
                Jump back into community leaderboards, active courts, and tournament management without losing your place.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="app-panel-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Quick return</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">Resume active sessions in a couple of taps.</p>
                </div>
                <div className="app-panel-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Clear standings</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">Check points, ELO, and match history from one place.</p>
                </div>
                <div className="app-panel-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Mobile ready</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">Comfortable controls for court-side use.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="app-panel px-6 py-8 sm:px-8">
            <p className="app-eyebrow">Account access</p>
            <h2 className="mt-3 text-2xl font-semibold text-gray-900">Welcome back</h2>
            <p className="mt-2 text-sm text-gray-600">Continue with the email and password tied to your player account.</p>

            <div className="mt-6 space-y-4">
              {registered ? <FlashMessage tone="success">Account created. Please sign in.</FlashMessage> : null}
              {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field"
                  required
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field"
                  required
                />
              </label>

              <button type="submit" disabled={loading} className="app-button-primary w-full">
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <p className="mt-6 text-sm text-gray-600">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-semibold text-blue-600 hover:underline">
                Sign up
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function SigninPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page flex items-center justify-center px-6">
          <div className="app-panel px-8 py-8">
            <p className="app-eyebrow">Loading sign in</p>
          </div>
        </div>
      }
    >
      <SigninForm />
    </Suspense>
  );
}
