"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FlashMessage, HeroCard, StatCard } from "@/components/ui/chrome";
import {
  ClaimRequestStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

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

interface ClaimRequest {
  id: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string | null;
  targetUserId: string;
  targetName: string;
  targetEmail: string | null;
  status: ClaimRequestStatus;
  note?: string | null;
  createdAt: string;
}

export default function CommunityAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";

  const [community, setCommunity] = useState<Community | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [claimRequests, setClaimRequests] = useState<ClaimRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [newPlayerGender, setNewPlayerGender] = useState<PlayerGender>(PlayerGender.MALE);
  const [editingName, setEditingName] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState<Record<string, boolean>>({});
  const [editingElo, setEditingElo] = useState<Record<string, string>>({});
  const [savingElo, setSavingElo] = useState<Record<string, boolean>>({});
  const [savingRole, setSavingRole] = useState<Record<string, boolean>>({});
  const [savingPreferences, setSavingPreferences] = useState<Record<string, boolean>>({});
  const [openPreferenceEditorFor, setOpenPreferenceEditorFor] = useState<string | null>(null);
  const [preferenceEditorDirection, setPreferenceEditorDirection] = useState<"up" | "down">(
    "down"
  );
  const [reviewingClaimRequestId, setReviewingClaimRequestId] = useState<string | null>(null);
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

  const togglePreferenceEditor = (playerId: string, triggerEl: HTMLElement) => {
    if (openPreferenceEditorFor === playerId) {
      setOpenPreferenceEditorFor(null);
      return;
    }
    const rect = triggerEl.getBoundingClientRect();
    const estimatedPopoverHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    setPreferenceEditorDirection(spaceBelow < estimatedPopoverHeight ? "up" : "down");
    setOpenPreferenceEditorFor(playerId);
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

    const [playersRes, claimRequestsRes] = await Promise.all([
      fetch(`/api/communities/${communityId}/members`),
      fetch(`/api/communities/${communityId}/claim-requests`),
    ]);
    const [playersData, claimRequestsData] = await Promise.all([
      safeJson(playersRes),
      safeJson(claimRequestsRes),
    ]);
    if (!playersRes.ok) {
      throw new Error(playersData.error || "Failed to load players");
    }
    if (!claimRequestsRes.ok) {
      throw new Error(claimRequestsData.error || "Failed to load claim requests");
    }
    setPlayers(Array.isArray(playersData) ? playersData : []);
    setClaimRequests(Array.isArray(claimRequestsData) ? claimRequestsData : []);
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
          gender: newPlayerGender,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to add player");
      }

      setSuccess(`Player profile for "${name}" added to community.`);
      setName("");
      setNewPlayerGender(PlayerGender.MALE);
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
        throw new Error(data.error || "Failed to update rating");
      }

      setSuccess(`${playerName}'s rating updated to ${newElo}.`);
      setEditingElo((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update rating");
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

  const handlePromotePlayer = async (id: string, playerName: string) => {
    if (!confirm(`Promote ${playerName} to admin?`)) {
      return;
    }

    setSavingRole((prev) => ({ ...prev, [id]: true }));
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to promote player");
      }

      setSuccess(`${playerName} promoted to admin.`);
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to promote player");
    } finally {
      setSavingRole((prev) => ({ ...prev, [id]: false }));
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
      "This will DELETE ALL TOURNAMENTS in this community and reset member ratings to 1000. Type 'RESET' to confirm:"
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

  const handleReviewClaimRequest = async (
    claimRequest: ClaimRequest,
    action: "APPROVE" | "REJECT"
  ) => {
    setReviewingClaimRequestId(claimRequest.id);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(
        `/api/communities/${communityId}/claim-requests/${claimRequest.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to review claim request");
      }

      setSuccess(
        action === "APPROVE"
          ? `Approved ${claimRequest.requesterName}'s claim for ${claimRequest.targetName}.`
          : `Rejected ${claimRequest.requesterName}'s claim for ${claimRequest.targetName}.`
      );
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to review claim request");
    } finally {
      setReviewingClaimRequestId(null);
    }
  };

  const renderRolePill = (player: Player) => {
    const baseClassName =
      "px-2 inline-flex text-xs leading-5 font-semibold rounded-full border transition-colors";

    if (player.role === "ADMIN") {
      return (
        <span className={`${baseClassName} bg-[#ede9fe] text-[#5b21b6] border-[#ddd6fe]`}>
          {player.role}
        </span>
      );
    }

    if (!player.isClaimed) {
      return (
        <span
          className={`${baseClassName} bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]`}
          title="Only claimed members can be promoted to admin."
        >
          {player.role}
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={() => handlePromotePlayer(player.id, player.name)}
        disabled={savingRole[player.id]}
        title="Promote to admin"
        className={`${baseClassName} bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe] hover:bg-[#bfdbfe] disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {savingRole[player.id] ? "Promoting..." : player.role}
      </button>
    );
  };

  if (status === "loading" || loading) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="app-eyebrow">Loading admin</p>
        </div>
      </div>
    );
  }

  const claimedPlayers = players.filter((player) => player.isClaimed).length;
  const adminPlayers = players.filter((player) => player.role === "ADMIN").length;

  return (
    <main className="app-page">
      <div className="app-topbar">
        <div className="app-topbar-inner">
          <div className="flex items-center gap-3">
          <Link
            href={`/community/${communityId}`}
            className="app-button-secondary px-4 py-2"
          >
            Back
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 tracking-tight leading-none">
              {community?.name || "Community"}
            </h1>
            <p className="text-[11px] text-gray-500">Community admin</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetCommunity}
            disabled={resettingCommunity || deletingCommunity}
            className="app-button-dark"
          >
            {resettingCommunity ? "Resetting..." : "Reset"}
          </button>
          <button
            onClick={handleDeleteCommunity}
            disabled={deletingCommunity || resettingCommunity}
            className="app-button-danger"
          >
            {deletingCommunity ? "Deleting..." : "Delete"}
          </button>
        </div>
        </div>
      </div>

      <div className="app-shell space-y-8">
        <HeroCard
          eyebrow="Admin panel"
          title={community?.name || "Community"}
          description="Manage member records, approve claims, update player preferences, and keep the community roster clean without changing tournament logic."
          backHref={`/community/${communityId}`}
          backLabel="Community"
          meta={<span className="app-chip app-chip-danger">Admin only</span>}
        />

        {success ? <FlashMessage tone="success">{success}</FlashMessage> : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Players" value={players.length} detail="Profiles in this community" accent />
          <StatCard label="Claimed" value={claimedPlayers} detail={`${players.length - claimedPlayers} placeholders`} />
          <StatCard label="Claim requests" value={claimRequests.length} detail={claimRequests.length > 0 ? "Needs review" : "No pending reviews"} />
          <StatCard label="Admins" value={adminPlayers} detail="Accounts with community access" />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-8 items-start">
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Create Player Profile</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                Add a player to this community.
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
                <select
                  value={newPlayerGender}
                  onChange={(e) => setNewPlayerGender(e.target.value as PlayerGender)}
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500 transition-all"
                >
                  <option value={PlayerGender.MALE}>Male</option>
                  <option value={PlayerGender.FEMALE}>Female</option>
                </select>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all"
                >
                  Create Profile
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Claim Requests</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    Review member requests to claim placeholder profiles.
                  </p>
                </div>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  {claimRequests.length} pending
                </span>
              </div>

              <div className="space-y-3">
                {claimRequests.length === 0 ? (
                  <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-4 text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      No pending claim requests
                    </p>
                  </div>
                ) : (
                  claimRequests.map((claimRequest) => (
                    <div
                      key={claimRequest.id}
                      className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3"
                    >
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                          Requester
                        </p>
                        <p className="text-sm font-black text-gray-900">{claimRequest.requesterName}</p>
                        <p className="text-xs text-gray-500">
                          {claimRequest.requesterEmail || "No email"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                          Placeholder
                        </p>
                        <p className="text-sm font-black text-gray-900">{claimRequest.targetName}</p>
                        <p className="text-xs text-gray-500">
                          {claimRequest.targetEmail || "No email"}
                        </p>
                      </div>
                      {claimRequest.note && (
                        <div className="rounded-xl bg-white border border-gray-200 px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                            Note
                          </p>
                          <p className="text-xs text-gray-600 mt-1">{claimRequest.note}</p>
                        </div>
                      )}
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Requested {new Date(claimRequest.createdAt).toLocaleDateString()}
                      </p>
                      {claimRequest.requesterUserId === session?.user?.id && (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                          Another admin must approve this request
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleReviewClaimRequest(claimRequest, "APPROVE")}
                          disabled={
                            reviewingClaimRequestId !== null ||
                            claimRequest.requesterUserId === session?.user?.id
                          }
                          className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {reviewingClaimRequestId === claimRequest.id ? "Working..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewClaimRequest(claimRequest, "REJECT")}
                          disabled={reviewingClaimRequestId !== null}
                          className="w-full bg-white border border-red-200 text-red-600 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
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
                          <p className="text-xs font-black text-gray-700">Rating {player.elo}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {renderRolePill(player)}
                        {player.isClaimed ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            Claimed
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Unclaimed
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 relative">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                          Gender
                        </span>
                        <button
                          type="button"
                          onClick={(e) => togglePreferenceEditor(player.id, e.currentTarget)}
                          className="px-2 h-7 inline-flex items-center justify-center whitespace-nowrap text-xs leading-none font-semibold rounded-full bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-colors"
                        >
                          {getGenderPillLabel(player)}
                        </button>
                        {openPreferenceEditorFor === player.id && (
                          <div
                            className={`absolute right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2.5 w-44 space-y-2 ${
                              preferenceEditorDirection === "up"
                                ? "bottom-full mb-2"
                                : "top-full mt-2"
                            }`}
                          >
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
                    <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Rating</th>
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
                              onClick={(e) => togglePreferenceEditor(player.id, e.currentTarget)}
                              className="px-2 h-7 inline-flex items-center justify-center whitespace-nowrap text-xs leading-none font-semibold rounded-full bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-colors"
                            >
                              {getGenderPillLabel(player)}
                            </button>
                            {openPreferenceEditorFor === player.id && (
                              <div
                                className={`absolute right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2.5 w-44 space-y-2 text-left ${
                                  preferenceEditorDirection === "up"
                                    ? "bottom-full mb-2"
                                    : "top-full mt-2"
                                }`}
                              >
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
                          {renderRolePill(player)}
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
