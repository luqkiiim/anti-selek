"use client";

import type { CommunityAdminClaimRequest } from "./communityAdminTypes";

interface ClaimRequestsPanelProps {
  claimRequests: CommunityAdminClaimRequest[];
  reviewingClaimRequestId: string | null;
  currentUserId?: string | null;
  onReviewClaimRequest: (
    claimRequest: CommunityAdminClaimRequest,
    decision: "APPROVE" | "REJECT"
  ) => void;
}

export function ClaimRequestsPanel({
  claimRequests,
  reviewingClaimRequestId,
  currentUserId,
  onReviewClaimRequest,
}: ClaimRequestsPanelProps) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
            Claim Requests
          </h3>
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
                <p className="text-sm font-black text-gray-900">
                  {claimRequest.requesterName}
                </p>
                <p className="text-xs text-gray-500">
                  {claimRequest.requesterEmail || "No email"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Placeholder
                </p>
                <p className="text-sm font-black text-gray-900">
                  {claimRequest.targetName}
                </p>
                <p className="text-xs text-gray-500">
                  {claimRequest.targetEmail || "No email"}
                </p>
              </div>
              {claimRequest.note ? (
                <div className="rounded-xl bg-white border border-gray-200 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Note
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{claimRequest.note}</p>
                </div>
              ) : null}
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Requested {new Date(claimRequest.createdAt).toLocaleDateString()}
              </p>
              {claimRequest.requesterUserId === currentUserId ? (
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                  Another admin must approve this request
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onReviewClaimRequest(claimRequest, "APPROVE")}
                  disabled={
                    reviewingClaimRequestId !== null ||
                    claimRequest.requesterUserId === currentUserId
                  }
                  className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reviewingClaimRequestId === claimRequest.id ? "Working..." : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => onReviewClaimRequest(claimRequest, "REJECT")}
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
  );
}
