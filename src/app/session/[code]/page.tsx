"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";

interface Player {
  userId: string;
  name: string;
  elo: number;
  sessionPoints: number;
}

interface Match {
  id: string;
  status: string;
  team1User1: { id: string; name: string };
  team1User2: { id: string; name: string };
  team2User1: { id: string; name: string };
  team2User2: { id: string; name: string };
  team1Score?: number;
  team2Score?: number;
}

interface Court {
  id: string;
  courtNumber: number;
  currentMatch: Match | null;
}

interface SessionData {
  id: string;
  code: string;
  name: string;
  status: string;
  courts: Court[];
  players: Player[];
}

export default function SessionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showScoreModal, setShowScoreModal] = useState<string | null>(null);
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchSession = useCallback(async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/sessions/${code}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load session");
        return;
      }
      const data = await res.json();
      setSessionData(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load session");
    }
  }, [code]);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/user/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.id && code) {
      fetchUser();
      fetchSession();
      const interval = setInterval(fetchSession, 3000);
      return () => clearInterval(interval);
    }
  }, [session, code, fetchSession]);

  const startSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${code}/start`, { method: "POST" });
      if (res.ok) fetchSession();
    } catch (err) {
      console.error(err);
    }
  };

  const endSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${code}/end`, { method: "POST" });
      if (res.ok) {
        router.push("/");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const generateMatch = async (courtId: string) => {
    try {
      const res = await fetch(`/api/sessions/${code}/generate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courtId }),
      });
      if (res.ok) {
        fetchSession();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to generate match");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const submitScore = async (matchId: string) => {
    if (!team1Score || !team2Score) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Score: parseInt(team1Score),
          team2Score: parseInt(team2Score),
        }),
      });
      if (res.ok) {
        setShowScoreModal(null);
        setTeam1Score("");
        setTeam2Score("");
        fetchSession();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to submit score");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const approveScore = async (matchId: string, overrideTeam1?: number, overrideTeam2?: number) => {
    try {
      const res = await fetch(`/api/matches/${matchId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Score: overrideTeam1,
          team2Score: overrideTeam2,
        }),
      });
      if (res.ok) {
        fetchSession();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to approve score");
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (status === "loading" || !sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  const isAdmin = user?.isAdmin;
  const currentUserId = session?.user?.id || "";

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{sessionData.name}</h1>
            <p className="text-sm text-gray-500">Code: {sessionData.code} • {sessionData.status}</p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-blue-600 hover:underline"
          >
            Back
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
            <button onClick={() => setError("")} className="float-right font-bold">×</button>
          </div>
        )}

        {/* Admin Controls */}
        {isAdmin && sessionData.status === "WAITING" && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <button
              onClick={startSession}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
            >
              Start Session
            </button>
          </div>
        )}

        {isAdmin && sessionData.status === "ACTIVE" && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <button
              onClick={endSession}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
            >
              End Session
            </button>
          </div>
        )}

        {/* Courts */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {sessionData.courts
            .sort((a, b) => a.courtNumber - b.courtNumber)
            .map((court) => (
              <div key={court.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold">Court {court.courtNumber}</h2>
                  {sessionData.status === "ACTIVE" && !court.currentMatch && isAdmin && (
                    <button
                      onClick={() => generateMatch(court.id)}
                      className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    >
                      New Match
                    </button>
                  )}
                </div>

                {court.currentMatch ? (
                  <div className="space-y-3">
                    {/* Team 1 */}
                    <div className="border rounded p-3 bg-blue-50">
                      <p className="text-sm text-gray-500 mb-1">Team 1</p>
                      <p className="font-medium">
                        {court.currentMatch.team1User1.name} & {court.currentMatch.team1User2.name}
                      </p>
                      {court.currentMatch.status === "PENDING_APPROVAL" && (
                        <p className="text-sm text-orange-600">
                          Score: {court.currentMatch.team1Score} - {court.currentMatch.team2Score}
                        </p>
                      )}
                    </div>

                    <div className="text-center font-bold text-xl">VS</div>

                    {/* Team 2 */}
                    <div className="border rounded p-3 bg-red-50">
                      <p className="text-sm text-gray-500 mb-1">Team 2</p>
                      <p className="font-medium">
                        {court.currentMatch.team2User1.name} & {court.currentMatch.team2User2.name}
                      </p>
                    </div>

                    {/* Actions */}
                    {court.currentMatch.status === "IN_PROGRESS" && (
                      <div className="pt-2">
                        {isAdmin ||
                        [
                          court.currentMatch.team1User1.id,
                          court.currentMatch.team1User2.id,
                          court.currentMatch.team2User1.id,
                          court.currentMatch.team2User2.id,
                        ].includes(currentUserId) ? (
                          <button
                            onClick={() => setShowScoreModal(court.currentMatch!.id)}
                            className="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700"
                          >
                            Submit Score
                          </button>
                        ) : (
                          <p className="text-sm text-gray-500 text-center">Waiting for score...</p>
                        )}
                      </div>
                    )}

                    {court.currentMatch.status === "PENDING_APPROVAL" && (
                      <div className="pt-2">
                        {isAdmin && (
                          <button
                            onClick={() =>
                              approveScore(court.currentMatch!.id)
                            }
                            className="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 mb-2"
                          >
                            Approve Score
                          </button>
                        )}
                        <p className="text-sm text-gray-500 text-center">Awaiting approval</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {sessionData.status === "ACTIVE" ? "Waiting for match" : "Court idle"}
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* Leaderboards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Session Points */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-bold mb-4">Session Points</h2>
            <div className="space-y-2">
              {sessionData.players
                .sort((a, b) => b.sessionPoints - a.sessionPoints)
                .map((player, idx) => (
                  <div key={player.userId} className="flex justify-between items-center p-2 border-b">
                    <span className="text-gray-600">#{idx + 1} {player.name}</span>
                    <span className="font-bold">{player.sessionPoints}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* ELO */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-bold mb-4">ELO Rating</h2>
            <div className="space-y-2">
              {sessionData.players
                .sort((a, b) => b.elo - a.elo)
                .map((player, idx) => (
                  <div key={player.userId} className="flex justify-between items-center p-2 border-b">
                    <span className="text-gray-600">#{idx + 1} {player.name}</span>
                    <span className="font-bold">{player.elo}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </main>

      {/* Score Modal */}
      {showScoreModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">Submit Score</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Team 1 Score</label>
                <input
                  type="number"
                  value={team1Score}
                  onChange={(e) => setTeam1Score(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="e.g., 21"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Team 2 Score</label>
                <input
                  type="number"
                  value={team2Score}
                  onChange={(e) => setTeam2Score(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="e.g., 17"
                />
              </div>
              <p className="text-xs text-gray-500">
                Win by 2, cap at 30 (e.g., 30-28)
              </p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setShowScoreModal(null);
                  setTeam1Score("");
                  setTeam2Score("");
                }}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={() => submitScore(showScoreModal)}
                disabled={submitting}
                className="flex-1 bg-green-600 text-white py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
