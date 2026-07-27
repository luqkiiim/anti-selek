"use client";

import type {
  ClubAdminOfflineIdentityLink,
  ClubAdminPlayer,
} from "./clubAdminTypes";
import styles from "@/features/club-admin-page/ClubAdminPage.module.css";

interface OfflineIdentityLinksPanelProps {
  links: ClubAdminOfflineIdentityLink[];
  currentClubId: string;
  currentUserId?: string | null;
  sourcePlaceholderOptions: ClubAdminPlayer[];
  sourceUserId: string;
  onSourceUserIdChange: (value: string) => void;
  targetClubSearch: string;
  onTargetClubSearchChange: (value: string) => void;
  selectedTargetClub: { id: string; name: string; membersCount: number } | null;
  targetClubCandidates: Array<{ id: string; name: string; membersCount: number }>;
  loadingTargetClubs: boolean;
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
  onSelectTargetClub: (candidate: {
    id: string;
    name: string;
    membersCount: number;
  }) => void;
  onClearTargetClub: () => void;
  onSubmitLink: () => void;
  onReviewLink: (
    link: ClubAdminOfflineIdentityLink,
    status: "ACCEPTED" | "REJECTED"
  ) => void;
  onUnlink: (link: ClubAdminOfflineIdentityLink) => void;
}

function getLinkDirection(
  link: ClubAdminOfflineIdentityLink,
  currentClubId: string
) {
  return link.sourceClubId === currentClubId ? "Outgoing" : "Incoming";
}

export function OfflineIdentityLinksPanel({
  links,
  currentClubId,
  currentUserId,
  sourcePlaceholderOptions,
  sourceUserId,
  onSourceUserIdChange,
  targetClubSearch,
  onTargetClubSearchChange,
  selectedTargetClub,
  targetClubCandidates,
  loadingTargetClubs,
  loadingTargetRoster,
  targetPlaceholderOptions,
  targetUserId,
  onTargetUserIdChange,
  submitting,
  reviewingLinkId,
  onSelectTargetClub,
  onClearTargetClub,
  onSubmitLink,
  onReviewLink,
  onUnlink,
}: OfflineIdentityLinksPanelProps) {
  const pendingLinks = links.filter((link) => link.status === "PENDING");
  const acceptedLinks = links.filter((link) => link.status === "ACCEPTED");
  const canSubmit =
    !!sourceUserId && !!selectedTargetClub && !!targetUserId && !submitting;

  return (
    <div
      className={styles.panelStack}
      data-owner-admin-panel="links"
    >
      <section
        className={`${styles.adminPanel} ${styles.linkCreatePanel}`}
        aria-labelledby="offline-links-heading"
      >
        <div className={styles.panelHeader}>
          <div className={styles.panelHeadingCopy}>
            <p className={styles.panelEyebrow}>Identity links</p>
            <h3 id="offline-links-heading">Link offline players</h3>
            <span>
              Connect placeholders only after both clubs agree they represent
              the same person.
            </span>
          </div>
          <span className={styles.countBadge}>
            {acceptedLinks.length} active
          </span>
        </div>

        <div className={styles.linkFormGrid}>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>
              <b aria-hidden="true">1</b>
              This club placeholder
            </span>
            <select
              value={sourceUserId}
              onChange={(event) => onSourceUserIdChange(event.target.value)}
              className={styles.fieldControl}
            >
              <option value="">Choose placeholder</option>
              {sourcePlaceholderOptions.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} - {player.elo}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>
              <b aria-hidden="true">2</b>
              Partner club
            </span>
            {selectedTargetClub ? (
              <div className={styles.selectedClub}>
                <span>
                  {selectedTargetClub.name}
                </span>
                <button
                  type="button"
                  onClick={onClearTargetClub}
                  className={styles.inlineButton}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="search"
                  value={targetClubSearch}
                  onChange={(event) =>
                    onTargetClubSearchChange(event.target.value)
                  }
                  className={styles.fieldControl}
                  placeholder="Search clubs"
                />
                {targetClubCandidates.length > 0 ||
                loadingTargetClubs ? (
                  <div className={styles.searchResults}>
                    {loadingTargetClubs ? (
                      <p className={styles.searchingText}>
                        Searching...
                      </p>
                    ) : (
                      targetClubCandidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => onSelectTargetClub(candidate)}
                          className={styles.searchResultButton}
                        >
                          <span>{candidate.name}</span>
                          <span>
                            {candidate.membersCount} members
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>
              <b aria-hidden="true">3</b>
              Partner placeholder
            </span>
            <select
              value={targetUserId}
              onChange={(event) => onTargetUserIdChange(event.target.value)}
              disabled={!selectedTargetClub || loadingTargetRoster}
              className={styles.fieldControl}
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

        <div className={styles.panelFooter}>
          <button
            type="button"
            onClick={onSubmitLink}
            disabled={!canSubmit}
            className={styles.primaryAction}
          >
            {submitting ? "Linking..." : "Request link"}
          </button>
        </div>
      </section>

      <section
        className={styles.adminPanel}
        aria-labelledby="link-requests-heading"
      >
        <div className={styles.panelHeader}>
          <div className={styles.panelHeadingCopy}>
            <p className={styles.panelEyebrow}>Approvals</p>
            <h3 id="link-requests-heading">Link requests</h3>
            <span>
              Incoming requests need approval from this club.
            </span>
          </div>
          <span className={styles.countBadge}>
            {pendingLinks.length} pending
          </span>
        </div>

        <div className={styles.requestList}>
          {links.length === 0 ? (
            <div className={styles.compactEmpty}>
              <p>No offline identity links yet</p>
              <span>New and accepted requests will appear here.</span>
            </div>
          ) : (
            links.map((link) => {
              const isIncomingPending =
                link.status === "PENDING" &&
                link.targetClubId === currentClubId;
              const isOwnRequest = link.requestedById === currentUserId;

              return (
                <div
                  key={link.id}
                  className={styles.requestRow}
                >
                  <div className={styles.requestRowMain}>
                    <div className={styles.requestCopy}>
                      <p className={styles.requestStatus}>
                        {getLinkDirection(link, currentClubId)} ·{" "}
                        {link.status.toLowerCase()}
                      </p>
                      <p className={styles.requestName}>
                        {link.sourceUserName} in {link.sourceClubName}
                      </p>
                      <p className={styles.requestTarget}>
                        to {link.targetUserName} in {link.targetClubName}
                      </p>
                      <p className={styles.requestDate}>
                        Requested {new Date(link.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {isIncomingPending ? (
                      <div className={styles.requestActions}>
                        <button
                          type="button"
                          onClick={() => onReviewLink(link, "ACCEPTED")}
                          disabled={reviewingLinkId !== null || isOwnRequest}
                          className={styles.approveButton}
                        >
                          {reviewingLinkId === link.id ? "Working..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onReviewLink(link, "REJECTED")}
                          disabled={reviewingLinkId !== null}
                          className={styles.rejectButton}
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
                        className={styles.neutralButton}
                      >
                        {reviewingLinkId === link.id ? "Working..." : "Unlink"}
                      </button>
                    ) : null}
                  </div>
                  {isOwnRequest && isIncomingPending ? (
                    <p className={styles.warningNote}>
                      Another admin must approve this request
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
