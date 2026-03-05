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
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-[#e5cfb2] overflow-hidden">
        <div className="px-8 py-6 bg-[#c56a1f] text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.22em]">Court Heat</p>
          <h1 className="text-2xl font-black mt-1">Sign In</h1>
          <p className="text-xs text-orange-100 mt-1">Continue to your tournament dashboard.</p>
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
              <label className="block text-xs font-black uppercase tracking-wider text-[#6a543f]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2.5 border border-[#ceb697] rounded-xl shadow-sm bg-[#fff3e1] focus:outline-none focus:ring-[#c56a1f] focus:border-[#c56a1f]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-[#6a543f]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2.5 border border-[#ceb697] rounded-xl shadow-sm bg-[#fff3e1] focus:outline-none focus:ring-[#c56a1f] focus:border-[#c56a1f]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#c56a1f] text-white py-2.5 px-4 rounded-xl hover:bg-[#a75316] disabled:opacity-50 font-black uppercase tracking-wider text-sm"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-[#6a543f]">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-[#c56a1f] font-bold hover:underline">
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold text-xl text-[#6a543f]">Loading Sign In...</div>}>
      <SigninForm />
    </Suspense>
  );
}
