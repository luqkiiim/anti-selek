"use client";

import { Avatar } from "@/components/ui/Avatar";
import { ModalFrame } from "@/components/ui/chrome";
import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { getManualMatchSelectionOrder } from "@/app/session/[code]/manualMatchSelection";
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

  function renderSelectedTeam(
    label: string,
    players: Player[],
    startIndex: number
  ) {
    return (
      <div className="app-popup-card space-y-3 p-4">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {[0, 1].map((offset) => {
          const order = startIndex + offset + 1;
          const player = players[offset] ?? null;

          return (
            <div
              key={`${label}-${order}`}
              className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-white/80 px-3 py-3"
            >
              <span className="app-chip app-chip-neutral min-w-[2.5rem] justify-center px-2 py-1 text-[11px]">
                {order}
              </span>
              {player ? (
                <>
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
                </>
              ) : (
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-500">
                    Tap player {order}
                  </p>
                  <p className="text-xs text-gray-400">
                    {order <= 2 ? "Team 1" : "Team 2"}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ModalFrame
      title={title}
      subtitle={subtitle}
      onClose={onClose}
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
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="app-popup-card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Tap 4 players</p>
            <span className="app-chip app-chip-accent px-2 py-1 text-[11px]">
              {selectedPlayersCount}/4 selected
            </span>
          </div>
          <p className="text-sm text-gray-600">
            First 2 selected are Team 1. Last 2 selected are Team 2. Tap a
            selected player again to remove them.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {renderSelectedTeam("Team 1", team1Players, 0)}
          {renderSelectedTeam("Team 2", team2Players, 2)}
        </div>

        <div className="app-popup-card space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">
              Eligible players
            </p>
            {selectedPlayersCount >= 4 ? (
              <span className="text-xs font-semibold text-gray-500">
                Remove one to change the lineup.
              </span>
            ) : null}
          </div>

          <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
            {manualMatchPlayerOptions.map((player) => {
              const selectionIndex = selectedPlayerIdsInOrder.indexOf(
                player.userId
              );
              const isSelected = selectedManualPlayerIds.has(player.userId);
              const isDisabled =
                !isSelected && selectedPlayersCount >= 4;

              return (
                <button
                  key={player.userId}
                  type="button"
                  onClick={() => onTogglePlayer(player.userId)}
                  disabled={isDisabled}
                  className={`app-touch-pan-y flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                    isSelected
                      ? "border-blue-200 bg-blue-50"
                      : isDisabled
                        ? "cursor-not-allowed border-gray-200 bg-gray-50/70 opacity-60"
                        : "border-gray-200 bg-gray-50/70 hover:border-blue-200 hover:bg-white"
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-3">
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
                        ? `Team 1 • ${selectionIndex + 1}`
                        : `Team 2 • ${selectionIndex - 1}`}
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
