"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { FlashMessage } from "@/components/ui/chrome";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Signup failed");
        return;
      }

      router.push("/signin?registered=true");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-page flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="app-panel relative overflow-hidden px-6 py-8 sm:px-8">
            <div className="pointer-events-none absolute left-[-4rem] top-16 h-44 w-44 rounded-full bg-[rgba(25,154,97,0.14)] blur-3xl" />
            <div className="relative">
              <p className="app-eyebrow">Player setup</p>
              <h1 className="mt-3 app-title text-gray-900">Create a player account that can claim your community profile.</h1>
              <p className="mt-4 max-w-xl text-sm text-gray-600 sm:text-base">
                Sign up with your own email. If a community already created a placeholder for you, join that community and request the claim from its leaderboard.
              </p>

              <div className="mt-8 space-y-3">
                <div className="app-panel-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Recommended flow</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    Create your account first, then join the club space, then ask an admin to approve the claim.
                  </p>
                </div>
                <div className="app-panel-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">What stays intact</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    Your session history, ELO, and tournament stats remain tied to the claimed community profile.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="app-panel px-6 py-8 sm:px-8">
            <p className="app-eyebrow">Create account</p>
            <h2 className="mt-3 text-2xl font-semibold text-gray-900">New player access</h2>
            <p className="mt-2 text-sm text-gray-600">Use a real name so community admins can match you to the correct placeholder profile.</p>

            {error ? <FlashMessage tone="error" className="mt-6">{error}</FlashMessage> : null}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="field"
                  required
                />
              </label>

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
                {loading ? "Signing up..." : "Create account"}
              </button>
            </form>

            <p className="mt-6 text-sm text-gray-600">
              Already have an account?{" "}
              <Link href="/signin" className="font-semibold text-blue-600 hover:underline">
                Sign in
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
