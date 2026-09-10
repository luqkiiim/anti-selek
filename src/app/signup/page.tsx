"use client";

import {PlayShell} from "@/components/play/PlayShell";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";

import { FlashMessage } from "@/components/ui/chrome";
import { getSafeCallbackUrl, withCallbackUrl } from "@/lib/authCallback";
import { PlayerGender } from "@/types/enums";

type SignupField = "name" | "gender" | "email" | "password" | "confirmPassword";

interface SignupError {
  message: string;
  field?: SignupField;
}

function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<PlayerGender | "">("");
  const [error, setError] = useState<SignupError | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(
    searchParams.get("callbackUrl"),
    ""
  );
  const nameRef = useRef<HTMLInputElement | null>(null);
  const genderRef = useRef<HTMLSelectElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const confirmPasswordRef = useRef<HTMLInputElement | null>(null);
  const genericErrorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!error) return;

    const fieldRefs: Record<
      SignupField,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      name: nameRef,
      gender: genderRef,
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
    if (![PlayerGender.MALE, PlayerGender.FEMALE].includes(gender as PlayerGender)) {
      return {
        message: "Choose your gender for Mixed pairing",
        field: "gender",
      };
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
          gender,
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
    <PlayShell title="Join Anti-Selek" backHref="/signin"><div className="play-auth"><section>
      <span className="eyebrow">YOUR NEXT CHAPTER</span><h1>Let’s get you playing.</h1><p className="quiet">Use the name your club knows.</p>
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
                <span>Gender for Mixed pairing</span>
                <select
                  ref={genderRef}
                  value={gender}
                  onChange={(event) => {
                    setGender(event.target.value as PlayerGender | "");
                    clearErrorFor("gender");
                  }}
                  className="field"
                  disabled={loading}
                  aria-invalid={error?.field === "gender" || undefined}
                  aria-describedby={`signup-gender-help${
                    error?.field === "gender" ? " signup-error" : ""
                  }`}
                  required
                >
                  <option value="">Choose gender</option>
                  <option value={PlayerGender.MALE}>Male</option>
                  <option value={PlayerGender.FEMALE}>Female</option>
                </select>
                <span id="signup-gender-help" className="block text-xs text-gray-600">
                  Used for Mixed team rules and carried into clubs you join.
                </span>
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

      </div></PlayShell>
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
