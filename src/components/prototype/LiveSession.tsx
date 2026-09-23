"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  DotsThree,
  House,
  UsersThree,
  ChartBar,
  Plus,
  Pause,
  Play,
  Check,
  Clock,
  ClockCounterClockwise,
  GearSix,
  SignOut,
} from "@phosphor-icons/react";
import type {
  SessionData,
  Match,
  Court,
} from "@/components/session/sessionTypes";
import { api, useResource, useAction } from "./api";
import {
  Avatar,
  Sheet,
  Row,
  ErrorText,
} from "./Primitives";
import { Pager } from "./Pager";
import SessionMatchHistory from "./SessionMatchHistory";
import LivePlayerManagement from "./LivePlayerManagement";
type ScoreTarget = { match: Match; court: Court; correct: boolean };
type LiveSettingsDraft = {
  autoQueueEnabled: boolean;
  respectPlayerRest: boolean;
  courtLabels: Record<string, string>;
};
type ManualTarget =
  | { kind: "court"; courtId: string }
  | { kind: "queue"; replaceQueuedMatch: boolean };
type ControlConfirmation =
  | { kind: "court-reshuffle"; courtId: string }
  | { kind: "court-undo"; courtId: string }
  | { kind: "queue-clear" };
export default function LiveSession({
  code,
  onBack,
  onEnded,
}: {
  code: string;
  onBack: () => void;
  onEnded: () => Promise<void>;
}) {
  const endpoint = "/api/sessions/" + code;
  const resource = useResource<SessionData>(endpoint);
  const s = resource.data;
  const standings = useResource<{
    currentLeaderboard: {
      userId: string;
      name: string;
      sessionPoints: number;
    }[];
  }>(endpoint + "/leaderboard");
  const [tab, setTab] = useState("Courts"),
    [sheet, setSheet] = useState(""),
    [target, setTarget] = useState<ScoreTarget | null>(null),
    [scores, setScores] = useState<Record<string, [string, string]>>({}),
    [saved, setSaved] = useState<Record<string, Match>>({}),
    [courtControlId, setCourtControlId] = useState<string | null>(null),
    [confirmation, setConfirmation] = useState<ControlConfirmation | null>(null),
    [manualTarget, setManualTarget] = useState<ManualTarget | null>(null),
    [manualSelection, setManualSelection] = useState<string[]>([]);
  const scoreRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [name, setName] = useState(""),
    [rating, setRating] = useState("1000");
  const [showHistory, setShowHistory] = useState(false);
  const [managePlayersOpen, setManagePlayersOpen] = useState(false);
  const [liveSettingsDraft, setLiveSettingsDraft] = useState<LiveSettingsDraft | null>(null);
  const [confirmAutoQueueOff, setConfirmAutoQueueOff] = useState(false);
  const [confirmedQueueId, setConfirmedQueueId] = useState<string | null>(null);
  const sessionTabs = ["Courts", "Players", "Standings"] as const;
  function navigateTab(nextTab: string) { setTab(nextTab); }
  async function refresh() {
    await Promise.all([resource.refresh(), standings.refresh()]);
  }
  const action = useAction(refresh);
  const refreshSession=resource.refresh,refreshStandings=standings.refresh;
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !action.busy) {
        void refreshSession().catch(() => {});
        void refreshStandings().catch(() => {});
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshSession, refreshStandings, action.busy]);
  const canManage = !!s?.viewerCanManage && !s?.viewerIsQuickAccess;
  const ended = s?.status === "COMPLETED";
  const hasLiveSettingsChanges = !!(
    s && liveSettingsDraft && (
      liveSettingsDraft.autoQueueEnabled !== s.autoQueueEnabled ||
      liveSettingsDraft.respectPlayerRest !== s.respectPlayerRest ||
      s.courts.some(
        (court) =>
          (liveSettingsDraft.courtLabels[court.id] ?? "").trim() !==
          (court.label ?? "").trim(),
      )
    )
  );

  function score(m: Match): [string, string] {
    const freshMatch =
      m.status === "IN_PROGRESS" &&
      m.team1Score === 0 &&
      m.team2Score === 0 &&
      !m.completedAt;
    return (
      scores[m.id] ?? [
        freshMatch || m.team1Score == null ? "" : String(m.team1Score),
        freshMatch || m.team2Score == null ? "" : String(m.team2Score),
      ]
    );
  }
  function update(m: Match, i: number, v: string, autoAdvance: false | "court" | "sheet" = false) {
    const value = v.replace(/\D/g, "").slice(0, 2);
    setScores((prev) => {
      const next: [string, string] = [...score(m)];
      next[i] = value;
      return { ...prev, [m.id]: next };
    });
    if (autoAdvance && i === 0 && value.length === 2) {
      requestAnimationFrame(() => {
        scoreRefs.current[`${autoAdvance === "sheet" ? "sheet" : m.id}-1`]?.focus();
      });
    }
  }
  function openScore(match: Match, court: Court, correct = false) {
    setTarget({ match, court, correct });
    setSheet("score");
    action.setError("");
  }
  const queued = s?.queuedMatch;
  function playersInMatch(match: Pick<Match, "team1User1" | "team1User2" | "team2User1" | "team2User2">) {
    return [
      match.team1User1,
      match.team1User2,
      match.team2User1,
      match.team2User2,
    ];
  }
  function playerInQueue(match: NonNullable<SessionData["queuedMatch"]>) {
    return playersInMatch(match);
  }
  function playingCourtFor(userId: string) {
    return s?.courts.find((court) =>
      court.currentMatch &&
      playersInMatch(court.currentMatch).some((player) => player.id === userId),
    );
  }
  function playerStatus(player: SessionData["players"][number]) {
    const court = playingCourtFor(player.userId);
    if (court) {
      return player.isPaused
        ? "Pausing after game"
        : `Playing on ${court.label || "Court " + court.courtNumber}`;
    }
    return player.isPaused ? "Paused" : "Waiting";
  }
  const activePlayers = s?.players.filter((player) =>
    !player.isPaused || !!playingCourtFor(player.userId),
  ) ?? [];
  const pausedPlayers = s?.players.filter((player) =>
    player.isPaused && !playingCourtFor(player.userId),
  ) ?? [];
  const courtControl = s?.courts.find((court) => court.id === courtControlId) ?? null;
  const controlMatch = courtControl?.currentMatch ?? null;
  const controlQueue = s?.queuedMatch ?? null;
  function getManualPlayers(selectionTarget: ManualTarget | null): SessionData["players"] {
    if (!s || !selectionTarget) return [];
    const onCourt = new Set(
      s.courts.flatMap((court) =>
        court.currentMatch ? playersInMatch(court.currentMatch).map((player) => player.id) : [],
      ),
    );
    const queuedIds = new Set(
      s.queuedMatch ? playerInQueue(s.queuedMatch).map((player) => player.id) : [],
    );
    const mayReuseQueue = selectionTarget.kind === "queue" && selectionTarget.replaceQueuedMatch;
    return s.players
      .filter((player) =>
        !player.isPaused &&
        !onCourt.has(player.userId) &&
        (mayReuseQueue || !queuedIds.has(player.userId)),
      )
      .slice()
      .sort((a, b) => a.user.name.localeCompare(b.user.name));
  }
  const manualPlayers = getManualPlayers(manualTarget);
  async function saveScore() {
    if (!target) return;
    const values = score(target.match).map(Number);
    if (
      score(target.match).some((v) => v.trim() === "") ||
      values.some((v) => !Number.isInteger(v) || v < 0 || v > 99) ||
      values[0] === values[1]
    )
      throw new Error("Enter unequal whole scores from 0 to 99.");
    await api(
      "/api/matches/" +
        target.match.id +
        (target.correct ? "/correction" : "/score"),
      "POST",
      { team1Score: values[0], team2Score: values[1] },
    );
    setSaved((prev) => ({
      ...prev,
      [target.court.id]: {
        ...target.match,
        team1Score: values[0],
        team2Score: values[1],
      },
    }));
  }
  if (showHistory) {
    return (
      <div className="pc-app">
        <SessionMatchHistory
          code={code}
          onBack={() => setShowHistory(false)}
          onMutated={refresh}
        />
      </div>
    );
  }
  function closeSheet() {
    setSheet("");
    setCourtControlId(null);
    setConfirmation(null);
    setManualTarget(null);
    setManualSelection([]);
    setConfirmAutoQueueOff(false);
  }
  function finishControlAction() {
    setSheet("");
    setCourtControlId(null);
    setConfirmation(null);
    setManualTarget(null);
    setManualSelection([]);
  }
  function openCourtControls(court: Court) {
    setCourtControlId(court.id);
    setConfirmation(null);
    action.setError("");
    setSheet("court-controls");
  }
  function openNextControls() {
    setCourtControlId(null);
    setConfirmation(null);
    action.setError("");
    setSheet("next");
  }
  function openLiveSettings() {
    if (!s) return;
    setLiveSettingsDraft({
      autoQueueEnabled: s.autoQueueEnabled,
      respectPlayerRest: s.respectPlayerRest,
      courtLabels: Object.fromEntries(
        s.courts.map((court) => [court.id, court.label ?? ""]),
      ),
    });
    setConfirmAutoQueueOff(false);
    setConfirmedQueueId(null);
    action.setError("");
    setSheet("settings");
  }
  function changeAutoQueue(value: boolean) {
    if (!liveSettingsDraft) return;
    if (value) {
      setLiveSettingsDraft((current) => current ? { ...current, autoQueueEnabled: true } : current);
      setConfirmAutoQueueOff(false);
      setConfirmedQueueId(null);
      return;
    }
    if (s?.queuedMatch) {
      setConfirmAutoQueueOff(true);
      return;
    }
    setLiveSettingsDraft((current) => current ? { ...current, autoQueueEnabled: false } : current);
    setConfirmAutoQueueOff(false);
    setConfirmedQueueId(null);
  }
  function confirmDisableAutoQueue() {
    setLiveSettingsDraft((current) => current ? { ...current, autoQueueEnabled: false } : current);
    setConfirmedQueueId(s?.queuedMatch?.id ?? null);
    setConfirmAutoQueueOff(false);
  }
  function saveLiveSettings() {
    if (!s || !liveSettingsDraft) return;
    const queuedMatchWillBeCleared =
      !liveSettingsDraft.autoQueueEnabled && !!s.queuedMatch;
    if (queuedMatchWillBeCleared && confirmedQueueId !== s.queuedMatch?.id) {
      setConfirmAutoQueueOff(true);
      return;
    }
    const payload = {
      autoQueueEnabled: liveSettingsDraft.autoQueueEnabled,
      respectPlayerRest: liveSettingsDraft.respectPlayerRest,
      courtLabels: s.courts.map((court) => ({
        courtNumber: court.courtNumber,
        label: liveSettingsDraft.courtLabels[court.id]?.trim() || null,
      })),
    };
    void action.run(
      () => api(endpoint, "PATCH", payload),
      () => {
        setSheet("");
        setConfirmAutoQueueOff(false);
        setConfirmedQueueId(null);
      },
    );
  }
  function startManual(target: ManualTarget) {
    setManualTarget(target);
    setManualSelection([]);
    setCourtControlId(target.kind === "court" ? target.courtId : null);
    action.setError("");
    setSheet("manual-match");
  }
  function toggleManualPlayer(userId: string) {
    setManualSelection((current) => {
      if (current.includes(userId)) return current.filter((id) => id !== userId);
      if (current.length >= 4) return current;
      return [...current, userId];
    });
  }
  function startConfirmedControl(confirmation: ControlConfirmation) {
    setConfirmation(confirmation);
    action.setError("");
    setSheet("confirm-control");
  }
  async function runManualMatch() {
    if (!manualTarget || manualSelection.length !== 4) {
      throw new Error("Choose four active players for the match.");
    }
    const eligibleIds = new Set(manualPlayers.map((player) => player.userId));
    if (manualSelection.some((id) => !eligibleIds.has(id)) || new Set(manualSelection).size !== 4) {
      throw new Error("One or more selected players are no longer available. Review the lineup.");
    }
    const manualTeams = {
      team1: [manualSelection[0], manualSelection[1]],
      team2: [manualSelection[2], manualSelection[3]],
    };
    if (manualTarget.kind === "court") {
      await api(endpoint + "/generate-match", "POST", {
        courtId: manualTarget.courtId,
        manualTeams,
      });
      return;
    }
    let replacedQueuedMatch = false;
    if (manualTarget.replaceQueuedMatch) {
      await api(endpoint + "/queue-match", "DELETE");
      replacedQueuedMatch = true;
    }
    try {
      await api(endpoint + "/queue-match", "POST", { manualTeams });
    } catch (error) {
      if (replacedQueuedMatch) {
        await refresh().catch(() => {});
        const detail = error instanceof Error ? error.message : "Unable to create the manual lineup.";
        throw new Error(`The previous next match was cleared, but the manual lineup could not be queued: ${detail}`);
      }
      throw error;
    }
  }
  async function confirmControlAction() {
    if (!confirmation) return;
    if (confirmation.kind === "court-reshuffle") {
      await api(endpoint + "/generate-match", "POST", {
        courtId: confirmation.courtId,
        forceReshuffle: true,
      });
      return;
    }
    if (confirmation.kind === "court-undo") {
      await api(endpoint + "/generate-match", "POST", {
        courtId: confirmation.courtId,
        undoCurrentMatch: true,
      });
      return;
    }
    await api(endpoint + "/queue-match", "DELETE");
  }
  function runCourtPlayerAction(kind: "exclude" | "replace", userId: string) {
    if (!courtControl) return;
    void action.run(
      () => api(endpoint + "/generate-match", "POST", {
        courtId: courtControl.id,
        ...(kind === "exclude"
          ? { forceReshuffle: true, excludedUserId: userId }
          : { replaceUserId: userId }),
      }),
      finishControlAction,
    );
  }
  function runQueuePlayerAction(kind: "exclude" | "replace", userId: string) {
    if (!controlQueue) return;
    void action.run(
      () => api(endpoint + "/queue-match", "POST", {
        ...(kind === "exclude"
          ? { reshuffle: true, excludeUserId: userId }
          : { replaceUserId: userId }),
      }),
      finishControlAction,
    );
  }
  return (
    <div className="pc-app">
      <header className="pc-header">
        <button className="icon-button" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={23} />
        </button>
        <div>
          <strong>{s?.name || "Session"}</strong>
          <small>{s?.clubs?.find((c) => c.role === "HOST")?.name}</small>
        </div>
        {s && s.status !== "WAITING" ? (
          <button
            className="icon-button"
            aria-label="More options"
            onClick={() => setSheet("menu")}
          >
            <DotsThree size={26} />
          </button>
        ) : (
          <span />
        )}
      </header>
      <Pager pages={ended ? [tab] : sessionTabs} active={tab} onChange={navigateTab}>{tab => <>
          <ErrorText
            error={resource.error || standings.error || (!sheet ? action.error : "")}
          />
          {!s && <p role="status">Loading session…</p>}
          {s && ended ? (
            <>
              <div className="celebration">
                <Image width={240} height={240} src="/medallion.png" alt="Session complete" />
                <h1>Session complete!</h1>
                <p>Everyone has stopped playing.</p>
              </div>
              <h3>Standings</h3>
              <div className="roster">
                {standings.data?.currentLeaderboard.map((p, i) => (
                  <div className="person" key={p.userId}>
                    <span className="rank">{i + 1}</span>
                    <Avatar
                      name={s.players.find((player) => player.userId === p.userId)?.user.name ?? p.name}
                      url={s.players.find((player) => player.userId === p.userId)?.user.avatarUrl}
                    />
                    <span className="person-info">
                      <strong>{p.name}</strong>
                    </span>
                    <span>{p.sessionPoints} points</span>
                  </div>
                ))}
              </div>
              <button className="primary" onClick={onBack}>
                Back to club
              </button>
              <button className="secondary full" onClick={() => setShowHistory(true)}>
                Match history
              </button>
            </>
          ) : s?.status === "WAITING" ? (
            <>
              <h2>Ready to play?</h2>
              <p>
                {s.players.length} players · {s.courts.length} courts
              </p>
              {canManage && (
                <button
                  className="primary"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() => api(endpoint + "/start", "POST"))
                  }
                >
                  Start session
                </button>
              )}
            </>
          ) : s && tab === "Courts" ? (
            <>
              <div className="session-summary">
                <span>
                  <i className="live-indicator" />
                  Live session
                </span>
                <small>
                  {s.players.length} players · {s.courts.length} courts
                </small>
              </div>
              {s.courts.map((court) => {
                const match = court.currentMatch;
                const previous = saved[court.id];
                return (
                  <section className="court-card" key={court.id}>
                    <div className="section-heading">
                      <h3>{court.label || "Court " + court.courtNumber}</h3>
                      <div className="court-heading-actions">
                        <span className="court-status">
                          {match
                            ? "Playing now"
                            : previous
                              ? "Complete"
                              : "Available"}
                        </span>
                        {canManage && (
                          <button
                            className="icon-button court-more"
                            aria-label={`${court.label || "Court " + court.courtNumber} options`}
                            onClick={() => openCourtControls(court)}
                          >
                            <DotsThree size={23} />
                          </button>
                        )}
                      </div>
                    </div>
                    {match ? (
                      <>
                        {[
                          [match.team1User1, match.team1User2],
                          [match.team2User1, match.team2User2],
                        ].map((team, i) => (
                          <div className="team-row" key={i}>
                            <div className="team-players">
                              {team.map((player) => (
                                <span className="match-player" key={player.id}>
                                  <Avatar name={player.name} url={player.avatarUrl} />
                                  <strong>{player.name}</strong>
                                </span>
                              ))}
                            </div>
                            {canManage ? (
                              <>
                                <input
                                  ref={(node) => {
                                    scoreRefs.current[`${match.id}-${i}`] = node;
                                  }}
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  maxLength={2}
                                  aria-label={"Team " + (i + 1) + " score"}
                                  value={score(match)[i]}
                                  onChange={(e) =>
                                    update(match, i, e.target.value, "court")
                                  }
                                />
                              </>
                            ) : (
                              <span className="score-placeholder">
                                {score(match)[i]}
                              </span>
                            )}
                          </div>
                        ))}
                        {canManage && (
                          <button
                            className="primary"
                            onClick={() => openScore(match, court)}
                          >
                            Save score
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {previous && (
                          <>
                            <div className="saved-result">
                              <strong>
                                {previous.team1Score} <span>–</span>{" "}
                                {previous.team2Score}
                              </strong>
                              <span className="gain">
                                <Check size={17} />
                                Result saved
                              </span>
                            </div>
                            {canManage && (
                              <button
                                className="secondary full"
                                onClick={() => openScore(previous, court, true)}
                              >
                                Correct score
                              </button>
                            )}
                          </>
                        )}
                        {canManage && (
                          <button
                            className="primary"
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(() =>
                                api(endpoint + "/generate-match", "POST", {
                                  courtIds: [court.id],
                                }),
                              )
                            }
                          >
                            Start next match
                          </button>
                        )}
                      </>
                    )}
                  </section>
                );
              })}
              {queued && (
                <button className="next-up" aria-label="Next up options" onClick={openNextControls}>
                  <Clock size={21} />
                  <span>
                    <strong>Next up</strong>
                    <span className="next-up-teams">
                      <span className="next-up-team">
                        {[queued.team1User1, queued.team1User2].map((player) => (
                          <span className="match-player" key={player.id}>
                            <Avatar name={player.name} url={player.avatarUrl} />
                            <strong>{player.name}</strong>
                          </span>
                        ))}
                      </span>
                      <b>vs</b>
                      <span className="next-up-team">
                        {[queued.team2User1, queued.team2User2].map((player) => (
                          <span className="match-player" key={player.id}>
                            <Avatar name={player.name} url={player.avatarUrl} />
                            <strong>{player.name}</strong>
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                  <DotsThree size={23} />
                </button>
              )}
              {canManage && !queued && s.courts.length > 0 && s.courts.every((court) => !!court.currentMatch) && s.players.filter((player) => !player.isPaused && !playingCourtFor(player.userId)).length >= 4 && (
                <button
                  className="secondary full"
                  onClick={() => startManual({ kind: "queue", replaceQueuedMatch: false })}
                >
                  Choose next match manually
                </button>
              )}
            </>
          ) : s && tab === "Players" ? (
            <>
              <div className="section-heading">
                <h2>Players</h2>
                <small>
                  {s.players.filter((p) => p.isPaused).length} taking a break
                </small>
              </div>
              {canManage && (
                <div className="button-pair">
                  <button
                    className="primary"
                    onClick={() => {
                      setName("");
                      setRating("1000");
                      setSheet("guest");
                    }}
                  >
                    <Plus size={18} />
                    Add guest
                  </button>
                  <button className="secondary" onClick={() => setManagePlayersOpen(true)}>
                    Manage players
                  </button>
                </div>
              )}
              <div className="roster">
                {activePlayers.map((p) => (
                  <div className="person" key={p.userId}>
                    <Avatar name={p.user.name} url={p.user.avatarUrl} />
                    <span className="person-info">
                      <strong>{p.user.name}</strong>
                      <small>{playerStatus(p)} · {p.user.elo}</small>
                    </span>
                    {canManage && (
                      <button
                        className="icon-button"
                        aria-label={
                          (p.isPaused ? "Resume " : "Pause ") + p.user.name
                        }
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(() =>
                            api(endpoint + "/pause-player", "POST", {
                              userId: p.userId,
                              isPaused: !p.isPaused,
                            }),
                          )
                        }
                      >
                        {p.isPaused ? <Play size={18} /> : <Pause size={18} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {pausedPlayers.length > 0 && (
                <section className="paused-players">
                  <div className="section-heading">
                    <h3>Paused</h3>
                    <small>{pausedPlayers.length} player{pausedPlayers.length === 1 ? "" : "s"}</small>
                  </div>
                  <div className="roster">
                    {pausedPlayers.map((p) => (
                      <div className="person" key={p.userId}>
                        <Avatar name={p.user.name} url={p.user.avatarUrl} />
                        <span className="person-info">
                          <strong>{p.user.name}</strong>
                          <small>{playerStatus(p)}</small>
                        </span>
                        {canManage && (
                          <button
                            className="icon-button"
                            aria-label={`Resume ${p.user.name}`}
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(() =>
                                api(endpoint + "/pause-player", "POST", {
                                  userId: p.userId,
                                  isPaused: false,
                                }),
                              )
                            }
                          >
                            <Play size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            s && (
              <>
                <div className="section-heading">
                  <h2>Standings</h2>
                  <span className="pill">Session</span>
                </div>
                <p className="muted">Leading this session</p>
                <div className="roster">
                  {standings.data?.currentLeaderboard.map((p, i) => (
                    <div className="person" key={p.userId}>
                      <span className={"rank " + (i === 0 ? "first" : "")}>
                        {i + 1}
                      </span>
                      <Avatar
                        name={s.players.find((player) => player.userId === p.userId)?.user.name ?? p.name}
                        url={s.players.find((player) => player.userId === p.userId)?.user.avatarUrl}
                      />
                      <span className="person-info">
                        <strong>{p.name}</strong>
                      </span>
                      <span>
                        <b>{p.sessionPoints}</b>
                        <small> points</small>
                      </span>
                    </div>
                  ))}
                </div>
                <details>
                  <summary>How rankings work</summary>
                  <p>
                    Standings use this session&apos;s scoring rules. Results update
                    after scores are saved.
                  </p>
                </details>
              </>
            )
          )}
      </>}</Pager>
      {!ended && (
        <nav className="bottom-nav" aria-label="Session navigation">
          {sessionTabs.map((t, i) => {
            const Icon = [House, UsersThree, ChartBar][i];
            return (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                aria-current={tab === t ? "page" : undefined}
                onClick={() => navigateTab(t)}
              >
                <Icon size={25} weight={tab === t ? "fill" : "regular"} />
                <span>{t}</span>
              </button>
            );
          })}
        </nav>
      )}
      <Sheet open={!!sheet}
          title={
            sheet === "score"
              ? "Confirm result"
              : sheet === "menu"
                ? "Options"
                : sheet === "end"
                  ? "End this session?"
                  : sheet === "guest"
                    ? "Add guest"
                    : sheet === "settings"
                      ? "Session settings"
                      : sheet === "court-controls"
                        ? courtControl?.label || `Court ${courtControl?.courtNumber ?? ""} options`
                        : sheet === "confirm-control"
                          ? confirmation?.kind === "court-undo"
                            ? "Undo court selection?"
                            : confirmation?.kind === "queue-clear"
                              ? "Clear next match?"
                              : "Reshuffle this match?"
                          : sheet === "manual-match"
                            ? manualTarget?.kind === "court"
                              ? "Create manual match"
                              : manualTarget?.replaceQueuedMatch
                                ? "Edit next match manually"
                                : "Choose next match"
                            : "Next match"
          }
          busy={action.busy}
          onClose={closeSheet}
        >
          <ErrorText error={action.error} />
          {sheet === "score" && target ? (
            <>
              <p>{target.court.label || "Court " + target.court.courtNumber}</p>
              {[
                [target.match.team1User1, target.match.team1User2],
                [target.match.team2User1, target.match.team2User2],
              ].map((team, i) => (
                <label className="field-label" key={i}>
                  {team.map((p) => p.name).join(" & ")}
                  <input
                    ref={(node) => { scoreRefs.current[`sheet-${i}`] = node; }}
                    aria-label={"Confirm team " + (i + 1) + " score"}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={score(target.match)[i]}
                    onChange={(e) => update(target.match, i, e.target.value, "sheet")}
                  />
                </label>
              ))}
              <p className="muted">Check both scores before saving.</p>
              <button
                className="primary"
                onClick={() => void action.run(saveScore, () => setSheet(""))}
              >
                Confirm result
              </button>
              <button className="text-button" onClick={() => setSheet("")}>
                Keep editing
              </button>
            </>
          ) : sheet === "guest" ? (
            <>
              <label className="field-label">
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field-label">
                Rating
                <input
                  type="number"
                  min="0"
                  max="5000"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={
                  name.trim().length < 2 ||
                  !rating.trim() ||
                  !Number.isInteger(Number(rating)) ||
                  Number(rating) < 0 ||
                  Number(rating) > 5000
                }
                onClick={() =>
                  void action.run(
                    () =>
                      api(endpoint + "/guests", "POST", {
                        name: name.trim(),
                        initialElo: Number(rating),
                      }),
                    () => setSheet(""),
                  )
                }
              >
                Add player
              </button>
            </>
          ) : sheet === "menu" ? (
            <>
              <Row title="Match history" icon={ClockCounterClockwise} onClick={() => { setSheet(""); setShowHistory(true); }} />
              {canManage && !ended && <>
                <Row title="Session settings" icon={GearSix} onClick={openLiveSettings} />
                <Row title="End session" icon={SignOut} onClick={() => setSheet("end")} />
              </>}
            </>
          ) : sheet === "settings" ? (
            <>
              {s && liveSettingsDraft ? (
                <div className="live-settings">
                  <section className="live-settings-section" aria-labelledby="live-matchmaking-heading">
                    <h3 id="live-matchmaking-heading">Matchmaking</h3>
                    <div className="live-settings-options">
                      <div className="live-settings-row">
                        <span>
                          <strong>Prepare the next game</strong>
                          <small>Reserve four players when all courts are busy.</small>
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-label="Prepare the next game"
                          aria-checked={liveSettingsDraft.autoQueueEnabled}
                          className={`live-settings-switch${liveSettingsDraft.autoQueueEnabled ? " is-on" : ""}`}
                          onClick={() => changeAutoQueue(!liveSettingsDraft.autoQueueEnabled)}
                        >
                          {liveSettingsDraft.autoQueueEnabled ? "On" : "Off"}
                        </button>
                      </div>
                      <div className="live-settings-row">
                        <span>
                          <strong>Respect extra rest</strong>
                          <small>Use players’ saved rest preferences.</small>
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-label="Respect extra rest"
                          aria-checked={liveSettingsDraft.respectPlayerRest}
                          className={`live-settings-switch${liveSettingsDraft.respectPlayerRest ? " is-on" : ""}`}
                          onClick={() => setLiveSettingsDraft((current) => current ? {
                            ...current,
                            respectPlayerRest: !current.respectPlayerRest,
                          } : current)}
                        >
                          {liveSettingsDraft.respectPlayerRest ? "On" : "Off"}
                        </button>
                      </div>
                    </div>
                    {confirmAutoQueueOff ? (
                      <div className="live-settings-warning" role="group" aria-label="Confirm turning off Prepare the next game">
                        <p>This session has a next match queued. Saving with “Prepare the next game” off will remove it.</p>
                        <div className="live-settings-confirm-actions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => liveSettingsDraft.autoQueueEnabled
                              ? setConfirmAutoQueueOff(false)
                              : changeAutoQueue(true)}
                          >
                            {liveSettingsDraft.autoQueueEnabled ? "Keep auto queue" : "Keep the next match"}
                          </button>
                          <button
                            type="button"
                            className="live-settings-confirm-button"
                            onClick={confirmDisableAutoQueue}
                          >
                            Turn off and clear on save
                          </button>
                        </div>
                      </div>
                    ) : !liveSettingsDraft.autoQueueEnabled && s.queuedMatch ? (
                      <p className="live-settings-warning" role="status">
                        Saving will remove the current next match.
                      </p>
                    ) : null}
                  </section>

                  <section className="live-settings-section" aria-labelledby="live-courts-heading">
                    <div className="live-settings-section-heading">
                      <h3 id="live-courts-heading">Court labels</h3>
                      <p>Leave blank to use the default court name.</p>
                    </div>
                    <div className="live-settings-courts">
                      {s.courts.map((court) => (
                        <label className="live-settings-court" key={court.id}>
                          <span>Court {court.courtNumber}</span>
                          <input
                            aria-label={`Court ${court.courtNumber} label`}
                            type="text"
                            value={liveSettingsDraft.courtLabels[court.id] ?? ""}
                            maxLength={24}
                            placeholder={`Court ${court.courtNumber}`}
                            onChange={(event) => setLiveSettingsDraft((current) => current ? {
                              ...current,
                              courtLabels: {
                                ...current.courtLabels,
                                [court.id]: event.target.value,
                              },
                            } : current)}
                          />
                        </label>
                      ))}
                    </div>
                  </section>

                  <button
                    type="button"
                    className="primary"
                    disabled={!hasLiveSettingsChanges || action.busy}
                    onClick={saveLiveSettings}
                  >
                    {action.busy ? "Saving settings…" : "Save settings"}
                  </button>

                  <details className="live-settings-format">
                    <summary>
                      <strong>Session format</strong>
                      <span>Fixed while live</span>
                    </summary>
                    <div className="live-settings-readonly" aria-label="Current game format">
                      <div className="setting-line">
                        <span>Court count</span>
                        <strong>{s.courts.length}</strong>
                      </div>
                      <div className="setting-line">
                        <span>Matchmaking style</span>
                        <strong>
                          {s.matchmakingStyle?.toLowerCase().replaceAll("_", " ") || "—"}
                        </strong>
                      </div>
                    </div>
                  </details>
                </div>
              ) : <p role="status">Loading session settings…</p>}
            </>
          ) : sheet === "end" ? (
            <>
              <p>
                Finish {s?.name} and view the results? Everyone will stop
                playing.
              </p>
              {s?.courts.some((c) => c.currentMatch) && (
                <p className="muted">
                  There are unsaved court results. Save them first if you want
                  to keep them.
                </p>
              )}
              <button
                className="primary"
                onClick={() =>
                  void action.run(
                    () => api(endpoint + "/end", "POST"),
                    async () => {
                      setSheet("");
                      await onEnded();
                    },
                  )
                }
              >
                End session
              </button>
              <button className="text-button" onClick={() => setSheet("")}>
                Keep playing
              </button>
            </>
          ) : sheet === "court-controls" && courtControl ? (
            controlMatch ? (
              <>
                <p className="control-intro">
                  {courtControl.label || `Court ${courtControl.courtNumber}`} · choose how to update these players.
                </p>
                <button
                  className="secondary full control-action"
                  disabled={action.busy}
                  onClick={() => startConfirmedControl({ kind: "court-reshuffle", courtId: courtControl.id })}
                >
                  Reshuffle whole match
                </button>
                <div className="control-section">
                  <h3>Reshuffle without one player</h3>
                  <div className="control-player-list">
                    {playersInMatch(controlMatch).map((player) => (
                      <button
                        key={player.id}
                        className="control-player-button"
                        disabled={action.busy}
                        onClick={() => runCourtPlayerAction("exclude", player.id)}
                      >
                        <Avatar name={player.name} url={player.avatarUrl} />
                        <span>Leave out {player.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="control-section">
                  <h3>Replace one player</h3>
                  <div className="control-player-list">
                    {playersInMatch(controlMatch).map((player) => (
                      <button
                        key={player.id}
                        className="control-player-button"
                        disabled={action.busy}
                        onClick={() => runCourtPlayerAction("replace", player.id)}
                      >
                        <Avatar name={player.name} url={player.avatarUrl} />
                        <span>Replace {player.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {controlMatch.status === "IN_PROGRESS" && (
                  <button
                    className="secondary full control-action danger-outline"
                    disabled={action.busy}
                    onClick={() => startConfirmedControl({ kind: "court-undo", courtId: courtControl.id })}
                  >
                    Undo court selection
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="control-intro">Set a specific 2v2 lineup for this open court.</p>
                <button
                  className="primary"
                  disabled={action.busy || getManualPlayers({ kind: "court", courtId: courtControl.id }).length < 4}
                  onClick={() => startManual({ kind: "court", courtId: courtControl.id })}
                >
                  Manual 2v2 match
                </button>
                {getManualPlayers({ kind: "court", courtId: courtControl.id }).length < 4 && <p className="muted">Four active players are required.</p>}
              </>
            )
          ) : sheet === "confirm-control" && confirmation ? (
            <>
              {confirmation.kind === "court-reshuffle" ? (
                <p>Choose a different lineup for {courtControl?.label || `Court ${courtControl?.courtNumber ?? ""}`}? The current four players return to the pool.</p>
              ) : confirmation.kind === "court-undo" ? (
                <p>Return the four players on {courtControl?.label || `Court ${courtControl?.courtNumber ?? ""}`} to the available pool? The court match will be removed.</p>
              ) : (
                <p>Remove the queued next match and return its players to the available pool?</p>
              )}
              <button
                className="primary"
                disabled={action.busy}
                onClick={() => void action.run(confirmControlAction, () => {
                  finishControlAction();
                })}
              >
                {confirmation.kind === "court-reshuffle" ? "Reshuffle match" : confirmation.kind === "court-undo" ? "Undo selection" : "Clear next match"}
              </button>
              <button className="text-button" disabled={action.busy} onClick={() => {
                const returnSheet = confirmation.kind === "queue-clear" ? "next" : "court-controls";
                setConfirmation(null);
                setSheet(returnSheet);
              }}>
                Keep current lineup
              </button>
            </>
          ) : sheet === "manual-match" && manualTarget ? (
            <>
              <p className="control-intro">
                {manualTarget.kind === "queue" && manualTarget.replaceQueuedMatch
                  ? "Choose four active players. Saving replaces the current Next up match."
                  : manualTarget.kind === "queue"
                    ? "Choose four active players for the next match."
                    : `Choose four active players for ${s?.courts.find((court) => court.id === manualTarget.courtId)?.label || "this court"}.`}
              </p>
              {manualSelection.length > 0 && (
                <div className="manual-team-summary">
                  <div><strong>Team 1</strong><span>{manualSelection.slice(0, 2).map((id) => manualPlayers.find((p) => p.userId === id)?.user.name).filter(Boolean).join(" & ") || "Choose two players"}</span></div>
                  <b>vs</b>
                  <div><strong>Team 2</strong><span>{manualSelection.slice(2, 4).map((id) => manualPlayers.find((p) => p.userId === id)?.user.name).filter(Boolean).join(" & ") || "Choose two players"}</span></div>
                </div>
              )}
              <div className="manual-player-list">
                {manualPlayers.map((player) => {
                  const selectionIndex = manualSelection.indexOf(player.userId);
                  return (
                    <button
                      key={player.userId}
                      className="manual-player-option"
                      aria-pressed={selectionIndex >= 0}
                      disabled={action.busy || (selectionIndex < 0 && manualSelection.length >= 4)}
                      onClick={() => toggleManualPlayer(player.userId)}
                    >
                      <Avatar name={player.user.name} url={player.user.avatarUrl} />
                      <strong>{player.user.name}</strong>
                      <span>{selectionIndex < 0 ? "Add" : `Team ${selectionIndex < 2 ? 1 : 2} · ${selectionIndex % 2 + 1}`}</span>
                    </button>
                  );
                })}
              </div>
              {manualPlayers.length < 4 && <p className="muted">Four active players are required.</p>}
              <p className="muted" aria-live="polite">{Math.min(manualSelection.length, 4)} of 4 selected</p>
              <button
                className="primary"
                disabled={action.busy || manualSelection.length !== 4 || manualPlayers.length < 4}
                onClick={() => void action.run(runManualMatch, () => {
                  finishControlAction();
                })}
              >
                {manualTarget.kind === "queue" ? "Save next match" : "Create match"}
              </button>
            </>
          ) : sheet === "next" && queued ? (
            <>
              <div className="next-teams">
                <div className="next-team">
                  {[queued.team1User1, queued.team1User2].map((player) => (
                    <span className="match-player" key={player.id}>
                      <Avatar name={player.name} url={player.avatarUrl} />
                      <strong>{player.name}</strong>
                    </span>
                  ))}
                </div>
                <span>vs</span>
                <div className="next-team">
                  {[queued.team2User1, queued.team2User2].map((player) => (
                    <span className="match-player" key={player.id}>
                      <Avatar name={player.name} url={player.avatarUrl} />
                      <strong>{player.name}</strong>
                    </span>
                  ))}
                </div>
              </div>
              <p className="muted">
                {s?.courts.some((c) => !c.currentMatch)
                  ? "A court is ready."
                  : "Courts are still in use."}
              </p>
              {canManage && (
                <>
                  <button
                    className="secondary full control-action"
                    disabled={action.busy}
                    onClick={() => void action.run(
                      () => api(endpoint + "/queue-match", "POST", { reshuffle: true }),
                      finishControlAction,
                    )}
                  >
                    Reshuffle next match
                  </button>
                  <div className="control-section">
                    <h3>Reshuffle without one player</h3>
                    <div className="control-player-list">
                      {playerInQueue(queued).map((player) => (
                        <button
                          key={player.id}
                          className="control-player-button"
                          disabled={action.busy}
                          onClick={() => runQueuePlayerAction("exclude", player.id)}
                        >
                          <Avatar name={player.name} url={player.avatarUrl} />
                          <span>Leave out {player.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="control-section">
                    <h3>Replace one player</h3>
                    <div className="control-player-list">
                      {playerInQueue(queued).map((player) => (
                        <button
                          key={player.id}
                          className="control-player-button"
                          disabled={action.busy}
                          onClick={() => runQueuePlayerAction("replace", player.id)}
                        >
                          <Avatar name={player.name} url={player.avatarUrl} />
                          <span>Replace {player.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    className="secondary full"
                    disabled={action.busy}
                    onClick={() => startManual({ kind: "queue", replaceQueuedMatch: true })}
                  >
                    Edit manually
                  </button>
                  <button
                    className="secondary full danger-outline"
                    disabled={action.busy}
                    onClick={() => startConfirmedControl({ kind: "queue-clear" })}
                  >
                    Clear next match
                  </button>
                </>
              )}
              {canManage && (
                <button
                  className="primary"
                  disabled={!s?.courts.some((c) => !c.currentMatch)}
                  onClick={() =>
                    void action.run(
                      () => api(endpoint + "/queue-match/assign", "POST"),
                      finishControlAction,
                    )
                  }
                >
                  Start next match
                </button>
              )}
            </>
          ) : (
            <p>No match queued yet.</p>
          )}
      </Sheet>
      {s && <LivePlayerManagement
        code={code}
        session={s}
        open={managePlayersOpen && canManage && !ended}
        onClose={() => setManagePlayersOpen(false)}
        onChanged={refresh}
      />}
    </div>
  );
}
