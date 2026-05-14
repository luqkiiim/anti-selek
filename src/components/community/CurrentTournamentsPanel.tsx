"use client";

import Link from "next/link";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";

interface Tournament {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  players: { user: { id: string } }[];
  collabStatus?: "PENDING" | "ACCEPTED" | "REJECTED";
  communities?: Array<{
    id: string;
    name: string;
    role: "HOST" | "PARTNER";
    status: "PENDING" | "ACCEPTED" | "REJECTED";
  }>;
}

interface CurrentTournamentsPanelProps {
  tournaments: Tournament[];
  currentUserId?: string | null;
  currentCommunityId: string;
  canManageCommunity: boolean;
  onJoinTournament: (code: string) => void;
  onReviewCollabTournament: (
    code: string,
    status: "ACCEPTED" | "REJECTED"
  ) => void;
}

export function CurrentTournamentsPanel({
  tournaments,
  currentUserId,
  currentCommunityId,
  canManageCommunity,
  onJoinTournament,
  onReviewCollabTournament,
}: CurrentTournamentsPanelProps) {
  return (
    <div className="app-panel space-y-4 p-5 sm:p-6">
      <h3 className="app-section-eyebrow">
        Current Tournaments
      </h3>
      <div className="space-y-3">
        {tournaments.length === 0 ? (
          <div className="app-empty p-4 text-center">
            <p className="text-sm font-semibold text-gray-500">
              No active tournaments
            </p>
          </div>
        ) : (
          tournaments.map((tournament) => {
            const isParticipant = tournament.players.some(
              (player) => player.user.id === currentUserId
            );
            const currentCommunityLink = tournament.communities?.find(
              (community) => community.id === currentCommunityId
            );
            const canReviewCollab =
              canManageCommunity &&
              currentCommunityLink?.role === "PARTNER" &&
              currentCommunityLink.status === "PENDING";
            const isPendingCollab = tournament.collabStatus === "PENDING";
            const communityLabel =
              tournament.communities && tournament.communities.length > 1
                ? tournament.communities.map((community) => community.name).join(" + ")
                : null;

            return isParticipant ? (
              <Link
                key={tournament.id}
                href={`/session/${tournament.code}`}
                className="block rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h4 className="font-semibold text-gray-900">{tournament.name}</h4>
                  <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600">
                    {tournament.status}
                  </span>
                </div>
                <p className="text-xs font-semibold text-gray-500">
                  {tournament.players.length} Players - {getSessionTypeLabel(tournament.type)}
                </p>
                {communityLabel ? (
                  <p className="mt-1 text-xs font-semibold text-gray-500">
                    {communityLabel}
                  </p>
                ) : null}
              </Link>
            ) : (
              <div
                key={tournament.id}
                className="block rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h4 className="font-semibold text-gray-900">{tournament.name}</h4>
                  <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600">
                    {tournament.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500">
                      {tournament.players.length} Players - {getSessionTypeLabel(tournament.type)}
                    </p>
                    {communityLabel ? (
                      <p className="mt-1 text-xs font-semibold text-gray-500">
                        {communityLabel}
                      </p>
                    ) : null}
                    {isPendingCollab ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        Partner approval required before start
                      </p>
                    ) : null}
                  </div>
                  {canReviewCollab ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onReviewCollabTournament(
                            tournament.code,
                            "REJECTED"
                          )
                        }
                        className="app-button-secondary px-3 py-1.5 text-sm"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onReviewCollabTournament(
                            tournament.code,
                            "ACCEPTED"
                          )
                        }
                        className="app-button-dark px-3 py-1.5 text-sm"
                      >
                        Approve
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onJoinTournament(tournament.code)}
                      disabled={isPendingCollab}
                      className="app-button-dark px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPendingCollab ? "Pending" : "Join"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
