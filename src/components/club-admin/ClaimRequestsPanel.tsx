"use client";

import { doClaimNamesMatch } from "@/lib/clubClaimRules";
import styles from "@/features/club-admin-page/ClubAdminPage.module.css";
import type { ClubAdminClaimRequest } from "./clubAdminTypes";

interface ClaimRequestsPanelProps {
  claimRequests: ClubAdminClaimRequest[];
  reviewingClaimRequestId: string | null;
  currentUserId?: string | null;
  onReviewClaimRequest: (
    claimRequest: ClubAdminClaimRequest,
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
    <section
      className={styles.adminPanel}
      aria-labelledby="claim-requests-heading"
      data-owner-admin-panel="claims"
    >
      <div className={styles.panelHeader}>
        <div className={styles.panelHeadingCopy}>
          <p className={styles.panelEyebrow}>Profile ownership</p>
          <h3 id="claim-requests-heading">Claim requests</h3>
          <span>
            Review member requests to claim placeholder profiles.
          </span>
        </div>
        <span className={styles.countBadge}>
          {claimRequests.length} pending
        </span>
      </div>

      <div className={styles.requestList}>
        {claimRequests.length === 0 ? (
          <div className={styles.compactEmpty}>
            <p>No pending claim requests</p>
            <span>New profile claims will appear here for review.</span>
          </div>
        ) : (
          claimRequests.map((claimRequest) => {
            const hasNameMismatch = !doClaimNamesMatch(
              claimRequest.requesterName,
              claimRequest.targetName
            );

            return (
              <div
                key={claimRequest.id}
                className={styles.requestRow}
              >
                <div className={styles.claimPeopleGrid}>
                  <div className={styles.claimPerson}>
                    <p className={styles.claimLabel}>
                      Requester
                    </p>
                    <p className={styles.claimName}>
                      {claimRequest.requesterName}
                    </p>
                    <p className={styles.claimEmail}>
                      {claimRequest.requesterEmail || "No email"}
                    </p>
                  </div>
                  <div className={styles.claimPerson}>
                    <p className={styles.claimLabel}>
                      Placeholder
                    </p>
                    <p className={styles.claimName}>
                      {claimRequest.targetName}
                    </p>
                    <p className={styles.claimEmail}>
                      {claimRequest.targetEmail || "No email"}
                    </p>
                  </div>
                </div>
                {hasNameMismatch ? (
                  <div className={styles.warningNotice}>
                    <p>
                      Name mismatch
                    </p>
                    <span>
                      Confirm this placeholder belongs to the requester before approving.
                    </span>
                  </div>
                ) : null}
                {claimRequest.note ? (
                  <div className={styles.noteBox}>
                    <p>
                      Note
                    </p>
                    <span>{claimRequest.note}</span>
                  </div>
                ) : null}
                {claimRequest.linkedClubNames &&
                claimRequest.linkedClubNames.length > 1 ? (
                  <div className={styles.infoNotice}>
                    <p>
                      Linked offline identity
                    </p>
                    <span>
                      Approval also transfers this player in{" "}
                      {claimRequest.linkedClubNames.join(", ")}.
                    </span>
                  </div>
                ) : null}
                <p className={styles.claimDate}>
                  Requested {new Date(claimRequest.createdAt).toLocaleDateString()}
                </p>
                {claimRequest.requesterUserId === currentUserId ? (
                  <p className={styles.warningNote}>
                    Another admin must approve this request
                  </p>
                ) : null}
                <div className={styles.requestActions}>
                  <button
                    type="button"
                    onClick={() => onReviewClaimRequest(claimRequest, "APPROVE")}
                    disabled={
                      reviewingClaimRequestId !== null ||
                      claimRequest.requesterUserId === currentUserId
                    }
                    className={styles.approveButton}
                  >
                    {reviewingClaimRequestId === claimRequest.id ? "Working..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReviewClaimRequest(claimRequest, "REJECT")}
                    disabled={reviewingClaimRequestId !== null}
                    className={styles.rejectButton}
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
