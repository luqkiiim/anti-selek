"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  Clock,
  DotsThreeVertical,
  PencilSimple,
  Trophy,
} from "@phosphor-icons/react";
import { parseGameScores, resolveMatchResult, resolveMatchScoreInput } from "@/lib/matchRules";
import { ErrorText, Sheet } from "./Primitives";
import styles from "./SessionMatchHistory.module.css";
import "./club-collaboration.css";
import { useScrollRestoration } from "@/components/app/useScrollRestoration";

type HistoryPlayer = { id: string; name: string };

type HistoryMatch = {
  id: string;
  status: string;
  scoringFormat?: "SINGLE_GAME" | "BEST_OF_THREE";
  gameScoresJson?: string | null;
  scoreRevision?: number;
  createdAt: string;
  completedAt?: string | null;
  winnerTeam?: number | null;
  team1Score?: number | null;
  team2Score?: number | null;
  team1ClubId?: string | null;
  team2ClubId?: string | null;
  court: { courtNumber: number; label?: string | null };
  team1User1: HistoryPlayer;
  team1User2: HistoryPlayer;
  team2User1: HistoryPlayer;
  team2User2: HistoryPlayer;
};

type SessionHistoryResponse = {
  session: {
    code: string;
    clubId?: string | null;
    ratingPolicyVersion?: number;
    ratingMode?: "RATED" | "UNRATED";
    collaborationVersion?: number;
    name: string;
    status: string;
    createdAt: string;
    endedAt?: string | null;
  };
  viewerCanManage?: boolean;
  viewerCanUndoCompletedScores?: boolean;
  canCorrectCompletedScores?: boolean;
  correctionBlockedReason?: string | null;
  undoableMatchId?: string | null;
  playerProfiles?: Array<{ playerId: string; profileClubId: string | null; isGuest: boolean }>;
  matches: HistoryMatch[];
};

export type SessionMatchHistoryProps = {
  /** Session code also works for a completed session recap. */
  globalClubId?: string;
  code: string;
  onBack?: () => void;
  onMutated?: () => void | Promise<void>;
  onNavigate?: (href: string) => void;
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

class HistoryRequestError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs: number) { super(message); }
}
async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const retryAfter = response.headers?.get("Retry-After");
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    const retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : retryAfter ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 15_000;
    throw new HistoryRequestError(
      typeof payload?.error === "string"
        ? payload.error
        : `Request failed (${response.status})`, response.status, Number.isFinite(retryAfterMs) ? retryAfterMs : 15_000,
    );
  }
  return payload as T;
}

export default function SessionMatchHistory({
  code,
  onBack,
  onMutated,
  globalClubId,
  onNavigate,
}: SessionMatchHistoryProps) {
  const requestId = useRef(0);
  const request = useRef<AbortController | null>(null);
  const nextRequestAt = useRef(0);
  const scrollRef = useRef<HTMLElement>(null);
  useScrollRestoration(scrollRef, `/session/${code}/history`);
  const [response, setResponse] = useState<{
    code: string;
    data: SessionHistoryResponse;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<MatchAction | null>(null);
  const [gameDraft, setGameDraft] = useState<Array<[string,string]>>([]);
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

      if (Date.now() < nextRequestAt.current || (!showLoading && request.current)) return false;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const thisRequest = ++requestId.current;
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
      if (showLoading) setLoading(true);
      setLoadError("");

      try {
        const next = await requestJson<SessionHistoryResponse>(
          `/api/sessions/${encodeURIComponent(code)}/history${globalClubId ? `?view=global&clubId=${encodeURIComponent(globalClubId)}` : ""}`,
          { signal: controller.signal },
        );
        if (requestId.current === thisRequest) {
          setResponse({ code, data: next });
        }
        return requestId.current === thisRequest;
      } catch (error) {
        if (controller.signal.aborted && !timedOut) return false;
        if (error instanceof HistoryRequestError && error.status === 429) nextRequestAt.current = Date.now() + error.retryAfterMs;
        if (requestId.current === thisRequest) {
          setLoadError(
            timedOut ? "Match history took too long to load. Try again." : error instanceof Error
              ? error.message
              : "Unable to load match history. Try again.",
          );
        }
        return false;
      } finally {
        clearTimeout(timeout);
        if (request.current === controller) request.current = null;
        if (requestId.current === thisRequest) setLoading(false);
      }
    },
    [code, globalClubId],
  );

  useEffect(() => {
    nextRequestAt.current = 0;
    setNotice("");
    setDraft(null);
    setLoadError("");
    setResponse((current) => (current?.code === code ? current : null));
    void loadHistory(true);
    return () => {
      request.current?.abort();
      requestId.current += 1;
    };
  }, [code, loadHistory]);

  const openAction = (kind: MatchAction["kind"], match: HistoryMatch) => {
    setNotice("");
    setActionError("");
    setDraft({ kind, match });
    if (kind === "correct") {
      setGameDraft((parseGameScores(match.gameScoresJson) ?? []).map(game=>[String(game.team1Score),String(game.team2Score)]));
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
    let options: RequestInit = draft.kind === "approve" && draft.match.scoreRevision !== undefined
      ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scoreRevision:draft.match.scoreRevision??0})}
      : { method: "POST" };
    if (draft.kind === "correct" && draft.match.scoringFormat === "BEST_OF_THREE") {
      const gameScores=gameDraft.map(([a,b])=>({team1Score:Number(a),team2Score:Number(b)}));
      if (gameDraft.some(game=>game.some(score=>!score.trim())) || !resolveMatchScoreInput({scoringFormat:"BEST_OF_THREE",gameScores})) {setActionError("Record a 2–0 or 2–1 result with unequal, nonnegative whole scores.");return;}
      url=`/api/matches/${encodeURIComponent(draft.match.id)}/correction`;
      options={method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({gameScores,scoreRevision:draft.match.scoreRevision})};
    } else if (draft.kind === "correct") {
      const [team1ScoreText, team2ScoreText] = scores;
      if (!team1ScoreText.trim() || !team2ScoreText.trim()) {
        setActionError("Enter a score for both teams.");
        return;
      }
      const team1Score = Number(team1ScoreText);
      const team2Score = Number(team2ScoreText);
      if (
        !Number.isSafeInteger(team1Score) ||
        !Number.isSafeInteger(team2Score) ||
        team1Score < 0 ||
        team2Score < 0 ||
        ((data?.session.collaborationVersion ?? 1) < 2 && (team1Score > 99 || team2Score > 99))
      ) {
        setActionError("Enter nonnegative whole-number scores.");
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
        body: JSON.stringify({ team1Score, team2Score, ...(draft.match.scoreRevision !== undefined ? {scoreRevision:draft.match.scoreRevision} : {}) }),
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

  useEffect(() => {
    if (data?.session.status !== "ACTIVE" || saving) return;
    const timer = setInterval(() => { if (!document.hidden) void loadHistory(false); }, 2_000);
    return () => clearInterval(timer);
  }, [data?.session.status, saving, loadHistory]);
  function playerLink(player: HistoryPlayer, teamClubId?: string | null) {
    const stored = data?.playerProfiles?.find(p => p.playerId === player.id);
    const profileClubId = data?.session.ratingPolicyVersion === 2 && !stored?.isGuest
      ? stored?.profileClubId : teamClubId ?? data?.session.clubId;
    const params = new URLSearchParams();
    if (profileClubId) params.set("clubId", profileClubId);
    if (globalClubId && profileClubId) params.set("view", "global");
    const href = `/profile/${encodeURIComponent(player.id)}${params.size ? `?${params}` : ""}`;
    return <Link href={href} onClick={event => { if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(href); } }}>{player.name}</Link>;
  }
  const session = data?.session;
  const matches = data?.matches ?? [];
  const completedCount = matches.filter(
    (match) => match.status === "COMPLETED",
  ).length;
  const pendingCount = matches.filter(
    (match) => match.status === "PENDING_APPROVAL",
  ).length;

  return (
    <section ref={scrollRef} className={styles.history} aria-label="Session match history">
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
            : `${session?.ratingMode === "UNRATED" ? "Unrated · " : ""}${completedCount} completed ${completedCount === 1 ? "match" : "matches"}${pendingCount ? ` · ${pendingCount} awaiting approval` : ""}`}
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
                !globalClubId && (data.viewerCanUndoCompletedScores ?? data.viewerCanManage) === true &&
                data.undoableMatchId === match.id &&
                match.status === "COMPLETED";
              const canCorrect =
                !globalClubId && data.canCorrectCompletedScores === true &&
                match.status === "COMPLETED";
              const result = resolveMatchResult(match);
              const team1Won = result?.winnerTeam === 1;
              const team2Won = result?.winnerTeam === 2;
              const games = parseGameScores(match.gameScoresJson) ?? [];
              const hasScore =
                typeof match.team1Score === "number" &&
                typeof match.team2Score === "number";
              const canApprove = !globalClubId && data.viewerCanManage === true && isPending && hasScore;

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
                      <div className={styles.matchMetaActions}>
                        {isPending ? (
                          <span className={styles.pending}>Awaiting approval</span>
                        ) : null}
                        {canApprove || canCorrect || canUndo ? (
                          <details className={styles.matchOptions}>
                            <summary aria-label={`Open actions for ${courtLabel(match.court)}`}>
                              <DotsThreeVertical aria-hidden="true" size={20} weight="bold" />
                            </summary>
                            <div className={styles.matchOptionsMenu} aria-label="Host match actions">
                              {canApprove ? (
                                <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openAction("approve", match); }}>
                                  Approve result
                                </button>
                              ) : null}
                              {canCorrect ? (
                                <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openAction("correct", match); }}>
                                  <PencilSimple aria-hidden="true" size={16} /> Correct score
                                </button>
                              ) : null}
                              {canUndo ? (
                                <button className={styles.undoMenuAction} type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openAction("undo", match); }}>
                                  <ArrowCounterClockwise aria-hidden="true" size={16} /> Undo result
                                </button>
                              ) : null}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </div>

                    <div className={styles.scoreboard}>
                      <div className={`${styles.team} ${team1Won ? styles.winner : ""}`}>
                        <span className={styles.playerNames}>
                          {playerLink(match.team1User1, match.team1ClubId)}
                          <span aria-hidden="true"> &amp; </span>
                          {playerLink(match.team1User2, match.team1ClubId)}
                        </span>
                        {team1Won ? (
                          <span className={styles.winnerLabel}>
                            <Trophy aria-hidden="true" size={13} weight="fill" /> Winner
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.score} aria-label={match.scoringFormat === "BEST_OF_THREE" ? "Best of three game scores" : hasScore ? `${match.team1Score} to ${match.team2Score}` : "Score pending"}>
                        {match.scoringFormat === "BEST_OF_THREE" ? <span aria-label="Game scores" className="series-game-results">{games.map((game,index)=><span key={index}>G{index+1} {game.team1Score}–{game.team2Score}{index<games.length-1?<br/>:null}</span>)}</span> : hasScore ? (
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
                          {playerLink(match.team2User1, match.team2ClubId)}
                          <span aria-hidden="true"> &amp; </span>
                          {playerLink(match.team2User2, match.team2ClubId)}
                        </span>
                        {team2Won ? (
                          <span className={styles.winnerLabel}>
                            <Trophy aria-hidden="true" size={13} weight="fill" /> Winner
                          </span>
                        ) : null}
                      </div>
                    </div>

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
                <span className={styles.approvalScore}>{draft.match.scoringFormat === "BEST_OF_THREE" ? (parseGameScores(draft.match.gameScoresJson)??[]).map(game=>`${game.team1Score}–${game.team2Score}`).join(" · ") : `${draft.match.team1Score} : ${draft.match.team2Score}`}</span>
              ) : null}
            </div>
            {draft.kind === "correct" && draft.match.scoringFormat === "BEST_OF_THREE" ? <div className="series-score">{gameDraft.map((game,index)=><div className="series-game" key={index}><span>Game {index+1}</span>{[0,1].map(team=><input key={team} inputMode="numeric" type="text" maxLength={16} aria-label={`Game ${index+1} team ${team+1} corrected score`} value={game[team]} onChange={e=>setGameDraft(current=>current.map((item,i)=>i===index?item.map((value,j)=>j===team?e.target.value.replace(/\D/g,"").slice(0,16):value) as [string,string]:item))}/>).reduce<React.ReactNode[]>((items,input,i)=>i?[...items,<span key="divider">:</span>,input]:[input],[])}</div>)}<div className="series-actions">{gameDraft.length<3&&<button type="button" className="secondary" onClick={()=>setGameDraft(current=>[...current,["",""]])}>Add game</button>}{gameDraft.length>2&&<button type="button" className="text-button" onClick={()=>setGameDraft(current=>current.slice(0,-1))}>Remove last game</button>}</div></div> : draft.kind === "correct" ? (
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
