"use client";

import { ModalFrame } from "@/components/ui/chrome";
import type {
  CommunityAdminPlayer,
} from "./communityAdminTypes";
import type { MergeDuplicateCandidate } from "@/app/community/[id]/admin/useCommunityAdminPlayerActions";

interface CommunityPlayerMergeModalProps {
  sourcePlayer: CommunityAdminPlayer | null;
  search: string;
  candidates: MergeDuplicateCandidate[];
  loadingCandidates: boolean;
  mergingPlayerId: string | null;
  onSearchChange: (value: string) => void;
  onMerge: (candidate: MergeDuplicateCandidate) => void;
  onClose: () => void;
}

export function CommunityPlayerMergeModal({
  sourcePlayer,
  search,
  candidates,
  loadingCandidates,
  mergingPlayerId,
  onSearchChange,
  onMerge,
  onClose,
}: CommunityPlayerMergeModalProps) {
  if (!sourcePlayer) return null;

  const trimmedSearch = search.trim();

  return (
    <ModalFrame
      title="Merge duplicate player"
      subtitle="Move this community roster and history onto the correct unclaimed profile."
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={mergingPlayerId !== null}
            className="app-button-secondary px-4 py-2"
          >
            Cancel
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-gray-900">
            Source duplicate
          </p>
          <p className="mt-1 text-sm text-gray-700">{sourcePlayer.name}</p>
          <p className="mt-2 text-xs font-semibold text-amber-700">
            This cannot be undone from the app. Choose the canonical profile
            carefully.
          </p>
        </div>

        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Canonical unclaimed profile</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="field"
            placeholder="Search existing placeholders"
            autoFocus
          />
        </label>

        <div className="space-y-2">
          {trimmedSearch.length > 0 && trimmedSearch.length < 2 ? (
            <p className="text-xs font-semibold text-gray-500">
              Type at least 2 characters.
            </p>
          ) : loadingCandidates ? (
            <p className="text-xs font-semibold text-gray-500">Searching...</p>
          ) : trimmedSearch.length >= 2 && candidates.length === 0 ? (
            <p className="text-xs font-semibold text-gray-500">
              No merge candidates found.
            </p>
          ) : (
            candidates.map((candidate) => (
              <div
                key={candidate.id}
                className="rounded-xl border border-gray-200 bg-white px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {candidate.name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {candidate.communities.map((community) => (
                        <span
                          key={community.id}
                          className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-600"
                        >
                          {community.name} {community.elo}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onMerge(candidate)}
                    disabled={mergingPlayerId !== null}
                    className="app-button-primary shrink-0 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {mergingPlayerId === candidate.id
                      ? "Merging..."
                      : "Merge into this profile"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
