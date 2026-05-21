"use client";

import { getManualMatchSelectionOrder } from "@/app/session/[code]/manualMatchSelection";
import { Avatar } from "@/components/ui/Avatar";
import { ModalFrame } from "@/components/ui/chrome";
import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { SessionPool } from "@/types/enums";
import type {
  Court,
  ManualMatchFormState,
  Player,
} from "./sessionTypes";

interface ManualMatchModalProps {
  open: boolean;
  court: Court | null;
  title?: string;
  locationLabel?: string;
  note?: string;
  submitLabel?: string;
  manualMatchForm: ManualMatchFormState;
  manualMatchPlayerOptions: Player[];
  selectedManualPlayerIds: Set<string>;
  creatingManualMatch: boolean;
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
  onClose: () => void;
  onTogglePlayer: (userId: string) => void;
  onCreateMatch: () => void;
}

export function ManualMatchModal({
  open,
  court,
  title = "Manual Match",
  locationLabel,
  note = "This is an admin override for one match only. Pool and mixed-format restrictions are skipped, but normal safety checks still apply.",
  submitLabel = "Create Match",
  manualMatchForm,
  manualMatchPlayerOptions,
  selectedManualPlayerIds,
  creatingManualMatch,
  poolsEnabled,
  poolAName,
  poolBName,
  onClose,
  onTogglePlayer,
  onCreateMatch,
}: ManualMatchModalProps) {
  if (!open) return null;

  const getPoolLabel = (pool: SessionPool) =>
    pool === SessionPool.A ? (poolAName ?? "Open") : (poolBName ?? "Regular");
  const subtitle =
    locationLabel ?? (court ? getCourtDisplayLabel(court) : "Select teams");
  const selectedPlayerIdsInOrder = getManualMatchSelectionOrder(manualMatchForm);
  const selectedPlayersInOrder = selectedPlayerIdsInOrder
    .map((userId) =>
      manualMatchPlayerOptions.find((player) => player.userId === userId) ?? null
    )
    .filter((player): player is Player => player !== null);
  const selectedPlayersCount = selectedManualPlayerIds.size;
  const team1Players = selectedPlayersInOrder.slice(0, 2);
  const team2Players = selectedPlayersInOrder.slice(2, 4);

  function renderSelectedTeamSummary(
    label: string,
    players: Player[],
    slots: [number, number]
  ) {
    const summary =
      players.length === 0
        ? `Pick ${slots[0]} + ${slots[1]}`
        : players.length === 1
          ? `${players[0].user.name} + Pick ${slots[1]}`
          : `${players[0].user.name} + ${players[1].user.name}`;

    return (
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-2.5 py-2 shadow-sm">
        <p className="app-chip app-chip-neutral shrink-0 px-2 py-1 text-[11px]">
          {label}
        </p>
        <p className="min-w-0 truncate text-sm font-semibold text-gray-900">
          {summary}
        </p>
      </div>
    );
  }

  return (
    <ModalFrame
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      frameClassName="border-x-0 sm:border-x sm:max-w-4xl lg:max-w-5xl"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="app-button-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreateMatch}
            disabled={creatingManualMatch || manualMatchPlayerOptions.length < 4}
            className="app-button-primary"
          >
            {creatingManualMatch ? "Saving..." : submitLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-3 px-2 py-3 sm:space-y-4 sm:px-5 sm:py-4">
        <div className="app-popup-card">
          <div className="sticky top-0 z-10 space-y-2.5 border-b border-gray-200 bg-[var(--surface-strong)] px-3 py-3 shadow-[0_10px_24px_rgba(23,32,31,0.06)] sm:space-y-3 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900">Tap 4 players</p>
              <span className="app-chip app-chip-accent px-2 py-1 text-[11px]">
                {selectedPlayersCount}/4 selected
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {renderSelectedTeamSummary("T1", team1Players, [1, 2])}
              {renderSelectedTeamSummary("T2", team2Players, [3, 4])}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                Picks 1-2 form Team 1. Picks 3-4 form Team 2. Tap again to
                remove.
              </p>
              {selectedPlayersCount >= 4 ? (
                <span className="text-xs font-semibold text-gray-500">
                  Remove one to change the lineup.
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 p-3 sm:p-4">
            {manualMatchPlayerOptions.map((player) => {
              const selectionIndex = selectedPlayerIdsInOrder.indexOf(
                player.userId
              );
              const isSelected = selectedManualPlayerIds.has(player.userId);
              const isDisabled = !isSelected && selectedPlayersCount >= 4;

              return (
                <button
                  key={player.userId}
                  type="button"
                  onClick={() => onTogglePlayer(player.userId)}
                  disabled={isDisabled}
                  className={`app-touch-pan-y flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2.5 text-left transition sm:gap-3 sm:px-3 sm:py-3 ${
                    isSelected
                      ? "border-blue-200 bg-blue-50"
                      : isDisabled
                        ? "cursor-not-allowed border-gray-200 bg-gray-50/70 opacity-60"
                        : "border-gray-200 bg-gray-50/70 hover:border-blue-200 hover:bg-white"
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2 sm:gap-3">
                    <Avatar
                      name={player.user.name}
                      avatarUrl={player.user.avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {player.user.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {poolsEnabled ? `${getPoolLabel(player.pool)} - ` : ""}
                        {`Rating ${player.user.elo}`}
                      </p>
                    </div>
                  </div>

                  {isSelected ? (
                    <span className="app-chip app-chip-accent shrink-0 px-2 py-1 text-[11px]">
                      {selectionIndex < 2
                        ? `Team 1 - ${selectionIndex + 1}`
                        : `Team 2 - ${selectionIndex - 1}`}
                    </span>
                  ) : (
                    <span className="app-chip app-chip-neutral shrink-0 px-2 py-1 text-[11px]">
                      Tap
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="app-alert app-alert-warning text-sm">
          <p className="font-semibold text-gray-900">Admin override</p>
          <p className="mt-1 text-sm text-[var(--warning)]">{note}</p>
        </div>

        {manualMatchPlayerOptions.length < 4 ? (
          <div className="app-alert app-alert-warning text-sm font-semibold">
            At least 4 available, unpaused players are required to create a
            manual match.
          </div>
        ) : null}
      </div>
    </ModalFrame>
  );
}
