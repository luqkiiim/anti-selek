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
  CaretRight,
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
type ScoreTarget = { match: Match; court: Court; correct: boolean };
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
    [saved, setSaved] = useState<Record<string, Match>>({});
  const scoreRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [name, setName] = useState(""),
    [rating, setRating] = useState("1000");
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
  function playersInMatch(match: Match) {
    return [
      match.team1User1,
      match.team1User2,
      match.team2User1,
      match.team2User2,
    ];
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
        {canManage && !ended ? (
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
            error={resource.error || standings.error || action.error}
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
                      <span className="court-status">
                        {match
                          ? "Playing now"
                          : previous
                            ? "Complete"
                            : "Available"}
                      </span>
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
                <button className="next-up" onClick={() => setSheet("next")}>
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
                  <CaretRight size={18} />
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
                <button
                  className="primary"
                  onClick={() => {
                    setName("");
                    setRating("1000");
                    setSheet("guest");
                  }}
                >
                  <Plus />
                  Add guest
                </button>
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
                      : "Next match"
          }
          busy={action.busy}
          onClose={() => setSheet("")}
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
              <Row
                title="Session settings"
                icon={GearSix}
                onClick={() => setSheet("settings")}
              />
              <Row
                title="End session"
                icon={SignOut}
                onClick={() => setSheet("end")}
              />
            </>
          ) : sheet === "settings" ? (
            <>
              <div className="setting-line">
                <span>Courts</span>
                <strong>{s?.courts.length}</strong>
              </div>
              <div className="setting-line">
                <span>Matchmaking</span>
                <strong>
                  {s?.matchmakingStyle?.toLowerCase().replaceAll("_", " ")}
                </strong>
              </div>
              <button className="primary" onClick={() => setSheet("")}>
                Done
              </button>
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
          ) : queued ? (
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
                <button
                  className="primary"
                  disabled={!s?.courts.some((c) => !c.currentMatch)}
                  onClick={() =>
                    void action.run(
                      () => api(endpoint + "/queue-match/assign", "POST"),
                      () => setSheet(""),
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
    </div>
  );
}
