"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";

import { FlashMessage } from "@/components/ui/chrome";

type AccessMode = "account" | "quick";

function SigninForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clubName, setClubName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [accessMode, setAccessMode] = useState<AccessMode>("account");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const passwordReset = searchParams.get("passwordReset");

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

  const handleQuickAccessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setQuickLoading(true);

    try {
      const result = await signIn("credentials", {
        quickAccess: "true",
        clubName: clubName,
        playerName,
        redirect: false,
      });

      if (result?.error) {
        setError("No matching club profile found");
        return;
      }

      const nextSession = await getSession();
      const quickClubId = nextSession?.user?.quickAccessClubId;
      router.push(quickClubId ? `/club/${quickClubId}` : "/");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setQuickLoading(false);
    }
  };

  return (
    <main className="app-page flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="app-panel relative overflow-hidden px-6 py-8 sm:px-8">
            <div className="relative">
              <p className="app-eyebrow">Court control</p>
              <h1 className="mt-3 app-title text-gray-900">Sign in to your badminton dashboard.</h1>
              <p className="mt-4 max-w-xl text-sm text-gray-600 sm:text-base">
                Jump back into club leaderboards, active courts, and tournament management without losing your place.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="app-panel-muted p-4">
                  <p className="text-xs font-semibold text-gray-500">Quick return</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">Resume active sessions in a couple of taps.</p>
                </div>
                <div className="app-panel-muted p-4">
                  <p className="text-xs font-semibold text-gray-500">Clear standings</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">Points, ratings, history.</p>
                </div>
                <div className="app-panel-muted p-4">
                  <p className="text-xs font-semibold text-gray-500">Mobile ready</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">Comfortable controls for court-side use.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="app-panel px-6 py-8 sm:px-8">
            <p className="app-eyebrow">Account access</p>
            <h2 className="mt-3 text-2xl font-semibold text-gray-900">Welcome back</h2>
            <p className="mt-2 text-sm text-gray-600">
              Continue with your account or enter a club profile your host already added.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => {
                  setAccessMode("account");
                  setError("");
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  accessMode === "account"
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-600 hover:bg-white/70"
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccessMode("quick");
                  setError("");
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  accessMode === "quick"
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-600 hover:bg-white/70"
                }`}
              >
                Quick access
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {registered ? <FlashMessage tone="success">Account created. Please sign in.</FlashMessage> : null}
              {passwordReset ? (
                <FlashMessage tone="success">
                  Password updated. Sign in with your new password.
                </FlashMessage>
              ) : null}
              {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
            </div>

            {accessMode === "account" ? (
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

                <div className="flex justify-end">
                  <Link
                    href="/forgot-password"
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

                <button type="submit" disabled={loading} className="app-button-primary w-full">
                  <LogIn aria-hidden="true" size={17} />
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleQuickAccessSubmit} className="mt-6 space-y-4">
                <label className="block space-y-2 text-sm font-medium text-gray-900">
                  <span>Club name</span>
                  <input
                    type="text"
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    className="field"
                    required
                  />
                </label>

                <label className="block space-y-2 text-sm font-medium text-gray-900">
                  <span>Your player name</span>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="field"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={quickLoading || !clubName.trim() || !playerName.trim()}
                  className="app-button-primary w-full"
                >
                  <LogIn aria-hidden="true" size={17} />
                  {quickLoading ? "Entering..." : "Enter club"}
                </button>
              </form>
            )}

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
