"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  Clock,
  PencilSimple,
  Trophy,
} from "@phosphor-icons/react";
import { ErrorText, Sheet } from "./Primitives";
import styles from "./SessionMatchHistory.module.css";

type HistoryPlayer = { id: string; name: string };

type HistoryMatch = {
  id: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  winnerTeam?: number | null;
  team1Score?: number | null;
  team2Score?: number | null;
  court: { courtNumber: number; label?: string | null };
  team1User1: HistoryPlayer;
  team1User2: HistoryPlayer;
  team2User1: HistoryPlayer;
  team2User2: HistoryPlayer;
};

type SessionHistoryResponse = {
  session: {
    code: string;
    name: string;
    status: string;
    createdAt: string;
    endedAt?: string | null;
  };
  viewerCanManage?: boolean;
  canCorrectCompletedScores?: boolean;
  correctionBlockedReason?: string | null;
  undoableMatchId?: string | null;
  matches: HistoryMatch[];
};

export type SessionMatchHistoryProps = {
  /** Session code also works for a completed session recap. */
  code: string;
  onBack?: () => void;
  onMutated?: () => void | Promise<void>;
};

type MatchAction = { kind: "approve" | "correct" | "undo"; match: HistoryMatch };

function courtLabel(court: HistoryMatch["court"]) {
  return court.label?.trim() || `Court ${court.courtNumber}`;
}

function matchTime(match: HistoryMatch) {
  return match.completedAt ?? match.createdAt;
}

function formatMatchTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Request failed (${response.status})`,
    );
  }
  return payload as T;
}

export default function SessionMatchHistory({
  code,
  onBack,
  onMutated,
}: SessionMatchHistoryProps) {
  const requestId = useRef(0);
  const [response, setResponse] = useState<{
    code: string;
    data: SessionHistoryResponse;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<MatchAction | null>(null);
  const [scores, setScores] = useState<[string, string]>(["", ""]);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const data = response?.code === code ? response.data : null;

  const loadHistory = useCallback(
    async (showLoading = true) => {
      if (!code.trim()) {
        setLoadError("Enter a session code to view match history.");
        setLoading(false);
        return false;
      }

      const thisRequest = ++requestId.current;
      if (showLoading) setLoading(true);
      setLoadError("");

      try {
        const next = await requestJson<SessionHistoryResponse>(
          `/api/sessions/${encodeURIComponent(code)}/history`,
        );
        if (requestId.current === thisRequest) {
          setResponse({ code, data: next });
        }
        return requestId.current === thisRequest;
      } catch (error) {
        if (requestId.current === thisRequest) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load match history. Try again.",
          );
        }
        return false;
      } finally {
        if (requestId.current === thisRequest) setLoading(false);
      }
    },
    [code],
  );

  useEffect(() => {
    setNotice("");
    setDraft(null);
    setLoadError("");
    setResponse((current) => (current?.code === code ? current : null));
    void loadHistory(true);
    return () => {
      requestId.current += 1;
    };
  }, [code, loadHistory]);

  const openAction = (kind: MatchAction["kind"], match: HistoryMatch) => {
    setNotice("");
    setActionError("");
    setDraft({ kind, match });
    if (kind === "correct") {
      setScores([
        typeof match.team1Score === "number" ? String(match.team1Score) : "",
        typeof match.team2Score === "number" ? String(match.team2Score) : "",
      ]);
    }
  };

  const closeAction = () => {
    if (saving) return;
    setDraft(null);
    setActionError("");
  };

  const submitAction = async () => {
    if (!draft) return;
    setActionError("");

    let url = `/api/matches/${encodeURIComponent(draft.match.id)}/${draft.kind === "approve" ? "approve" : "undo"}`;
    let options: RequestInit = { method: "POST" };
    if (draft.kind === "correct") {
      const [team1ScoreText, team2ScoreText] = scores;
      if (!team1ScoreText.trim() || !team2ScoreText.trim()) {
        setActionError("Enter a score for both teams.");
        return;
      }
      const team1Score = Number(team1ScoreText);
      const team2Score = Number(team2ScoreText);
      if (
        !Number.isInteger(team1Score) ||
        !Number.isInteger(team2Score) ||
        team1Score < 0 ||
        team2Score < 0 ||
        team1Score > 99 ||
        team2Score > 99
      ) {
        setActionError("Enter whole-number scores from 0 to 99.");
        return;
      }
      if (team1Score === team2Score) {
        setActionError("One team must have a higher score.");
        return;
      }
      if (
        team1Score === draft.match.team1Score &&
        team2Score === draft.match.team2Score
      ) {
        setActionError("Enter a different score to correct this match.");
        return;
      }
      url = `/api/matches/${encodeURIComponent(draft.match.id)}/correction`;
      options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1Score, team2Score }),
      };
    }

    setSaving(true);
    try {
      await requestJson(url, options);
      const completedAction = draft.kind;
      setDraft(null);
      setNotice(completedAction === "correct" ? "Score corrected." : completedAction === "approve" ? "Result approved." : "Result undone.");
      await loadHistory(false);
      await Promise.resolve(onMutated?.()).catch(() => undefined);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : draft.kind === "correct"
            ? "Unable to correct this score. Try again."
            : draft.kind === "approve"
              ? "Unable to approve this result. Try again."
              : "Unable to undo this result. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const session = data?.session;
  const matches = data?.matches ?? [];
  const completedCount = matches.filter(
    (match) => match.status === "COMPLETED",
  ).length;
  const pendingCount = matches.filter(
    (match) => match.status === "PENDING_APPROVAL",
  ).length;

  return (
    <section className={styles.history} aria-label="Session match history">
      <header className={styles.header}>
        <div className={styles.headingLine}>
          {onBack ? (
            <button
              className={styles.backButton}
              type="button"
              onClick={onBack}
              aria-label="Back to session"
            >
              <ArrowLeft aria-hidden="true" size={20} />
            </button>
          ) : null}
          <div className={styles.headingCopy}>
            <span className={styles.eyebrow}>SESSION MATCHES</span>
            <h1>{session?.name ?? "Match history"}</h1>
          </div>
          {session ? (
            <span
              className={`${styles.sessionState} ${session.status === "ACTIVE" ? styles.live : ""}`}
            >
              {session.status === "ACTIVE" ? "Live" : "Completed"}
            </span>
          ) : null}
        </div>
        <p className={styles.summary}>
          {loading && !data
            ? "Loading recorded matches…"
            : `${completedCount} completed ${completedCount === 1 ? "match" : "matches"}${pendingCount ? ` · ${pendingCount} awaiting approval` : ""}`}
        </p>
      </header>

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}
      {data?.correctionBlockedReason ? (
        <p className={styles.correctionInfo} role="note">
          {data.correctionBlockedReason}
        </p>
      ) : null}

      {loadError && !data ? (
        <div className={styles.loadError}>
          <ErrorText error={loadError} />
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => void loadHistory(true)}
          >
            Try again
          </button>
        </div>
      ) : null}

      {loadError && data ? (
        <div className={styles.loadError}>
          <ErrorText error={loadError} />
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => void loadHistory(true)}
          >
            Refresh history
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className={styles.loading} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>Loading match history</span>
        </div>
      ) : null}

      {!loading && data && matches.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <Clock size={24} />
          </span>
          <h2>No matches recorded yet</h2>
          <p>Completed results will appear here as players finish their matches.</p>
        </div>
      ) : null}

      {data && matches.length > 0 ? (
        <>
          <ol className={styles.matchList}>
            {matches.map((match) => {
              const timestamp = matchTime(match);
              const isPending = match.status === "PENDING_APPROVAL";
              const canUndo =
                data.viewerCanManage === true &&
                data.undoableMatchId === match.id &&
                match.status === "COMPLETED";
              const canCorrect =
                data.canCorrectCompletedScores === true &&
                match.status === "COMPLETED";
              const team1Won = match.winnerTeam === 1;
              const team2Won = match.winnerTeam === 2;
              const hasScore =
                typeof match.team1Score === "number" &&
                typeof match.team2Score === "number";
              const canApprove = data.viewerCanManage === true && isPending && hasScore;

              return (
                <li className={styles.matchItem} key={match.id}>
                  <article className={styles.matchCard}>
                    <div className={styles.matchMeta}>
                      <div className={styles.matchPlace}>
                        <span className={styles.court}>{courtLabel(match.court)}</span>
                        <time dateTime={timestamp} className={styles.date}>
                          {formatMatchTime(timestamp)}
                        </time>
                      </div>
                      {isPending ? (
                        <span className={styles.pending}>Awaiting approval</span>
                      ) : null}
                    </div>

                    <div className={styles.scoreboard}>
                      <div className={`${styles.team} ${team1Won ? styles.winner : ""}`}>
                        <span className={styles.playerNames}>
                          {match.team1User1.name}
                          <span aria-hidden="true"> &amp; </span>
                          {match.team1User2.name}
                        </span>
                        {team1Won ? (
                          <span className={styles.winnerLabel}>
                            <Trophy aria-hidden="true" size={13} weight="fill" /> Winner
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.score} aria-label={hasScore ? `${match.team1Score} to ${match.team2Score}` : "Score pending"}>
                        {hasScore ? (
                          <>
                            <strong>{match.team1Score}</strong>
                            <span>:</span>
                            <strong>{match.team2Score}</strong>
                          </>
                        ) : (
                          <span className={styles.pendingScore}>Pending</span>
                        )}
                      </div>
                      <div className={`${styles.team} ${styles.teamRight} ${team2Won ? styles.winner : ""}`}>
                        <span className={styles.playerNames}>
                          {match.team2User1.name}
                          <span aria-hidden="true"> &amp; </span>
                          {match.team2User2.name}
                        </span>
                        {team2Won ? (
                          <span className={styles.winnerLabel}>
                            <Trophy aria-hidden="true" size={13} weight="fill" /> Winner
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {canApprove || canCorrect || canUndo ? (
                      <div className={styles.matchActions} aria-label="Host match actions">
                        {canApprove ? (
                          <button className={styles.actionButton} type="button" onClick={() => openAction("approve", match)}>
                            Approve result
                          </button>
                        ) : null}
                        {canCorrect ? (
                          <button
                            className={styles.actionButton}
                            type="button"
                            onClick={() => openAction("correct", match)}
                          >
                            <PencilSimple aria-hidden="true" size={16} />
                            Correct score
                          </button>
                        ) : null}
                        {canUndo ? (
                          <button
                            className={`${styles.actionButton} ${styles.undoButton}`}
                            type="button"
                            onClick={() => openAction("undo", match)}
                          >
                            <ArrowCounterClockwise aria-hidden="true" size={16} />
                            Undo result
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}

      {draft ? (
        <Sheet
          title={draft.kind === "correct" ? "Correct match score" : draft.kind === "approve" ? "Approve match result" : "Undo match result"}
          busy={saving}
          onClose={closeAction}
        >
          <div className={styles.sheetBody}>
            <p className={styles.sheetLead}>
              {draft.kind === "correct"
                ? "Standings and ratings will be recalculated from this match onward."
                : draft.kind === "approve"
                  ? "Confirm these scores to update standings and ratings."
                  : "This removes the result and reverses its standings impact. You can enter the result again later."}
            </p>
            <div className={styles.sheetMatch}>
              <span>{courtLabel(draft.match.court)}</span>
              <span>{formatMatchTime(matchTime(draft.match))}</span>
              <strong>
                {draft.match.team1User1.name} &amp; {draft.match.team1User2.name}
              </strong>
              <strong>
                {draft.match.team2User1.name} &amp; {draft.match.team2User2.name}
              </strong>
              {draft.kind === "approve" ? (
                <span className={styles.approvalScore}>{draft.match.team1Score} : {draft.match.team2Score}</span>
              ) : null}
            </div>
            {draft.kind === "correct" ? (
              <div className={styles.scoreFields}>
                <label>
                  <span>Team A score</span>
                  <input
                    inputMode="numeric"
                    type="number"
                    min="0"
                    max="99"
                    step="1"
                    value={scores[0]}
                    onChange={(event) =>
                      setScores(([, team2]) => [event.target.value, team2])
                    }
                    aria-label="Team A corrected score"
                  />
                </label>
                <span className={styles.scoreDivider} aria-hidden="true">:</span>
                <label>
                  <span>Team B score</span>
                  <input
                    inputMode="numeric"
                    type="number"
                    min="0"
                    max="99"
                    step="1"
                    value={scores[1]}
                    onChange={(event) =>
                      setScores(([team1]) => [team1, event.target.value])
                    }
                    aria-label="Team B corrected score"
                  />
                </label>
              </div>
            ) : null}
            <ErrorText error={actionError} />
            <div className={styles.sheetActions}>
              <button
                className={styles.cancelAction}
                type="button"
                onClick={closeAction}
                disabled={saving}
              >
                {draft.kind === "approve" ? "Review later" : "Keep result"}
              </button>
              <button
                className={`${styles.confirmAction} ${draft.kind === "undo" ? styles.confirmUndo : ""}`}
                type="button"
                onClick={() => void submitAction()}
                disabled={saving}
              >
                {saving
                  ? "Saving…"
                  : draft.kind === "correct"
                    ? "Save correction"
                    : draft.kind === "approve"
                      ? "Approve result"
                      : "Undo result"}
              </button>
            </div>
          </div>
        </Sheet>
      ) : null}
    </section>
  );
}
