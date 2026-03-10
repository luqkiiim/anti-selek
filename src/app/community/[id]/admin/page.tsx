"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  EmptyState,
  FlashMessage,
  ModalFrame,
  SectionCard,
} from "@/components/ui/chrome";
import { CommunitySettingsPanel } from "@/components/community-admin/CommunitySettingsPanel";
import { ClaimRequestsPanel } from "@/components/community-admin/ClaimRequestsPanel";
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

  const [communityNameInput, setCommunityNameInput] = useState("");
  const [communityPasswordInput, setCommunityPasswordInput] = useState("");
  const [savingCommunitySettings, setSavingCommunitySettings] = useState(false);

  const [activeSection, setActiveSection] = useState<"players" | "claims" | "settings">(
    "players"
  );
  const [playerSearch, setPlayerSearch] = useState("");

  const [isCreatePlayerOpen, setIsCreatePlayerOpen] = useState(false);
  const [name, setName] = useState("");
  const [newPlayerGender, setNewPlayerGender] = useState<PlayerGender>(PlayerGender.MALE);

  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorRating, setEditorRating] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const [reviewingClaimRequestId, setReviewingClaimRequestId] = useState<string | null>(null);
  const [resettingCommunity, setResettingCommunity] = useState(false);
  const [deletingCommunity, setDeletingCommunity] = useState(false);

  const [passwordResetTarget, setPasswordResetTarget] = useState<Player | null>(null);
  const [passwordResetValue, setPasswordResetValue] = useState("");
  const [passwordResetConfirm, setPasswordResetConfirm] = useState("");
  const [passwordResetError, setPasswordResetError] = useState("");
  const [savingPasswordReset, setSavingPasswordReset] = useState(false);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  };

  const getGenderPillLabel = (player: Player) => {
    if (player.gender === PlayerGender.FEMALE) {
      return player.partnerPreference === PartnerPreference.OPEN
        ? "Female/Open"
        : "Female";
    }
    return "Male";
  };

  const fetchCommunityAndPlayers = useCallback(async () => {
    if (!communityId) return;

    const communitiesRes = await fetch("/api/communities");
    const communitiesData = await safeJson(communitiesRes);
    if (!communitiesRes.ok) {
      throw new Error(communitiesData.error || "Failed to load communities");
    }

    const list = Array.isArray(communitiesData) ? (communitiesData as Community[]) : [];
    const currentCommunity = list.find((item) => item.id === communityId) || null;
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
    if (!community) return;
    setCommunityNameInput((prev) =>
      prev.trim().length === 0 || prev === community.name ? community.name : prev
    );
  }, [community]);

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
  }, [communityId, fetchCommunityAndPlayers, router, status]);

  const openPlayerEditor = (player: Player) => {
    setEditingPlayerId(player.id);
    setEditorName(player.name);
    setEditorRating(String(player.elo));
    setError("");
    setSuccess("");
  };

  const closePlayerEditor = () => {
    setEditingPlayerId(null);
    setEditorName("");
    setEditorRating("");
    setSavingName(false);
    setSavingRating(false);
    setSavingRole(false);
    setSavingPreferences(false);
  };

  const openPasswordResetModal = (player: Player) => {
    setPasswordResetTarget(player);
    setPasswordResetValue("");
    setPasswordResetConfirm("");
    setPasswordResetError("");
    setError("");
    setSuccess("");
  };

  const closePasswordResetModal = () => {
    setPasswordResetTarget(null);
    setPasswordResetValue("");
    setPasswordResetConfirm("");
    setPasswordResetError("");
    setSavingPasswordReset(false);
  };

  const handleAddPlayer = async (e: React.FormEvent<HTMLFormElement>) => {
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
      setIsCreatePlayerOpen(false);
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    }
  };

  const handleSavePlayerName = async (player: Player) => {
    const nextName = editorName.trim();
    if (!nextName || nextName === player.name) {
      setEditorName(player.name);
      return;
    }

    setSavingName(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update player name");
      }

      setSuccess(`Player name updated to "${nextName}".`);
      setEditorName(nextName);
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update player name");
    } finally {
      setSavingName(false);
    }
  };

  const handleSavePlayerRating = async (player: Player) => {
    const nextRating = parseInt(editorRating, 10);
    if (Number.isNaN(nextRating)) return;
    if (nextRating === player.elo) return;

    setSavingRating(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elo: nextRating }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update rating");
      }

      setSuccess(`${player.name}'s rating updated to ${nextRating}.`);
      setEditorRating(String(nextRating));
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update rating");
    } finally {
      setSavingRating(false);
    }
  };

  const handleRemovePlayer = async (player: Player) => {
    if (!confirm(`Remove ${player.name} from this community?`)) {
      return false;
    }

    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "DELETE",
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove player");
      }

      setSuccess(`${player.name} removed from community.`);
      closePlayerEditor();
      await fetchCommunityAndPlayers();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove player");
      return false;
    }
  };

  const handleResetPlayerPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!passwordResetTarget) return;

    setError("");
    setSuccess("");
    setPasswordResetError("");

    if (passwordResetValue.trim().length < 8) {
      setPasswordResetError("Password must be at least 8 characters.");
      return;
    }

    if (passwordResetValue !== passwordResetConfirm) {
      setPasswordResetError("Passwords do not match.");
      return;
    }

    setSavingPasswordReset(true);

    try {
      const res = await fetch(
        `/api/communities/${communityId}/members/${passwordResetTarget.id}/password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: passwordResetValue }),
        }
      );
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      setSuccess(
        `Password reset for ${passwordResetTarget.name}. Share the new password with them directly.`
      );
      closePasswordResetModal();
    } catch (err: unknown) {
      setPasswordResetError(err instanceof Error ? err.message : "Failed to reset password");
      setSavingPasswordReset(false);
    }
  };

  const handlePromotePlayer = async (player: Player) => {
    if (!confirm(`Promote ${player.name} to admin?`)) {
      return;
    }

    setSavingRole(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to promote player");
      }

      setSuccess(`${player.name} promoted to admin.`);
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to promote player");
    } finally {
      setSavingRole(false);
    }
  };

  const handleUpdatePreferences = async (
    player: Player,
    updates: { gender?: PlayerGender; partnerPreference?: PartnerPreference }
  ) => {
    if (updates.gender === undefined && updates.partnerPreference === undefined) return;

    setSavingPreferences(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update player preferences");
      }

      setPlayers((prev) =>
        prev.map((item) =>
          item.id === player.id
            ? {
                ...item,
                gender:
                  typeof data.gender === "string"
                    ? (data.gender as PlayerGender)
                    : item.gender,
                partnerPreference:
                  typeof data.partnerPreference === "string"
                    ? (data.partnerPreference as PartnerPreference)
                    : item.partnerPreference,
              }
            : item
        )
      );
      setSuccess("Player preferences updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update player preferences");
    } finally {
      setSavingPreferences(false);
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

  const handleUpdateCommunitySettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!community) return;

    const trimmedName = communityNameInput.trim();
    const nextPassword = communityPasswordInput;
    const hasNameChange = trimmedName.length > 0 && trimmedName !== community.name;
    const hasPasswordChange = nextPassword.length > 0;

    setError("");
    setSuccess("");

    if (trimmedName.length < 3) {
      setError("Community name must be at least 3 characters.");
      return;
    }
    if (hasPasswordChange && nextPassword.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (!hasNameChange && !hasPasswordChange) {
      setSuccess("No changes to save.");
      return;
    }

    setSavingCommunitySettings(true);

    try {
      const body: { name?: string; password?: string } = {};
      if (hasNameChange) body.name = trimmedName;
      if (hasPasswordChange) body.password = nextPassword;

      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update community");
      }

      setCommunityPasswordInput("");
      setSuccess("Community settings updated.");
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update community");
    } finally {
      setSavingCommunitySettings(false);
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
      "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]";

    if (player.role === "ADMIN") {
      return (
        <span className={`${baseClassName} border-[#ddd6fe] bg-[#ede9fe] text-[#5b21b6]`}>
          {player.role}
        </span>
      );
    }

    return (
      <span className={`${baseClassName} border-[#bfdbfe] bg-[#dbeafe] text-[#1e40af]`}>
        {player.role}
      </span>
    );
  };

  const renderClaimPill = (player: Player) => {
    if (player.isClaimed) {
      return (
        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-800">
          Claimed
        </span>
      );
    }

    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
        Unclaimed
      </span>
    );
  };

  const renderGenderPill = (player: Player) => (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-700">
      {getGenderPillLabel(player)}
    </span>
  );

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
  const searchQuery = playerSearch.trim().toLowerCase();
  const filteredPlayers = players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((player) => {
      if (!searchQuery) return true;
      return (
        player.name.toLowerCase().includes(searchQuery) ||
        player.email?.toLowerCase().includes(searchQuery) ||
        getGenderPillLabel(player).toLowerCase().includes(searchQuery)
      );
    });
  const editingPlayer = editingPlayerId
    ? players.find((player) => player.id === editingPlayerId) ?? null
    : null;

  return (
    <main className="app-page">
      <div className="app-topbar">
        <div className="app-topbar-inner">
          <div className="flex items-center gap-3">
            <Link href={`/community/${communityId}`} className="app-button-secondary px-4 py-2">
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
            <span className="app-chip app-chip-danger">Admin only</span>
            <span
              className={`app-chip ${
                community?.isPasswordProtected ? "app-chip-warning" : "app-chip-neutral"
              }`}
            >
              {community?.isPasswordProtected ? "Protected" : "Open"}
            </span>
          </div>
        </div>
      </div>

      <div className="app-shell space-y-8">
        <section className="app-panel relative overflow-hidden px-5 py-6 sm:px-6">
          <div className="pointer-events-none absolute inset-y-0 right-[-5rem] top-[-2rem] w-64 rounded-full bg-[radial-gradient(circle,_rgba(22,119,242,0.16),_transparent_65%)] blur-2xl" />
          <div className="pointer-events-none absolute bottom-[-4rem] left-[-2rem] h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(25,154,97,0.12),_transparent_68%)] blur-2xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="app-eyebrow">Admin workspace</p>
              <h2 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
                Keep the roster clean and the community ready for tournaments.
              </h2>
              <p className="text-sm text-gray-600 sm:text-base">
                Players, claim reviews, and community settings now live in focused sections
                instead of one long admin screen.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="app-chip app-chip-accent">{players.length} players</span>
              <span className="app-chip app-chip-neutral">{claimedPlayers} claimed</span>
              <span className="app-chip app-chip-neutral">{adminPlayers} admins</span>
              <span
                className={`app-chip ${
                  claimRequests.length > 0 ? "app-chip-warning" : "app-chip-success"
                }`}
              >
                {claimRequests.length} claim requests
              </span>
            </div>
          </div>
        </section>

        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
        {success ? <FlashMessage tone="success">{success}</FlashMessage> : null}

        <section className="app-panel-soft p-2">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { key: "players", label: "Players", detail: `${players.length} total` },
              { key: "claims", label: "Claims", detail: `${claimRequests.length} pending` },
              { key: "settings", label: "Settings", detail: "Community controls" },
            ].map((tab) => {
              const isActive = activeSection === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() =>
                    setActiveSection(tab.key as "players" | "claims" | "settings")
                  }
                  className={`rounded-2xl px-4 py-3 text-left transition ${
                    isActive
                      ? "bg-white shadow-sm ring-1 ring-blue-100"
                      : "bg-transparent text-gray-600 hover:bg-white/70"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{tab.label}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    {tab.detail}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {activeSection === "players" ? (
          <SectionCard
            eyebrow="Roster"
            title="Community players"
            description="A compact roster for quick review. Open a player when you need to edit details or admin access."
            action={
              <button
                type="button"
                onClick={() => {
                  setName("");
                  setNewPlayerGender(PlayerGender.MALE);
                  setIsCreatePlayerOpen(true);
                }}
                className="app-button-primary px-4 py-2"
              >
                Add player
              </button>
            }
          >
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="block w-full lg:max-w-sm">
                <span className="sr-only">Search players</span>
                <input
                  type="search"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  className="field"
                  placeholder="Search players by name or email"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <span className="app-chip app-chip-neutral">{filteredPlayers.length} shown</span>
                <span className="app-chip app-chip-neutral">
                  {players.length - claimedPlayers} placeholders
                </span>
              </div>
            </div>

            {filteredPlayers.length === 0 ? (
              <EmptyState
                title={
                  players.length === 0
                    ? "No players in the community yet."
                    : "No players match that search."
                }
                detail={
                  players.length === 0
                    ? "Create the first player profile to start building the community roster."
                    : "Try another name or clear the search to see the full roster."
                }
                action={
                  players.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setName("");
                        setNewPlayerGender(PlayerGender.MALE);
                        setIsCreatePlayerOpen(true);
                      }}
                      className="app-button-primary px-4 py-2"
                    >
                      Create first player
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-3">
                {filteredPlayers.map((player) => {
                  const initials = player.name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("");

                  return (
                    <div
                      key={player.id}
                      className="rounded-[28px] border border-gray-100 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(244,248,252,0.92))] px-4 py-4 shadow-sm transition hover:-translate-y-[1px] hover:border-blue-200 hover:shadow-md sm:px-5"
                    >
                      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.8fr)_120px_minmax(0,1.3fr)_auto] lg:items-center">
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(22,119,242,0.16),rgba(25,154,97,0.14))] text-sm font-black text-blue-700">
                            {initials || player.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-gray-900">
                              {player.name}
                            </p>
                            <p className="truncate text-sm text-gray-600">
                              {player.email || "No email on file"}
                            </p>
                            <Link
                              href={`/profile/${player.id}?communityId=${communityId}`}
                              className="mt-1 inline-flex text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600 hover:text-blue-700"
                            >
                              View profile
                            </Link>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-white/85 px-3 py-2 lg:text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">
                            Rating
                          </p>
                          <p className="mt-1 text-lg font-semibold leading-none text-gray-900">
                            {player.elo}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {renderRolePill(player)}
                          {renderClaimPill(player)}
                          {renderGenderPill(player)}
                        </div>

                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => openPlayerEditor(player)}
                            className="app-button-secondary px-4 py-2"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        ) : null}

        {activeSection === "claims" ? (
          <ClaimRequestsPanel
            claimRequests={claimRequests}
            reviewingClaimRequestId={reviewingClaimRequestId}
            currentUserId={session?.user?.id}
            onReviewClaimRequest={handleReviewClaimRequest}
          />
        ) : null}

        {activeSection === "settings" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
            <CommunitySettingsPanel
              communityName={communityNameInput}
              onCommunityNameChange={setCommunityNameInput}
              communityPassword={communityPasswordInput}
              onCommunityPasswordChange={setCommunityPasswordInput}
              isPasswordProtected={community?.isPasswordProtected ?? false}
              onSubmit={handleUpdateCommunitySettings}
              saving={savingCommunitySettings}
            />

            <section className="app-panel p-6">
              <div className="space-y-2">
                <p className="app-eyebrow">Danger zone</p>
                <h3 className="text-xl font-semibold text-gray-900">Reset or delete community</h3>
                <p className="text-sm text-gray-600">
                  Reset clears tournament history and ratings. Delete removes the whole community permanently.
                </p>
              </div>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-900">Reset tournaments and ratings</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Deletes all tournaments in this community and returns member ratings to 1000.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetCommunity}
                    disabled={resettingCommunity || deletingCommunity}
                    className="app-button-dark mt-4 px-4 py-2"
                  >
                    {resettingCommunity ? "Resetting..." : "Reset community"}
                  </button>
                </div>

                <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                  <p className="text-sm font-semibold text-gray-900">Delete this community</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Permanently removes this community and all related data.
                  </p>
                  <button
                    type="button"
                    onClick={handleDeleteCommunity}
                    disabled={deletingCommunity || resettingCommunity}
                    className="app-button-danger mt-4 px-4 py-2"
                  >
                    {deletingCommunity ? "Deleting..." : "Delete community"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>

      {isCreatePlayerOpen ? (
        <ModalFrame
          title="Create player profile"
          subtitle="Add a new member or placeholder profile to this community."
          onClose={() => setIsCreatePlayerOpen(false)}
          footer={
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreatePlayerOpen(false)}
                className="app-button-secondary px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-player-form"
                className="app-button-primary px-4 py-2"
              >
                Create profile
              </button>
            </div>
          }
        >
          <form
            id="create-player-form"
            onSubmit={handleAddPlayer}
            className="space-y-4 px-4 py-4 sm:px-5"
          >
            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Player name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field"
                placeholder="Player name"
                required
              />
            </label>

            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Gender</span>
              <select
                value={newPlayerGender}
                onChange={(e) => setNewPlayerGender(e.target.value as PlayerGender)}
                className="field"
              >
                <option value={PlayerGender.MALE}>Male</option>
                <option value={PlayerGender.FEMALE}>Female</option>
              </select>
            </label>
          </form>
        </ModalFrame>
      ) : null}

      {editingPlayer ? (
        <ModalFrame
          title={editingPlayer.name}
          subtitle="Edit player details without turning the roster into a wall of forms."
          onClose={closePlayerEditor}
          footer={
            <div className="flex flex-wrap justify-between gap-3">
              <button
                type="button"
                onClick={() => void handleRemovePlayer(editingPlayer)}
                className="app-button-danger px-4 py-2"
              >
                Remove player
              </button>
              <button
                type="button"
                onClick={closePlayerEditor}
                className="app-button-secondary px-4 py-2"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-5 px-4 py-4 sm:px-5">
            <div className="app-panel-muted space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Current profile
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{editingPlayer.name}</p>
                  <p className="text-sm text-gray-600">
                    {editingPlayer.email || "No email on file"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {renderRolePill(editingPlayer)}
                  {renderClaimPill(editingPlayer)}
                  {renderGenderPill(editingPlayer)}
                </div>
              </div>
              <Link
                href={`/profile/${editingPlayer.id}?communityId=${communityId}`}
                className="app-button-secondary inline-flex px-4 py-2"
              >
                View profile
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="app-panel-muted space-y-3 p-4">
                <label className="block space-y-2 text-sm font-medium text-gray-900">
                  <span>Name</span>
                  <input
                    type="text"
                    value={editorName}
                    onChange={(e) => setEditorName(e.target.value)}
                    className="field"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleSavePlayerName(editingPlayer)}
                  disabled={savingName || editorName.trim() === editingPlayer.name}
                  className="app-button-primary px-4 py-2"
                >
                  {savingName ? "Saving..." : "Save name"}
                </button>
              </div>

              <div className="app-panel-muted space-y-3 p-4">
                <label className="block space-y-2 text-sm font-medium text-gray-900">
                  <span>Rating</span>
                  <input
                    type="number"
                    value={editorRating}
                    onChange={(e) => setEditorRating(e.target.value)}
                    className="field"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleSavePlayerRating(editingPlayer)}
                  disabled={savingRating || editorRating === `${editingPlayer.elo}`}
                  className="app-button-primary px-4 py-2"
                >
                  {savingRating ? "Saving..." : "Save rating"}
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="app-panel-muted space-y-3 p-4">
                <label className="block space-y-2 text-sm font-medium text-gray-900">
                  <span>Gender</span>
                  <select
                    value={editingPlayer.gender}
                    onChange={async (e) => {
                      const nextGender = e.target.value as PlayerGender;
                      const nextPreference =
                        nextGender === PlayerGender.MALE
                          ? PartnerPreference.OPEN
                          : PartnerPreference.FEMALE_FLEX;
                      await handleUpdatePreferences(editingPlayer, {
                        gender: nextGender,
                        partnerPreference: nextPreference,
                      });
                    }}
                    disabled={savingPreferences}
                    className="field"
                  >
                    <option value={PlayerGender.MALE}>Male</option>
                    <option value={PlayerGender.FEMALE}>Female</option>
                  </select>
                </label>

                <label className="block space-y-2 text-sm font-medium text-gray-900">
                  <span>Open tag</span>
                  {editingPlayer.gender === PlayerGender.FEMALE ? (
                    <select
                      value={editingPlayer.partnerPreference}
                      onChange={async (e) => {
                        const nextPreference = e.target.value as PartnerPreference;
                        await handleUpdatePreferences(editingPlayer, {
                          partnerPreference: nextPreference,
                        });
                      }}
                      disabled={savingPreferences}
                      className="field"
                    >
                      <option value={PartnerPreference.FEMALE_FLEX}>Default</option>
                      <option value={PartnerPreference.OPEN}>Open Tag</option>
                    </select>
                  ) : (
                    <div className="field flex items-center text-sm text-gray-500">Not needed</div>
                  )}
                </label>

                {savingPreferences ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Saving preferences...
                  </p>
                ) : null}
              </div>

              <div className="app-panel-muted space-y-4 p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Admin access</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Promote claimed members to admin when they need community control.
                  </p>
                </div>

                {editingPlayer.role === "ADMIN" ? (
                  <p className="text-sm text-gray-600">This player already has admin access.</p>
                ) : editingPlayer.isClaimed ? (
                  <button
                    type="button"
                    onClick={() => void handlePromotePlayer(editingPlayer)}
                    disabled={savingRole}
                    className="app-button-secondary px-4 py-2"
                  >
                    {savingRole ? "Promoting..." : "Promote to admin"}
                  </button>
                ) : (
                  <p className="text-sm text-gray-600">
                    Only claimed members can be promoted to admin.
                  </p>
                )}

                {editingPlayer.isClaimed && editingPlayer.email ? (
                  <button
                    type="button"
                    onClick={() => openPasswordResetModal(editingPlayer)}
                    className="app-button-secondary px-4 py-2"
                  >
                    Reset password
                  </button>
                ) : (
                  <p className="text-sm text-gray-600">
                    Password resets are only available for claimed members with an email.
                  </p>
                )}
              </div>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {passwordResetTarget ? (
        <ModalFrame
          title="Reset member password"
          subtitle="Set a new sign-in password here, then share it with the player manually."
          onClose={closePasswordResetModal}
          footer={
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closePasswordResetModal}
                className="app-button-secondary px-4 py-2"
                disabled={savingPasswordReset}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="reset-member-password-form"
                className="app-button-primary px-4 py-2"
                disabled={savingPasswordReset}
              >
                {savingPasswordReset ? "Saving..." : "Save password"}
              </button>
            </div>
          }
        >
          <form
            id="reset-member-password-form"
            onSubmit={handleResetPlayerPassword}
            className="space-y-4 px-4 py-4 sm:px-5"
          >
            <div className="app-panel-muted space-y-1 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Member
              </p>
              <p className="text-sm font-semibold text-gray-900">{passwordResetTarget.name}</p>
              <p className="text-sm text-gray-600">{passwordResetTarget.email}</p>
            </div>

            {passwordResetError ? (
              <FlashMessage tone="error">{passwordResetError}</FlashMessage>
            ) : null}

            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>New password</span>
              <input
                type="password"
                value={passwordResetValue}
                onChange={(e) => setPasswordResetValue(e.target.value)}
                className="field"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>

            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Confirm password</span>
              <input
                type="password"
                value={passwordResetConfirm}
                onChange={(e) => setPasswordResetConfirm(e.target.value)}
                className="field"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>

            <p className="text-sm text-gray-600">
              This replaces the player&apos;s existing sign-in password immediately.
            </p>
          </form>
        </ModalFrame>
      ) : null}
    </main>
  );
}
