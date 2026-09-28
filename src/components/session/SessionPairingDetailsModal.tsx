"use client";

import { ModalFrame } from "@/components/ui/chrome";
import {
  buildSessionPairingDetails,
  type PairingDetailsMatch,
  type PairingDetailsPlayer,
  type PairingDetailsPair,
} from "@/lib/sessionPairingDetails";

function formatNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function PairRows({
  rows,
  label,
}: {
  rows: PairingDetailsPair[];
  label: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <h3 className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </h3>
      <div className="divide-y divide-gray-100">
        {rows.map((pair) => (
          <div
            key={`${pair.first.id}:${pair.second.id}`}
            title={`${pair.first.name} · ${pair.second.name}`}
            className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2 px-3 py-2 text-sm"
          >
            <span className="min-w-0 break-words text-gray-700">
              {pair.first.name} · {pair.second.name}
            </span>
            <span className="text-right font-semibold tabular-nums text-gray-900">
              {formatNumber(pair.count)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamRows({
  label,
  players,
  gamesPlayedByPlayer,
  averageRating,
}: {
  label: string;
  players: [PairingDetailsPlayer, PairingDetailsPlayer];
  gamesPlayedByPlayer: Record<string, number | null>;
  averageRating: number | null;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <h3 className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </h3>
      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3rem] gap-x-2 px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        <span />
        <span className="text-right">Rating</span>
        <span className="text-right">Played</span>
      </div>
      <div className="divide-y divide-gray-100">
        {players.map((player) => (
          <div
            key={player.id}
            className="grid grid-cols-[minmax(0,1fr)_3.5rem_3rem] items-center gap-x-2 px-3 py-2 text-sm"
          >
            <span title={player.name} className="min-w-0 break-words font-medium text-gray-800">
              {player.name}
            </span>
            <span className="text-right tabular-nums text-gray-700">
              {formatNumber(player.elo ?? null)}
            </span>
            <span className="text-right tabular-nums text-gray-700">
              {formatNumber(gamesPlayedByPlayer[player.id] ?? null)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-sm">
        <span className="font-semibold text-gray-500">Avg</span>
        <span className="font-semibold tabular-nums text-gray-900">
          {formatNumber(averageRating)}
        </span>
      </div>
    </section>
  );
}

export function SessionPairingDetailsModal({
  match,
  sessionMatches,
  onClose,
}: {
  match: PairingDetailsMatch;
  sessionMatches: PairingDetailsMatch[];
  onClose: () => void;
}) {
  const details = buildSessionPairingDetails(match, sessionMatches);

  return (
    <ModalFrame
      title="Details"
      subtitle="Current ratings"
      onClose={onClose}
      bodyClassName="p-3 sm:p-5"
      frameClassName="max-w-2xl"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TeamRows
            label="Team 1"
            players={[match.team1User1, match.team1User2]}
            gamesPlayedByPlayer={details.gamesPlayedByPlayer}
            averageRating={details.team1AverageRating}
          />
          <TeamRows
            label="Team 2"
            players={[match.team2User1, match.team2User2]}
            gamesPlayedByPlayer={details.gamesPlayedByPlayer}
            averageRating={details.team2AverageRating}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span className="font-semibold text-gray-500">Rating gap</span>
          <span className="font-semibold tabular-nums text-gray-900">
            {formatNumber(details.ratingGap)}
          </span>
        </div>

        <PairRows label="Shared court repeats" rows={details.sharedCourtPairs} />
        <PairRows label="Partner repeats" rows={details.partnerPairs} />
        <PairRows label="Opponent repeats" rows={details.opponentPairs} />
      </div>
    </ModalFrame>
  );
}
