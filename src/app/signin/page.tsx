"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

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
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-white">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="px-8 py-6 bg-blue-600 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.22em]">Court Heat</p>
          <h1 className="text-2xl font-black mt-1">Sign In</h1>
          <p className="text-xs text-blue-100 mt-1">Continue to your tournament dashboard.</p>
        </div>

        <div className="p-8">

          {registered && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-4 text-sm font-semibold">
              Account created. Please sign in.
            </div>
          )}

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-4 text-sm font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-gray-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-xl shadow-sm bg-gray-50 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-gray-600">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-xl shadow-sm bg-gray-50 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-black uppercase tracking-wider text-sm"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-600">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-blue-600 font-bold hover:underline">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SigninPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold text-xl text-gray-600">Loading Sign In...</div>}>
      <SigninForm />
    </Suspense>
  );
}

