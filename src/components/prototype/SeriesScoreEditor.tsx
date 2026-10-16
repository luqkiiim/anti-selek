"use client";
import { useState } from "react";
import type { Match } from "@/components/session/sessionTypes";
import { parseGameScores, resolveMatchScoreInput } from "@/lib/matchRules";
import { api, ApiError } from "./api";
import { ErrorText } from "./Primitives";
import "./club-collaboration.css";

type Draft = { revision: number; games: Array<[string, string]> };
function initialGames(match: Match): Array<[string, string]> {
  const saved = parseGameScores(match.gameScoresJson) ?? [];
  return saved.length
    ? saved.map((game) => [String(game.team1Score), String(game.team2Score)])
    : [["", ""]];
}
export function SeriesScoreEditor({
  match,
  canEdit,
  onSaved,
}: {
  match: Match;
  canEdit: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const games = draft?.games ?? initialGames(match);
  function change(index: number, team: number, value: string) {
    setError("");
    const next = games.map((game) => [...game] as [string, string]);
    next[index][team] = value.replace(/\D/g, "").slice(0, 16);
    setDraft({
      revision: draft?.revision ?? match.scoreRevision ?? 0,
      games: next,
    });
  }
  async function save(finalize: boolean) {
    const nonempty = games.filter((game) => game.some((score) => score.trim()));
    if (nonempty.some((game) => game.some((score) => !score.trim())))
      return setError("Enter both scores for each game.");
    const gameScores = nonempty.map(([a, b]) => ({
      team1Score: Number(a),
      team2Score: Number(b),
    }));
    if (
      !resolveMatchScoreInput(
        { scoringFormat: "BEST_OF_THREE", gameScores },
        { allowIncomplete: !finalize },
      )
    )
      return setError(
        finalize
          ? "Record a 2–0 or 2–1 result with unequal, nonnegative whole scores."
          : "Enter unequal, nonnegative whole scores for completed games.",
      );
    setBusy(true);
    setError("");
    try {
      await api(`/api/matches/${match.id}/score`, "POST", {
        gameScores,
        finalize,
        scoreRevision: draft?.revision ?? match.scoreRevision ?? 0,
      });
      setDraft(null);
      await onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setDraft(null);
        await onSaved();
        setError(
          "This result changed. Review the refreshed scores and try again.",
        );
      } else
        setError(
          error instanceof Error ? error.message : "Unable to save scores.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="series-score" aria-label="Best of three scores">
      <strong>Best of three</strong>
      {games.map((game, index) => (
        <div key={index} className="series-game">
          <span>Game {index + 1}</span>
          {[0, 1]
            .map((team) => (
              <input
                key={team}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={16}
                aria-label={`Game ${index + 1} team ${team + 1} score`}
                disabled={!canEdit || busy}
                value={game[team]}
                onChange={(e) => change(index, team, e.target.value)}
              />
            ))
            .reduce<React.ReactNode[]>(
              (items, input, index) =>
                index
                  ? [
                      ...items,
                      <span aria-hidden="true" key="divider">
                        :
                      </span>,
                      input,
                    ]
                  : [input],
              [],
            )}
        </div>
      ))}
      <ErrorText error={error} />
      {canEdit && (
        <>
          <div className="series-actions">
            {games.length < 3 && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  setDraft({
                    revision: draft?.revision ?? match.scoreRevision ?? 0,
                    games: [...games, ["", ""]],
                  })
                }
              >
                Add game
              </button>
            )}
            {games.length > 1 && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  setDraft({
                    revision: draft?.revision ?? match.scoreRevision ?? 0,
                    games: games.slice(0, -1),
                  })
                }
              >
                Remove last game
              </button>
            )}
          </div>
          <div className="series-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void save(false)}
            >
              Save progress
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Finish match
            </button>
          </div>
        </>
      )}
    </div>
  );
}
