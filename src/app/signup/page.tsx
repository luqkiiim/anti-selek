"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Helper to safely parse JSON
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-white">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="px-8 py-6 bg-blue-600 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.22em]">Court Heat</p>
          <h1 className="text-2xl font-black mt-1">Sign Up</h1>
          <p className="text-xs text-blue-100 mt-1">Create your player account.</p>
        </div>

        <div className="p-8">
          <p className="text-sm text-gray-600 text-center mb-6">
            If an admin already created your profile, use the <strong>exact same name</strong> to claim it.
          </p>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-4 text-sm font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-gray-600">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-xl shadow-sm bg-gray-50 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

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
              {loading ? "Signing up..." : "Sign Up"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/signin" className="text-blue-600 font-bold hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

