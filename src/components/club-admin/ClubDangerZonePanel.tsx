"use client";

import styles from "@/features/club-admin-page/ClubAdminPage.module.css";

interface ClubDangerZonePanelProps {
  isTutorial?: boolean;
  resettingClub: boolean;
  deletingClub: boolean;
  onResetClub: () => void;
  onDeleteClub: () => void;
}

export function ClubDangerZonePanel({
  isTutorial = false,
  resettingClub,
  deletingClub,
  onResetClub,
  onDeleteClub,
}: ClubDangerZonePanelProps) {
  return (
    <section
      className={`${styles.adminPanel} ${styles.dangerPanel}`}
      data-owner-admin-panel="danger"
      aria-labelledby="danger-zone-heading"
    >
      <div className={styles.panelHeadingCopy}>
        <p className={styles.dangerEyebrow}>Danger zone</p>
        <h3 id="danger-zone-heading">
          {isTutorial ? "Reset playground" : "Reset or delete club"}
        </h3>
        <span>
          {isTutorial
            ? "Reset restores the original practice players, live tournament, and tutorial progress."
            : "Reset clears tournament history and ratings. Delete removes the whole club permanently."}
        </span>
      </div>

      <div className={styles.dangerActions}>
        <div className={styles.dangerAction}>
          <p>
            {isTutorial ? "Restore practice data" : "Reset tournaments and ratings"}
          </p>
          <span>
            {isTutorial
              ? "Recreates the 13 practice players, the ongoing two-court tournament, and clears tutorial progress."
              : "Deletes all tournaments in this club and returns member ratings to 1000."}
          </span>
          <button
            type="button"
            onClick={onResetClub}
            disabled={resettingClub || deletingClub}
            className={styles.resetButton}
            data-tutorial-target="admin-onboarding-reset-club"
          >
            {resettingClub
              ? "Resetting..."
              : isTutorial
                ? "Reset playground"
                : "Reset club"}
          </button>
        </div>

        {!isTutorial ? (
          <div className={`${styles.dangerAction} ${styles.deleteAction}`}>
            <p>Delete this club</p>
            <span>Permanently removes this club and all related data.</span>
            <button
              type="button"
              onClick={onDeleteClub}
              disabled={deletingClub || resettingClub}
              className={styles.deleteButton}
            >
              {deletingClub ? "Deleting..." : "Delete club"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
