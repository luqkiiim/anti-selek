"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Clock3, Plus } from "lucide-react";
import { buildCourtCreateOptionStates } from "@/components/session/courtCreateOptions";
import type { CourtCreateOptionState } from "@/components/session/courtCreateOptions";
import type { Court, Player, QueuedMatch } from "@/components/session/sessionTypes";
import type { SideSpecificCourtCreateType } from "@/lib/courtCreate";
import type { GenerateMatchRequestBody } from "./sessionMatchCreation";
import { buildGenerateMatchesRequest } from "./sessionMatchCreation";
import styles from "./session-match-creation.module.css";

export interface SessionMatchCreationToolbarProps {
  isHost: boolean;
  isActive: boolean;
  hasQueuedMatch?: boolean;
  /** Eligible IDs are prepared by the session view model in court order. */
  creatableOpenCourtIds: string[];
  canQueueNextMatch: boolean;
  creatingMatches?: boolean;
  creatingQueuedMatch?: boolean;
  onGenerateMatch: (body: GenerateMatchRequestBody) => void;
  /** POST /api/sessions/{code}/queue-match, with no request body. */
  onQueueNextMatch: () => void;
}

export function SessionMatchCreationToolbar({
  isHost,
  isActive,
  hasQueuedMatch = false,
  creatableOpenCourtIds,
  canQueueNextMatch,
  creatingMatches = false,
  creatingQueuedMatch = false,
  onGenerateMatch,
  onQueueNextMatch,
}: SessionMatchCreationToolbarProps) {
  if (!isHost || !isActive || hasQueuedMatch) return null;

  if (canQueueNextMatch) {
    return (
      <div className={styles.toolbar}>
        <p>All courts are playing. Set up the next match when you’re ready.</p>
        <button
          className={`${styles.primary} ${styles.queue}`}
          type="button"
          disabled={creatingQueuedMatch || creatingMatches}
          onClick={onQueueNextMatch}
        >
          <Clock3 aria-hidden="true" size={18} />
          {creatingQueuedMatch ? "Queueing..." : "Queue Next Match"}
        </button>
      </div>
    );
  }

  const request = buildGenerateMatchesRequest(creatableOpenCourtIds);

  return (
    <div className={styles.toolbar}>
      <p>Fill each ready court with an available match.</p>
      <button
        className={styles.primary}
        type="button"
        disabled={!request || creatingMatches || creatingQueuedMatch}
        onClick={() => {
          if (request) onGenerateMatch(request);
        }}
      >
        <Plus aria-hidden="true" size={19} />
        {creatingMatches ? "Creating..." : "Create Matches"}
        {creatableOpenCourtIds.length > 1 ? (
          <span className={styles.count}>{creatableOpenCourtIds.length}</span>
        ) : null}
      </button>
    </div>
  );
}

export interface CourtMatchCreateMenuProps {
  isHost: boolean;
  isActive: boolean;
  court: Court;
  players: Player[];
  courts: Court[];
  queuedMatch: QueuedMatch | null;
  isCreating?: boolean;
  onGenerateMatch: (
    courtId: string,
    matchType?: SideSpecificCourtCreateType
  ) => void;
  onOpenManualMatch: (courtId: string) => void;
}

export function CourtMatchCreateMenu({
  isHost,
  isActive,
  court,
  players,
  courts,
  queuedMatch,
  isCreating = false,
  onGenerateMatch,
  onOpenManualMatch,
}: CourtMatchCreateMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const canShow = isHost && isActive && !court.currentMatch;
  const courtName = court.label || `Court ${court.courtNumber}`;
  const options = buildCourtCreateOptionStates({ players, courts, queuedMatch });

  useEffect(() => {
    if (!menuOpen) return;

    const closeIfOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  if (!canShow) return null;

  const handleOption = (option: CourtCreateOptionState) => {
    if (option.disabled || isCreating) return;
    setMenuOpen(false);

    if (option.key === "MANUAL") {
      onOpenManualMatch(court.id);
      return;
    }

    onGenerateMatch(
      court.id,
      option.key === "BEST" ? undefined : option.key
    );
  };

  return (
    <div className={styles.courtMenu} ref={rootRef}>
      <button
        className={styles.courtTrigger}
        type="button"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        disabled={isCreating}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Plus aria-hidden="true" size={16} />
        {isCreating ? "Creating..." : `Create on ${courtName}`}
      </button>
      {menuOpen ? (
        <div
          id={menuId}
          className={styles.options}
          role="group"
          aria-label={`Create a match on ${courtName}`}
        >
          <span className={styles.optionsLabel}>Choose a match</span>
          {options.map((option) => (
            <button
              className={`${styles.option} ${styles[`option${option.key}`]}`}
              key={option.key}
              type="button"
              disabled={option.disabled || isCreating}
              onClick={() => handleOption(option)}
            >
              <span>{option.label}</span>
              {option.detail ? <small>{option.detail}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
