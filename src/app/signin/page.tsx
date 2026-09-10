"use client";

import Image from "next/image";
import { PlayShell } from "@/components/play/PlayShell";
import Link from "next/link";
import { Suspense, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";

import { FlashMessage } from "@/components/ui/chrome";
import {
  getSafeCallbackUrl,
  resolveQuickAccessCallbackUrl,
  withCallbackUrl,
} from "@/lib/authCallback";

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
  const callbackUrl = getSafeCallbackUrl(
    searchParams.get("callbackUrl"),
    ""
  );
  const signupHref = withCallbackUrl("/signup", callbackUrl);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

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

      router.replace(callbackUrl || "/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAccessSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (quickLoading) return;

    setError("");
    setQuickLoading(true);

    try {
      const result = await signIn("credentials", {
        quickAccess: "true",
        clubName,
        playerName,
        redirect: false,
      });

      if (result?.error) {
        setError(
          "We could not find that player in this club. Check the spelling or ask your host to add you."
        );
        return;
      }

      const nextSession = await getSession();
      const quickClubId = nextSession?.user?.quickAccessClubId;
      router.replace(
        await resolveQuickAccessCallbackUrl(callbackUrl, quickClubId)
      );
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setQuickLoading(false);
    }
  };

  const selectAccessMode = (mode: AccessMode) => {
    setAccessMode(mode);
    setError("");
  };

  return (
    <PlayShell header={<span className="brand">Anti-Selek<span>.</span></span>}>
      <div className="play-auth">
          <section>
            <div className="greeting"><div><span className="eyebrow">MORE GOOD GAMES</span><h1>Your next<br/>rally starts here.</h1></div><Image src="/play/spark.png" alt="" width={110} height={110} priority/></div>
            <div
              className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-1"
              role="group"
              aria-label="Access method"
            >
              <button
                type="button"
                aria-pressed={accessMode === "account"}
                onClick={() => selectAccessMode("account")}
                className={`min-h-11 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  accessMode === "account"
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-600 hover:bg-white/70"
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                aria-pressed={accessMode === "quick"}
                onClick={() => selectAccessMode("quick")}
                className={`min-h-11 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  accessMode === "quick"
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-600 hover:bg-white/70"
                }`}
              >
                View-only access
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {registered ? (
                <FlashMessage tone="success">
                  Account created. Please sign in.
                </FlashMessage>
              ) : null}
              {passwordReset ? (
                <FlashMessage tone="success">
                  Password updated. Sign in with your new password.
                </FlashMessage>
              ) : null}
              {error ? (
                <FlashMessage id="signin-error" tone="error">
                  {error}
                </FlashMessage>
              ) : null}
            </div>

            {accessMode === "account" ? (
              <form
                onSubmit={handleSubmit}
                aria-busy={loading}
                className="mt-6 space-y-4"
              >
                <label className="block space-y-2 text-sm font-medium text-gray-900">
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setError("");
                    }}
                    className="field"
                    autoComplete="email"
                    disabled={loading}
                    required
                  />
                </label>

                <label className="block space-y-2 text-sm font-medium text-gray-900">
                  <span>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                    className="field"
                    autoComplete="current-password"
                    disabled={loading}
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

                <button
                  type="submit"
                  disabled={loading}
                  className="app-button-primary w-full"
                >
                  <LogIn aria-hidden="true" size={17} />
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>
            ) : (
              <div className="mt-6 space-y-4">
                <FlashMessage tone="warning">
                  View-only access needs no password and is tied to one club profile. You
                  can follow tournaments and standings, but you cannot join
                  clubs, submit scores, or manage a club.
                </FlashMessage>
                <form
                  onSubmit={handleQuickAccessSubmit}
                  aria-busy={quickLoading}
                  className="space-y-4"
                >
                  <p className="text-sm leading-6 text-gray-600">Use the club and player names your host registered. Ask your host for the spelling if you are unsure. To submit scores or join another club, create an account.</p>
                <label className="block space-y-2 text-sm font-medium text-gray-900">
                    <span>Club name</span>
                    <input
                      type="text"
                      value={clubName}
                      onChange={(event) => {
                        setClubName(event.target.value);
                        setError("");
                      }}
                      className="field"
                      autoComplete="organization"
                      disabled={quickLoading}
                      required
                    />
                  </label>

                  <label className="block space-y-2 text-sm font-medium text-gray-900">
                    <span>Your player name</span>
                    <input
                      type="text"
                      value={playerName}
                      onChange={(event) => {
                        setPlayerName(event.target.value);
                        setError("");
                      }}
                      className="field"
                      autoComplete="name"
                      disabled={quickLoading}
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={
                      quickLoading || !clubName.trim() || !playerName.trim()
                    }
                    className="app-button-primary w-full"
                  >
                    <LogIn aria-hidden="true" size={17} />
                    {quickLoading ? "Entering..." : "Enter club"}
                  </button>
                </form>
              </div>
            )}

            <p className="mt-6 text-sm text-gray-600">
              Don&apos;t have an account?{" "}
              <Link
                href={signupHref}
                className="font-semibold text-blue-600 hover:underline"
              >
                Sign up
              </Link>
            </p>
          </section>

      </div>
    </PlayShell>
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
