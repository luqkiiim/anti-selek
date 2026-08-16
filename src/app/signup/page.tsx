"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";

import { FlashMessage } from "@/components/ui/chrome";
import { getSafeCallbackUrl, withCallbackUrl } from "@/lib/authCallback";

type SignupField = "name" | "email" | "password" | "confirmPassword";

interface SignupError {
  message: string;
  field?: SignupField;
}

function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<SignupError | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(
    searchParams.get("callbackUrl"),
    ""
  );
  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const confirmPasswordRef = useRef<HTMLInputElement | null>(null);
  const genericErrorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!error) return;

    const fieldRefs: Record<SignupField, React.RefObject<HTMLInputElement | null>> = {
      name: nameRef,
      email: emailRef,
      password: passwordRef,
      confirmPassword: confirmPasswordRef,
    };
    (error.field ? fieldRefs[error.field].current : genericErrorRef.current)?.focus();
  }, [error]);

  const safeJson = async (response: Response) => {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  };

  const clearErrorFor = (field: SignupField) => {
    setError((current) =>
      !current || (current.field && current.field !== field) ? current : null
    );
  };

  const validate = (): SignupError | null => {
    if (!name.trim()) {
      return { message: "Enter your name", field: "name" };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return { message: "Enter a valid email address", field: "email" };
    }
    if (password.length < 8) {
      return {
        message: "Password must be at least 8 characters",
        field: "password",
      };
    }
    if (password !== confirmPassword) {
      return {
        message: "Passwords do not match",
        field: "confirmPassword",
      };
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim(),
        }),
      });

      const data = await safeJson(response);
      if (!response.ok) {
        const message =
          typeof data.error === "string" ? data.error : "Signup failed";
        const loweredMessage = message.toLowerCase();
        setError({
          message,
          field: loweredMessage.includes("email")
            ? "email"
            : loweredMessage.includes("password")
              ? "password"
              : undefined,
        });
        return;
      }

      const params = new URLSearchParams({ registered: "true" });
      if (callbackUrl) params.set("callbackUrl", callbackUrl);
      router.push(`/signin?${params.toString()}`);
    } catch {
      setError({ message: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-page flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="app-panel order-1 px-6 py-8 sm:px-8 lg:order-2">
            <p className="app-eyebrow">Create account</p>
            <h1 className="mt-3 text-2xl font-semibold text-gray-900">
              Get full player access
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Use the name your club knows so it is easy to connect your
              account to your results.
            </p>

            {error ? (
              <div ref={genericErrorRef} tabIndex={-1} className="mt-6 outline-none">
                <FlashMessage id="signup-error" tone="error">
                  {error.message}
                </FlashMessage>
              </div>
            ) : null}

            <form
              onSubmit={handleSubmit}
              noValidate
              aria-busy={loading}
              className="mt-6 space-y-4"
            >
              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Name</span>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    clearErrorFor("name");
                  }}
                  className="field"
                  autoComplete="name"
                  disabled={loading}
                  aria-invalid={error?.field === "name" || undefined}
                  aria-describedby={error?.field === "name" ? "signup-error" : undefined}
                  required
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Email</span>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearErrorFor("email");
                  }}
                  className="field"
                  autoComplete="email"
                  disabled={loading}
                  aria-invalid={error?.field === "email" || undefined}
                  aria-describedby={error?.field === "email" ? "signup-error" : undefined}
                  required
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Password</span>
                <input
                  ref={passwordRef}
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError((current) =>
                      current?.field === "password" ||
                      current?.field === "confirmPassword"
                        ? null
                        : current
                    );
                  }}
                  className="field"
                  autoComplete="new-password"
                  disabled={loading}
                  minLength={8}
                  aria-invalid={error?.field === "password" || undefined}
                  aria-describedby={`signup-password-help${
                    error?.field === "password" ? " signup-error" : ""
                  }`}
                  required
                />
                <span id="signup-password-help" className="block text-xs text-gray-600">
                  Use at least 8 characters.
                </span>
              </label>

              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Confirm password</span>
                <input
                  ref={confirmPasswordRef}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    clearErrorFor("confirmPassword");
                  }}
                  className="field"
                  autoComplete="new-password"
                  disabled={loading}
                  minLength={8}
                  aria-invalid={error?.field === "confirmPassword" || undefined}
                  aria-describedby={
                    error?.field === "confirmPassword" ? "signup-error" : undefined
                  }
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="app-button-primary w-full"
              >
                <UserPlus aria-hidden="true" size={17} />
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="mt-6 text-sm text-gray-600">
              Already have an account?{" "}
              <Link
                href={withCallbackUrl("/signin", callbackUrl)}
                className="font-semibold text-blue-600 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </section>

          <section className="app-panel order-2 relative overflow-hidden px-6 py-8 sm:px-8 lg:order-1">
            <div className="relative">
              <p className="app-eyebrow">Your badminton profile</p>
              <h2 className="mt-3 app-title text-gray-900">
                Keep your club activity connected.
              </h2>
              <p className="mt-4 max-w-xl text-sm text-gray-600 sm:text-base">
                Your account gives you full access to clubs, tournament actions,
                ratings, and match history.
              </p>

              <div className="mt-8 space-y-3">
                <div className="app-panel-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                    Already listed in a club?
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    After signing up, join the club and request to connect your
                    account to the existing player profile on its leaderboard.
                  </p>
                </div>
                <div className="app-panel-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                    Your history stays together
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    Once a club admin approves the connection, its existing
                    ratings and tournament results remain with you.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page flex items-center justify-center px-6">
          <div className="app-panel px-8 py-8">
            <p className="app-eyebrow">Loading signup</p>
          </div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
