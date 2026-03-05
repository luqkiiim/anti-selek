"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams, useSearchParams } from "next/navigation";

interface UserStats {
  user: {
    id: string;
    name: string;
    elo: number;
    createdAt: string;
  };
  context?: {
    communityId: string;
  } | null;
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
    winRate: number;
    pointsScored: number;
    pointsConceded: number;
  };
  matchHistory: {
    id: string;
    date: string;
    sessionName: string;
    partner: { id: string; name: string };
    opponents: { id: string; name: string }[];
    score: string;
    result: "WIN" | "LOSS";
    eloChange?: number;
  }[];
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const communityId = searchParams.get("communityId") || "";

  const [data, setData] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : "";
        const res = await fetch(`/api/users/${id}/stats${query}`);
        if (!res.ok) throw new Error("Failed to load profile");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    if (session?.user) {
      fetchData();
    }
  }, [id, session, communityId]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || "Profile not found"}</p>
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:underline"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow mb-6">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Player Profile</h1>
          <button
            onClick={() => router.back()}
            className="text-sm text-blue-600 hover:underline"
          >
            Back
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 pb-8">
        {/* Profile Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center text-3xl font-bold text-blue-600">
              {data.user.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-center lg:text-left">
              <h2 className="text-2xl font-bold text-gray-900">{data.user.name}</h2>
              <p className="text-gray-500 text-sm">Joined {new Date(data.user.createdAt).toLocaleDateString()}</p>
              <div className="mt-2 inline-block bg-purple-100 text-purple-800 text-sm font-bold px-3 py-1 rounded-full">
                {data.context?.communityId ? "Community ELO" : "ELO"}: {data.user.elo}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow text-center">
            <p className="text-gray-500 text-sm uppercase tracking-wide">Matches</p>
            <p className="text-2xl font-bold text-gray-900">{data.stats.totalMatches}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow text-center">
            <p className="text-gray-500 text-sm uppercase tracking-wide">Win Rate</p>
            <p className="text-2xl font-bold text-green-600">{data.stats.winRate}%</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow text-center">
            <p className="text-gray-500 text-sm uppercase tracking-wide">Wins</p>
            <p className="text-2xl font-bold text-blue-600">{data.stats.wins}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow text-center">
            <p className="text-gray-500 text-sm uppercase tracking-wide">Points Scored</p>
            <p className="text-2xl font-bold text-gray-700">{data.stats.pointsScored}</p>
          </div>
        </div>

        {/* Match History */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-bold text-gray-900">Match History</h3>
          </div>
          {data.matchHistory.length === 0 ? (
            <div className="p-8 text-center text-gray-500 italic">
              No matches played yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.matchHistory.map((match) => (
                <div key={match.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
                    
                    {/* Date & Session */}
                    <div className="text-center xl:text-left w-full xl:w-1/4">
                      <p className="font-bold text-gray-900">{match.sessionName}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(match.date).toLocaleDateString()} - {new Date(match.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    {/* Result Badge */}
                    <div className="flex flex-col items-center gap-1">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        match.result === "WIN" 
                          ? "bg-green-100 text-green-800" 
                          : "bg-red-100 text-red-800"
                      }`}>
                        {match.result}
                      </span>
                      {typeof match.eloChange === "number" && (
                        <span className={`text-[10px] font-black uppercase tracking-tighter ${
                          match.eloChange >= 0 ? "text-green-600" : "text-red-600"
                        }`}>
                          {match.eloChange >= 0 ? "+" : ""}{match.eloChange} ELO
                        </span>
                      )}
                    </div>

                    {/* Match Details */}
                    <div className="flex items-center justify-center gap-4 w-full xl:w-1/3">
                      <div className="text-right flex-1">
                        <p className="text-sm font-medium text-gray-900">{data.user.name} & {match.partner.name}</p>
                      </div>
                      <div className="bg-gray-100 px-3 py-1 rounded font-mono font-bold text-gray-800">
                        {match.score}
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-sm text-gray-600">vs {match.opponents.map(o => o.name).join(" & ")}</p>
                      </div>
                    </div>

                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

