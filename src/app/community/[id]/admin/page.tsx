"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PartnerPreference, PlayerGender } from "@/types/enums";

interface Community {
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  isPasswordProtected: boolean;
  membersCount: number;
  sessionsCount: number;
}

interface Player {
  id: string;
  name: string;
  email: string | null;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  elo: number;
  isActive: boolean;
  isClaimed: boolean;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
}

export default function CommunityAdminPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";

  const [community, setCommunity] = useState<Community | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editingName, setEditingName] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState<Record<string, boolean>>({});
  const [editingElo, setEditingElo] = useState<Record<string, string>>({});
  const [savingElo, setSavingElo] = useState<Record<string, boolean>>({});
  const [savingPreferences, setSavingPreferences] = useState<Record<string, boolean>>({});
  const [openPreferenceEditorFor, setOpenPreferenceEditorFor] = useState<string | null>(null);
  const [resettingCommunity, setResettingCommunity] = useState(false);
  const [deletingCommunity, setDeletingCommunity] = useState(false);

  const getGenderPillLabel = (player: Player) => {
    if (player.gender === PlayerGender.FEMALE) {
      return player.partnerPreference === PartnerPreference.OPEN
        ? "Female/Open"
        : "Female";
    }
    return "Male";
  };

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  };

  const fetchCommunityAndPlayers = useCallback(async () => {
    if (!communityId) return;

    const communitiesRes = await fetch("/api/communities");
    const communitiesData = await safeJson(communitiesRes);
    if (!communitiesRes.ok) {
      throw new Error(communitiesData.error || "Failed to load communities");
    }

    const list = Array.isArray(communitiesData) ? (communitiesData as Community[]) : [];
    const currentCommunity = list.find((c) => c.id === communityId) || null;
    if (!currentCommunity) {
      throw new Error("Community not found or access denied");
    }
    if (currentCommunity.role !== "ADMIN") {
      router.replace(`/community/${communityId}`);
      throw new Error("Only community admins can access this page");
    }
    setCommunity(currentCommunity);

    const playersRes = await fetch(`/api/communities/${communityId}/members`);
    const playersData = await safeJson(playersRes);
    if (!playersRes.ok) {
      throw new Error(playersData.error || "Failed to load players");
    }
    setPlayers(Array.isArray(playersData) ? playersData : []);
  }, [communityId, router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
      return;
    }

    if (status !== "authenticated" || !communityId) return;

    (async () => {
      try {
        setLoading(true);
        setError("");
        await fetchCommunityAndPlayers();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load admin page");
      } finally {
        setLoading(false);
      }
    })();
  }, [status, router, communityId, fetchCommunityAndPlayers]);

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: email || undefined,
          password: password || undefined,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to add player");
      }

      setSuccess(`Player profile for "${name}" added to community.`);
      setName("");
      setEmail("");
      setPassword("");
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    }
  };

  const handleEloChange = (id: string, value: string) => {
    setEditingElo((prev) => ({ ...prev, [id]: value }));
  };

  const handleNameChange = (id: string, value: string) => {
    setEditingName((prev) => ({ ...prev, [id]: value }));
  };

  const handleUpdateName = async (id: string, currentName: string) => {
    const nextNameRaw = editingName[id];
    if (nextNameRaw === undefined) return;

    const nextName = nextNameRaw.trim();
    if (!nextName || nextName === currentName) {
      setEditingName((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    setSavingName((prev) => ({ ...prev, [id]: true }));
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update player name");
      }

      setSuccess(`Player name updated to "${nextName}".`);
      setEditingName((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update player name");
    } finally {
      setSavingName((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleUpdateElo = async (id: string, playerName: string) => {
    const newElo = editingElo[id];
    if (!newElo || isNaN(parseInt(newElo, 10))) return;

    setSavingElo((prev) => ({ ...prev, [id]: true }));
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elo: parseInt(newElo, 10) }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update ELO");
      }

      setSuccess(`${playerName}'s ELO updated to ${newElo}.`);
      setEditingElo((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update ELO");
    } finally {
      setSavingElo((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleRemovePlayer = async (id: string, playerName: string) => {
    if (!confirm(`Remove ${playerName} from this community?`)) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${id}`, {
        method: "DELETE",
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove player");
      }

      setSuccess(`${playerName} removed from community.`);
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove player");
    }
  };

  const handleUpdatePreferences = async (
    id: string,
    updates: { gender?: PlayerGender; partnerPreference?: PartnerPreference }
  ) => {
    if (updates.gender === undefined && updates.partnerPreference === undefined) return;
    setSavingPreferences((prev) => ({ ...prev, [id]: true }));
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update player preferences");
      }

      setPlayers((prev) =>
        prev.map((player) =>
          player.id === id
            ? {
                ...player,
                gender:
                  typeof data.gender === "string"
                    ? (data.gender as PlayerGender)
                    : player.gender,
                partnerPreference:
                  typeof data.partnerPreference === "string"
                    ? (data.partnerPreference as PartnerPreference)
                    : player.partnerPreference,
              }
            : player
        )
      );
      setSuccess("Player preferences updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update player preferences");
    } finally {
      setSavingPreferences((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleResetCommunity = async () => {
    const confirmation = prompt(
      "This will DELETE ALL TOURNAMENTS in this community and reset member ELO to 1000. Type 'RESET' to confirm:"
    );
    if (confirmation !== "RESET") {
      if (confirmation !== null) {
        alert("Reset cancelled. You must type RESET exactly.");
      }
      return;
    }

    setError("");
    setSuccess("");
    setResettingCommunity(true);

    try {
      const res = await fetch(`/api/communities/${communityId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RESET" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset community");
      }

      setSuccess("Community reset successful.");
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset community");
    } finally {
      setResettingCommunity(false);
    }
  };

  const handleDeleteCommunity = async () => {
    const confirmation = prompt(
      "This will permanently DELETE this community and all related data. Type 'DELETE' to confirm:"
    );
    if (confirmation !== "DELETE") {
      if (confirmation !== null) {
        alert("Delete cancelled. You must type DELETE exactly.");
      }
      return;
    }

    setError("");
    setSuccess("");
    setDeletingCommunity(true);

    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete community");
      }

      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete community");
    } finally {
      setDeletingCommunity(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Admin...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/community/${communityId}`}
            className="text-[10px] font-black text-gray-500 uppercase tracking-widest border border-gray-200 rounded-xl px-3 py-2 hover:text-blue-600 hover:border-blue-300 transition-colors"
          >
            Back
          </Link>
          <div>
            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none">
              {community?.name || "Community"}
            </h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Admin Panel</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetCommunity}
            disabled={resettingCommunity || deletingCommunity}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl font-black uppercase text-[10px] active:scale-95 transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {resettingCommunity ? "Resetting..." : "Reset"}
          </button>
          <button
            onClick={handleDeleteCommunity}
            disabled={deletingCommunity || resettingCommunity}
            className="bg-red-600 text-white px-4 py-2 rounded-xl font-black uppercase text-[10px] active:scale-95 transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {deletingCommunity ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-8 space-y-8">
        {success && (
          <div className="bg-green-100 border border-green-300 text-green-700 px-4 py-3 rounded-2xl text-sm font-semibold">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-8 items-start">
          <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Create Player Profile</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              Add a player to this community. They can claim later with same email.
            </p>
            <form onSubmit={handleAddPlayer} className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
                placeholder="Player Name"
                required
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
                placeholder="Email (optional)"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
                placeholder="Password (optional)"
              />
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all"
              >
                Create Profile
              </button>
            </form>
          </div>

          <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Community Players</h3>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{players.length} total</span>
            </div>

            <div className="xl:hidden p-4 space-y-3">
              {players.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 italic">No players in the community yet.</div>
              ) : (
                players
                  .slice()
                  .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name))
                  .map((player) => (
                    <div key={player.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              className="w-full px-2 py-1 text-sm font-bold border rounded bg-white focus:outline-none focus:border-blue-500"
                              value={editingName[player.id] !== undefined ? editingName[player.id] : player.name}
                              onChange={(e) => handleNameChange(player.id, e.target.value)}
                            />
                            {editingName[player.id] !== undefined &&
                              editingName[player.id].trim() !== player.name && (
                                <button
                                  onClick={() => handleUpdateName(player.id, player.name)}
                                  disabled={savingName[player.id]}
                                  className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded font-black uppercase tracking-tighter hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {savingName[player.id] ? "..." : "Save"}
                                </button>
                              )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">{player.email || "No email"}</p>
                          <Link href={`/profile/${player.id}?communityId=${communityId}`} className="text-[11px] text-blue-600 hover:underline">
                            View profile
                          </Link>
                        </div>
                        <div className="shrink-0 space-y-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              className="w-20 px-2 py-1 text-xs font-bold border rounded bg-white focus:outline-none focus:border-blue-500"
                              value={editingElo[player.id] !== undefined ? editingElo[player.id] : player.elo}
                              onChange={(e) => handleEloChange(player.id, e.target.value)}
                            />
                            {editingElo[player.id] !== undefined && (
                              <button
                                onClick={() => handleUpdateElo(player.id, player.name)}
                                disabled={savingElo[player.id]}
                                className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded font-black uppercase tracking-tighter hover:bg-blue-700 disabled:opacity-50"
                              >
                                {savingElo[player.id] ? "..." : "Save"}
                              </button>
                            )}
                          </div>
                          <p className="text-xs font-black text-gray-700">ELO {player.elo}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${
                            player.role === "ADMIN"
                              ? "bg-[#ede9fe] text-[#5b21b6] border-[#ddd6fe]"
                              : "bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]"
                          }`}
                        >
                          {player.role}
                        </span>
                        {player.isClaimed ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            Claimed
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Unclaimed
                          </span>
                        )}
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                          {getGenderPillLabel(player)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3 relative">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                          Gender
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenPreferenceEditorFor((prev) =>
                              prev === player.id ? null : player.id
                            )
                          }
                          className="px-2 inline-flex h-7 text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-colors"
                        >
                          {getGenderPillLabel(player)}
                        </button>
                        {openPreferenceEditorFor === player.id && (
                          <div className="absolute top-full right-0 mt-2 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2.5 w-44 space-y-2">
                            <div className="space-y-1">
                              <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                                Gender
                              </p>
                              <select
                                value={player.gender}
                                onChange={async (e) => {
                                  const nextGender = e.target.value as PlayerGender;
                                  setOpenPreferenceEditorFor(null);
                                  const nextPreference =
                                    nextGender === PlayerGender.MALE
                                      ? PartnerPreference.OPEN
                                      : PartnerPreference.FEMALE_FLEX;
                                  await handleUpdatePreferences(player.id, {
                                    gender: nextGender,
                                    partnerPreference: nextPreference,
                                  });
                                }}
                                disabled={savingPreferences[player.id]}
                                className="h-8 w-full bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-black uppercase tracking-wide text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-60"
                              >
                                <option value={PlayerGender.MALE}>Male</option>
                                <option value={PlayerGender.FEMALE}>Female</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                                Open Tag
                              </p>
                              {player.gender === PlayerGender.FEMALE ? (
                                <select
                                  value={player.partnerPreference}
                                  onChange={async (e) => {
                                    const nextPreference = e.target.value as PartnerPreference;
                                    setOpenPreferenceEditorFor(null);
                                    await handleUpdatePreferences(player.id, {
                                      partnerPreference: nextPreference,
                                    });
                                  }}
                                  disabled={savingPreferences[player.id]}
                                  className="h-8 w-full bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-black uppercase tracking-wide text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-60"
                                >
                                  <option value={PartnerPreference.FEMALE_FLEX}>Default</option>
                                  <option value={PartnerPreference.OPEN}>Open Tag</option>
                                </select>
                              ) : (
                                <p className="text-[10px] font-black uppercase tracking-wide text-gray-500 px-1 py-2">
                                  Not Needed
                                </p>
                              )}
                            </div>
                            {savingPreferences[player.id] && (
                              <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                                Saving...
                              </p>
                            )}
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => setOpenPreferenceEditorFor(null)}
                                className="text-[9px] font-black uppercase tracking-widest text-gray-500"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-1">
                        <button
                          onClick={() => handleRemovePlayer(player.id, player.name)}
                          className="w-full text-center text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 py-2 rounded-xl text-xs font-black uppercase"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="hidden xl:block">
              <table className="w-full table-auto divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Player</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">ELO</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Claimed</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Gender</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Role</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {players
                    .slice()
                    .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name))
                    .map((player) => (
                      <tr key={player.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-4 align-middle">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                className="w-full max-w-[200px] px-2 py-1 text-sm font-bold border rounded bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-500"
                                value={editingName[player.id] !== undefined ? editingName[player.id] : player.name}
                                onChange={(e) => handleNameChange(player.id, e.target.value)}
                              />
                              {editingName[player.id] !== undefined &&
                                editingName[player.id].trim() !== player.name && (
                                  <button
                                    onClick={() => handleUpdateName(player.id, player.name)}
                                    disabled={savingName[player.id]}
                                    className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded font-black uppercase tracking-tighter hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {savingName[player.id] ? "..." : "Save"}
                                  </button>
                                )}
                            </div>
                            <div className="text-xs text-gray-500 truncate">{player.email || "No email"}</div>
                            <Link href={`/profile/${player.id}?communityId=${communityId}`} className="text-[11px] text-blue-600 hover:underline">
                              View profile
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 align-middle">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              className="w-16 px-2 py-1 text-xs font-bold border rounded bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-500"
                              value={editingElo[player.id] !== undefined ? editingElo[player.id] : player.elo}
                              onChange={(e) => handleEloChange(player.id, e.target.value)}
                            />
                            {editingElo[player.id] !== undefined && (
                              <button
                                onClick={() => handleUpdateElo(player.id, player.name)}
                                disabled={savingElo[player.id]}
                                className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded font-black uppercase tracking-tighter hover:bg-blue-700 disabled:opacity-50"
                              >
                                {savingElo[player.id] ? "..." : "Save"}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-middle text-center">
                          {player.isClaimed ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                              Claimed
                            </span>
                          ) : (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                              Unclaimed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 align-middle text-center">
                          <div className="relative inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenPreferenceEditorFor((prev) =>
                                  prev === player.id ? null : player.id
                                )
                              }
                              className="px-2 inline-flex h-7 text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-colors"
                            >
                              {getGenderPillLabel(player)}
                            </button>
                            {openPreferenceEditorFor === player.id && (
                              <div className="absolute top-full right-0 mt-2 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2.5 w-44 space-y-2 text-left">
                                <div className="space-y-1">
                                  <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                                    Gender
                                  </p>
                                  <select
                                    value={player.gender}
                                    onChange={async (e) => {
                                      const nextGender = e.target.value as PlayerGender;
                                      setOpenPreferenceEditorFor(null);
                                      const nextPreference =
                                        nextGender === PlayerGender.MALE
                                          ? PartnerPreference.OPEN
                                          : PartnerPreference.FEMALE_FLEX;
                                      await handleUpdatePreferences(player.id, {
                                        gender: nextGender,
                                        partnerPreference: nextPreference,
                                      });
                                    }}
                                    disabled={savingPreferences[player.id]}
                                    className="h-8 w-full bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-black uppercase tracking-wide text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-60"
                                  >
                                    <option value={PlayerGender.MALE}>Male</option>
                                    <option value={PlayerGender.FEMALE}>Female</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                                    Open Tag
                                  </p>
                                  {player.gender === PlayerGender.FEMALE ? (
                                    <select
                                      value={player.partnerPreference}
                                      onChange={async (e) => {
                                        const nextPreference = e.target.value as PartnerPreference;
                                        setOpenPreferenceEditorFor(null);
                                        await handleUpdatePreferences(player.id, {
                                          partnerPreference: nextPreference,
                                        });
                                      }}
                                      disabled={savingPreferences[player.id]}
                                      className="h-8 w-full bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-black uppercase tracking-wide text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-60"
                                    >
                                      <option value={PartnerPreference.FEMALE_FLEX}>Default</option>
                                      <option value={PartnerPreference.OPEN}>Open Tag</option>
                                    </select>
                                  ) : (
                                    <p className="text-[10px] font-black uppercase tracking-wide text-gray-500 px-1 py-2">
                                      Not Needed
                                    </p>
                                  )}
                                </div>
                                {savingPreferences[player.id] && (
                                  <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                                    Saving...
                                  </p>
                                )}
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setOpenPreferenceEditorFor(null)}
                                    className="text-[9px] font-black uppercase tracking-widest text-gray-500"
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs font-bold text-gray-700 align-middle text-center">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${
                              player.role === "ADMIN"
                                ? "bg-[#ede9fe] text-[#5b21b6] border-[#ddd6fe]"
                                : "bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]"
                            }`}
                          >
                            {player.role}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-medium align-middle">
                          <div className="flex justify-center gap-3">
                            <button
                              onClick={() => handleRemovePlayer(player.id, player.name)}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-bold uppercase"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {players.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500 italic">
                        No players in the community yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="fixed bottom-6 left-6 right-6 z-50">
          <div className="bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex justify-between items-center">
            <p className="text-xs font-black uppercase tracking-wide">{error}</p>
            <button onClick={() => setError("")} className="font-black">
              x
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
