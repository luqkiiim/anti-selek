"use client";

import Link from "next/link";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  doClaimNamesMatch,
  type ClaimRequesterEligibility,
} from "@/lib/communityClaimRules";
import type {
  CommunityClaimRequest,
  CommunityLeaderboardClaimState,
  CommunityPageMember,
  CommunityPageUser,
} from "./communityTypes";

interface CommunityLeaderboardPanelProps {
  title: string;
  subtitle: string;
  players: CommunityPageMember[];
  communityId: string;
  action?: ReactNode;
  showClaimControls?: boolean;
  claimState?: CommunityLeaderboardClaimState;
  onRequestClaim?: (player: CommunityPageMember) => void;
  onOpenPlayerProfile: (playerId: string) => void;
}

function shouldIgnoreCardNavigation(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest("button, a, select, input, option")
  );
}

function renderClaimControls({
  player,
  currentUser,
  currentUserClaimEligibility,
  myPendingClaimRequest,
  pendingClaimByTargetId,
  requestingClaimFor,
  onRequestClaim,
}: {
  player: CommunityPageMember;
  currentUser: CommunityPageUser | null;
  currentUserClaimEligibility: ClaimRequesterEligibility;
  myPendingClaimRequest: CommunityClaimRequest | null;
  pendingClaimByTargetId: Map<string, CommunityClaimRequest>;
  requestingClaimFor: string | null;
  onRequestClaim?: (player: CommunityPageMember) => void;
}) {
  if (
    !onRequestClaim ||
    player.isClaimed ||
    player.email !== null ||
    player.id === currentUser?.id
  ) {
    return null;
  }

  const isNameMatch =
    !!currentUser && doClaimNamesMatch(currentUser.name, player.name);
  const existingRequest = pendingClaimByTargetId.get(player.id);
  const canShowClaimControls =
    existingRequest?.requesterUserId === currentUser?.id ||
    (isNameMatch && currentUserClaimEligibility.canRequest);

  if (!canShowClaimControls) {
    return null;
  }

  const buttonDisabled =
    requestingClaimFor !== null ||
    pendingClaimByTargetId.has(player.id) ||
    (!!myPendingClaimRequest &&
      myPendingClaimRequest.targetUserId !== player.id) ||
    !currentUserClaimEligibility.canRequest;

  const statusText =
    existingRequest?.requesterUserId === currentUser?.id
      ? "Claim request submitted"
      : existingRequest
        ? "Awaiting admin review"
        : currentUserClaimEligibility.reason ??
          "Request ownership of this placeholder";

  const buttonLabel =
    existingRequest?.requesterUserId === currentUser?.id
      ? "Requested"
      : existingRequest
        ? "Pending"
        : myPendingClaimRequest
          ? "Pending Elsewhere"
          : requestingClaimFor === player.id
            ? "Sending..."
            : "Request Claim";

  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {statusText}
      </p>
      <button
        type="button"
        onClick={() => onRequestClaim(player)}
        disabled={buttonDisabled}
        className="rounded-xl bg-gray-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export function CommunityLeaderboardPanel({
  title,
  subtitle,
  players,
  communityId,
  action,
  showClaimControls = true,
  claimState,
  onRequestClaim,
  onOpenPlayerProfile,
}: CommunityLeaderboardPanelProps) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
            {title}
          </h3>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {subtitle}
          </p>
        </div>
        {action}
      </div>

      <div className="space-y-2">
        {players.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-4 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              No players yet
            </p>
          </div>
        ) : (
          players.map((player, index) => (
            <div
              key={player.id}
              role="link"
              tabIndex={0}
              onClick={(event: MouseEvent<HTMLDivElement>) => {
                if (shouldIgnoreCardNavigation(event.target)) {
                  return;
                }
                onOpenPlayerProfile(player.id);
              }}
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                if (shouldIgnoreCardNavigation(event.target)) {
                  return;
                }

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenPlayerProfile(player.id);
                }
              }}
              className="cursor-pointer rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 shrink-0 text-[10px] font-black uppercase tracking-widest text-blue-600">
                    #{index + 1}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/profile/${player.id}?communityId=${communityId}`}
                      className="text-sm font-black text-gray-900 hover:text-blue-600 hover:underline"
                    >
                      {player.name}
                    </Link>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {player.role}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-gray-900">
                    {player.elo}
                  </p>
                  <p className="whitespace-nowrap text-[10px] font-black uppercase tracking-wider">
                    <span className="text-green-600">W {player.wins}</span>
                    <span className="text-gray-300"> / </span>
                    <span className="text-red-600">L {player.losses}</span>
                  </p>
                </div>
              </div>

              {showClaimControls && claimState
                ? renderClaimControls({
                    player,
                    currentUser: claimState.currentUser,
                    currentUserClaimEligibility:
                      claimState.currentUserClaimEligibility,
                    myPendingClaimRequest: claimState.myPendingClaimRequest,
                    pendingClaimByTargetId: claimState.pendingClaimByTargetId,
                    requestingClaimFor: claimState.requestingClaimFor,
                    onRequestClaim,
                  })
                : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
