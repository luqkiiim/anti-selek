"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { getSession, signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

import { FlashMessage } from "@/components/ui/chrome";
import {
  getSafeCallbackUrl,
  resolveQuickAccessCallbackUrl,
  withCallbackUrl,
} from "@/lib/authCallback";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/800.css";
import "@fontsource/nunito-sans/900.css";
import styles from "./signin.module.css";

type AccessMode = "account" | "quick";

function SigninForm() {
  const { status: sessionStatus } = useSession();
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
    if (loading || sessionStatus === "loading") return;

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
    if (quickLoading || sessionStatus === "loading") return;

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
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.brand} aria-label="Anti-Selek">
          Anti-Selek<span aria-hidden="true">.</span>
        </div>

        <section className={styles.panel} aria-labelledby="signin-title">
          <header className={styles.intro}>
            <p className={styles.eyebrow}>ACCOUNT ACCESS</p>
            <h1 className={styles.title} id="signin-title">
              Welcome back
            </h1>
            <p className={styles.subtitle}>
              Sign in to play, follow results, or manage your club.
            </p>
          </header>

          <div
            className={styles.modeSwitch}
            role="group"
            aria-label="Access method"
          >
            <button
              type="button"
              aria-pressed={accessMode === "account"}
              onClick={() => selectAccessMode("account")}
              className={`${styles.modeButton} ${
                accessMode === "account" ? styles.modeButtonSelected : ""
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              aria-pressed={accessMode === "quick"}
              onClick={() => selectAccessMode("quick")}
              className={`${styles.modeButton} ${
                accessMode === "quick" ? styles.modeButtonSelected : ""
              }`}
            >
              View-only access
            </button>
          </div>

          {registered || passwordReset || error ? (
            <div className={styles.messages}>
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
          ) : null}

          {accessMode === "account" ? (
            <form
              onSubmit={handleSubmit}
              aria-busy={loading || sessionStatus === "loading"}
              className={styles.form}
            >
              <label className={styles.fieldLabel}>
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  className={styles.field}
                  autoComplete="email"
                  disabled={loading || sessionStatus === "loading"}
                  required
                />
              </label>

              <label className={styles.fieldLabel}>
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  className={styles.field}
                  autoComplete="current-password"
                  disabled={loading || sessionStatus === "loading"}
                  required
                />
              </label>

              <div className={styles.forgotRow}>
                <Link href="/forgot-password" className={styles.link}>
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading || sessionStatus === "loading"}
                className={styles.primaryButton}
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          ) : (
            <div className={styles.quickAccess}>
              <p className={styles.quickNote}>
                View-only access needs no password and is tied to one club
                profile. You can follow tournaments and standings, but you
                cannot join clubs, submit scores, or manage a club.
              </p>
              <p className={styles.quickInstructions}>
                Use the club and player names your host registered. Ask your
                host for the spelling if you are unsure. To submit scores or
                join another club, create an account.
              </p>
              <form
                onSubmit={handleQuickAccessSubmit}
                aria-busy={quickLoading || sessionStatus === "loading"}
                className={styles.form}
              >
                <label className={styles.fieldLabel}>
                  <span>Club name</span>
                  <input
                    type="text"
                    value={clubName}
                    onChange={(event) => {
                      setClubName(event.target.value);
                      setError("");
                    }}
                    className={styles.field}
                    autoComplete="organization"
                    disabled={quickLoading || sessionStatus === "loading"}
                    required
                  />
                </label>

                <label className={styles.fieldLabel}>
                  <span>Your player name</span>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(event) => {
                      setPlayerName(event.target.value);
                      setError("");
                    }}
                    className={styles.field}
                    autoComplete="name"
                    disabled={quickLoading || sessionStatus === "loading"}
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={
                    quickLoading || sessionStatus === "loading" || !clubName.trim() || !playerName.trim()
                  }
                  className={styles.primaryButton}
                >
                  {quickLoading ? "Entering..." : "Enter club"}
                </button>
              </form>
            </div>
          )}

          <p className={styles.footer}>
            <span>Don&apos;t have an account?</span>
            <Link href={signupHref} className={styles.link}>
              Sign up
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

export default function SigninPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <div className={styles.shell}>
            <div className={styles.brand} aria-label="Anti-Selek">
              Anti-Selek<span aria-hidden="true">.</span>
            </div>
            <div className={styles.loadingPanel} role="status">
              Loading sign in…
            </div>
          </div>
        </main>
      }
    >
      <SigninForm />
    </Suspense>
  );
}
