"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

import { FlashMessage } from "@/components/ui/chrome";
import { getSafeCallbackUrl, withCallbackUrl } from "@/lib/authCallback";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/800.css";
import "@fontsource/nunito-sans/900.css";
import styles from "./signin.module.css";

function SigninForm() {
  const { status: sessionStatus } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
          </header>

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
