"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { FlashMessage } from "@/components/ui/chrome";

const GENERIC_SUCCESS_MESSAGE =
  "If that email belongs to a claimed account, we've sent a reset link.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Failed to send reset email"
        );
        return;
      }

      setSuccess(
        typeof data.message === "string"
          ? data.message
          : GENERIC_SUCCESS_MESSAGE
      );
    } catch {
      setError("Failed to send reset email");
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
              <p className="app-eyebrow">Account recovery</p>
              <h1 className="mt-3 app-title text-gray-900">
                Reset your account password by email.
              </h1>
              <p className="mt-4 max-w-xl text-sm text-gray-600 sm:text-base">
                Claimed accounts use one global password across every community.
                Enter your email and we&apos;ll send a recovery link if the
                account exists.
              </p>

              <div className="mt-8 space-y-3">
                <div className="app-panel-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Recovery path
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    Community admins do not manage normal password recovery for
                    claimed accounts anymore.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="app-panel px-6 py-8 sm:px-8">
            <p className="app-eyebrow">Send reset link</p>
            <h2 className="mt-3 text-2xl font-semibold text-gray-900">
              Forgot password
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              We&apos;ll email a reset link if the address belongs to a claimed
              player account.
            </p>

            <div className="mt-6 space-y-4">
              {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
              {success ? (
                <FlashMessage tone="success">{success}</FlashMessage>
              ) : null}
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="field"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="app-button-primary w-full"
              >
                <Mail aria-hidden="true" size={17} />
                {loading ? "Sending..." : "Email reset link"}
              </button>
            </form>

            <p className="mt-6 text-sm text-gray-600">
              <Link
                href="/signin"
                className="inline-flex items-center gap-2 font-semibold text-blue-600 hover:underline"
              >
                <ArrowLeft aria-hidden="true" size={15} />
                Back to sign in
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
