"use client";

import type {
  CommunityAdminOfflineIdentityLink,
  CommunityAdminPlayer,
} from "./communityAdminTypes";

interface OfflineIdentityLinksPanelProps {
  links: CommunityAdminOfflineIdentityLink[];
  currentCommunityId: string;
  currentUserId?: string | null;
  sourcePlaceholderOptions: CommunityAdminPlayer[];
  sourceUserId: string;
  onSourceUserIdChange: (value: string) => void;
  targetCommunitySearch: string;
  onTargetCommunitySearchChange: (value: string) => void;
  selectedTargetCommunity: { id: string; name: string; membersCount: number } | null;
  targetCommunityCandidates: Array<{ id: string; name: string; membersCount: number }>;
  loadingTargetCommunities: boolean;
  loadingTargetRoster: boolean;
  targetPlaceholderOptions: Array<{
    id: string;
    name: string;
    elo: number;
  }>;
  targetUserId: string;
  onTargetUserIdChange: (value: string) => void;
  submitting: boolean;
  reviewingLinkId: string | null;
  onSelectTargetCommunity: (candidate: {
    id: string;
    name: string;
    membersCount: number;
  }) => void;
  onClearTargetCommunity: () => void;
  onSubmitLink: () => void;
  onReviewLink: (
    link: CommunityAdminOfflineIdentityLink,
    status: "ACCEPTED" | "REJECTED"
  ) => void;
  onUnlink: (link: CommunityAdminOfflineIdentityLink) => void;
}

function getLinkDirection(
  link: CommunityAdminOfflineIdentityLink,
  currentCommunityId: string
) {
  return link.sourceCommunityId === currentCommunityId ? "Outgoing" : "Incoming";
}

export function OfflineIdentityLinksPanel({
  links,
  currentCommunityId,
  currentUserId,
  sourcePlaceholderOptions,
  sourceUserId,
  onSourceUserIdChange,
  targetCommunitySearch,
  onTargetCommunitySearchChange,
  selectedTargetCommunity,
  targetCommunityCandidates,
  loadingTargetCommunities,
  loadingTargetRoster,
  targetPlaceholderOptions,
  targetUserId,
  onTargetUserIdChange,
  submitting,
  reviewingLinkId,
  onSelectTargetCommunity,
  onClearTargetCommunity,
  onSubmitLink,
  onReviewLink,
  onUnlink,
}: OfflineIdentityLinksPanelProps) {
  const pendingLinks = links.filter((link) => link.status === "PENDING");
  const acceptedLinks = links.filter((link) => link.status === "ACCEPTED");
  const canSubmit =
    !!sourceUserId && !!selectedTargetCommunity && !!targetUserId && !submitting;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">
              Link Offline Players
            </h3>
            <p className="mt-1 max-w-2xl text-xs font-semibold text-gray-500">
              Connect unclaimed placeholders only after both communities agree they represent the same person.
            </p>
          </div>
          <span className="app-chip app-chip-neutral">
            {acceptedLinks.length} active
          </span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">
              This community
            </span>
            <select
              value={sourceUserId}
              onChange={(event) => onSourceUserIdChange(event.target.value)}
              className="field"
            >
              <option value="">Choose placeholder</option>
              {sourcePlaceholderOptions.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} - {player.elo}
                </option>
              ))}
            </select>
          </label>

          <div className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">
              Partner community
            </span>
            {selectedTargetCommunity ? (
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3">
                <span className="min-w-0 truncate text-sm font-semibold text-gray-900">
                  {selectedTargetCommunity.name}
                </span>
                <button
                  type="button"
                  onClick={onClearTargetCommunity}
                  className="text-xs font-black uppercase tracking-widest text-blue-600"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="search"
                  value={targetCommunitySearch}
                  onChange={(event) =>
                    onTargetCommunitySearchChange(event.target.value)
                  }
                  className="field"
                  placeholder="Search communities"
                />
                {targetCommunityCandidates.length > 0 ||
                loadingTargetCommunities ? (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                    {loadingTargetCommunities ? (
                      <p className="px-3 py-2 text-xs font-semibold text-gray-500">
                        Searching...
                      </p>
                    ) : (
                      targetCommunityCandidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => onSelectTargetCommunity(candidate)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
                        >
                          <span className="truncate">{candidate.name}</span>
                          <span className="shrink-0 text-xs text-gray-400">
                            {candidate.membersCount}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">
              Partner placeholder
            </span>
            <select
              value={targetUserId}
              onChange={(event) => onTargetUserIdChange(event.target.value)}
              disabled={!selectedTargetCommunity || loadingTargetRoster}
              className="field disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {loadingTargetRoster ? "Loading roster..." : "Choose placeholder"}
              </option>
              {targetPlaceholderOptions.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} - {player.elo}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onSubmitLink}
            disabled={!canSubmit}
            className="app-button-primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Linking..." : "Request link"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">
              Link Requests
            </h3>
            <p className="mt-1 text-xs font-semibold text-gray-500">
              Incoming requests need approval from this community.
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {pendingLinks.length} pending
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {links.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50 p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                No offline identity links yet
              </p>
            </div>
          ) : (
            links.map((link) => {
              const isIncomingPending =
                link.status === "PENDING" &&
                link.targetCommunityId === currentCommunityId;
              const isOwnRequest = link.requestedById === currentUserId;

              return (
                <div
                  key={link.id}
                  className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                        {getLinkDirection(link, currentCommunityId)} - {link.status}
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-900">
                        {link.sourceUserName} in {link.sourceCommunityName}
                      </p>
                      <p className="text-sm font-black text-gray-900">
                        {link.targetUserName} in {link.targetCommunityName}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-gray-500">
                        Requested {new Date(link.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {isIncomingPending ? (
                      <div className="grid grid-cols-2 gap-2 lg:w-64">
                        <button
                          type="button"
                          onClick={() => onReviewLink(link, "ACCEPTED")}
                          disabled={reviewingLinkId !== null || isOwnRequest}
                          className="rounded-xl bg-blue-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {reviewingLinkId === link.id ? "Working..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onReviewLink(link, "REJECTED")}
                          disabled={reviewingLinkId !== null}
                          className="rounded-xl border border-red-200 bg-white py-2.5 text-[10px] font-black uppercase tracking-widest text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                    {link.status === "ACCEPTED" ? (
                      <button
                        type="button"
                        onClick={() => onUnlink(link)}
                        disabled={reviewingLinkId !== null}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {reviewingLinkId === link.id ? "Working..." : "Unlink"}
                      </button>
                    ) : null}
                  </div>
                  {isOwnRequest && isIncomingPending ? (
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                      Another admin must approve this request
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
