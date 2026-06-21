"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { FlashMessage } from "@/components/ui/chrome";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const missingToken = token.trim().length === 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (missingToken) {
      setError("Reset link is invalid or expired");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Failed to reset password"
        );
        return;
      }

      router.push("/signin?passwordReset=true");
      router.refresh();
    } catch {
      setError("Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-page flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="app-panel relative overflow-hidden px-6 py-8 sm:px-8">
            <div className="relative">
              <p className="app-eyebrow">Set a new password</p>
              <h1 className="mt-3 app-title text-gray-900">
                Finish your password reset.
              </h1>
              <p className="mt-4 max-w-xl text-sm text-gray-600 sm:text-base">
                This updates the single global password for your claimed player
                account across every club.
              </p>
            </div>
          </section>

          <section className="app-panel px-6 py-8 sm:px-8">
            <p className="app-eyebrow">Choose password</p>
            <h2 className="mt-3 text-2xl font-semibold text-gray-900">
              Reset password
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Use at least 8 characters.
            </p>

            <div className="mt-6 space-y-4">
              {missingToken ? (
                <FlashMessage tone="error">
                  Reset link is invalid or expired
                </FlashMessage>
              ) : null}
              {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>New password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="field"
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="field"
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading || missingToken}
                className="app-button-primary w-full"
              >
                <KeyRound aria-hidden="true" size={17} />
                {loading ? "Saving..." : "Save new password"}
              </button>
            </form>

            <p className="mt-6 text-sm text-gray-600">
              <Link
                href="/signin"
                className="font-semibold text-blue-600 hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page flex items-center justify-center px-6">
          <div className="app-panel px-8 py-8">
            <p className="app-eyebrow">Loading password reset</p>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
