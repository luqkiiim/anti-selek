"use client";

import { ModalFrame } from "@/components/ui/chrome";
import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { SessionPool } from "@/types/enums";
import type {
  Court,
  ManualMatchFormState,
  ManualMatchSlot,
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
  onUpdateSlot: (slot: ManualMatchSlot, value: string) => void;
  onCreateMatch: () => void;
}

const team1Slots: ManualMatchSlot[] = ["team1User1Id", "team1User2Id"];
const team2Slots: ManualMatchSlot[] = ["team2User1Id", "team2User2Id"];

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
  onUpdateSlot,
  onCreateMatch,
}: ManualMatchModalProps) {
  if (!open) return null;

  const getPoolLabel = (pool: SessionPool) =>
    pool === SessionPool.A ? (poolAName ?? "Open") : (poolBName ?? "Regular");
  const subtitle =
    locationLabel ?? (court ? getCourtDisplayLabel(court) : "Select teams");

  function renderTeamSection(label: string, slots: ManualMatchSlot[]) {
    return (
      <div className="app-popup-card space-y-3 p-4">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {slots.map((slot, index) => (
          <select
            key={slot}
            value={manualMatchForm[slot]}
            onChange={(event) => onUpdateSlot(slot, event.target.value)}
            className="field px-3 py-2.5 text-sm"
          >
            <option value="">Choose Player {index + 1}</option>
            {manualMatchPlayerOptions.map((player) => {
              const isTakenElsewhere =
                selectedManualPlayerIds.has(player.userId) &&
                manualMatchForm[slot] !== player.userId;

              return (
                <option
                  key={player.userId}
                  value={player.userId}
                  disabled={isTakenElsewhere}
                >
                  {player.user.name}
                  {poolsEnabled ? ` - ${getPoolLabel(player.pool)}` : ""}
                  {` (${player.user.elo})`}
                </option>
              );
            })}
          </select>
        ))}
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
        {renderTeamSection("Team 1", team1Slots)}
        {renderTeamSection("Team 2", team2Slots)}

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
