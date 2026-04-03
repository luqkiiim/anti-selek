"use client";

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
  ignorePools: boolean;
  onClose: () => void;
  onIgnorePoolsChange: (value: boolean) => void;
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
  note = "This bypasses automatic balancing for this one match only. Matchmaking state still updates normally when the result is approved.",
  submitLabel = "Create Match",
  manualMatchForm,
  manualMatchPlayerOptions,
  selectedManualPlayerIds,
  creatingManualMatch,
  poolsEnabled,
  poolAName,
  poolBName,
  ignorePools,
  onClose,
  onIgnorePoolsChange,
  onUpdateSlot,
  onCreateMatch,
}: ManualMatchModalProps) {
  if (!open) return null;

  const getPoolLabel = (pool: SessionPool) =>
    pool === SessionPool.A ? (poolAName ?? "Open") : (poolBName ?? "Regular");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg animate-in slide-in-from-bottom flex-col rounded-t-3xl bg-white shadow-2xl duration-300 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-base font-black text-gray-900">{title}</h2>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {locationLabel ??
                (court ? getCourtDisplayLabel(court) : "Select Teams")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">
              Team 1
            </p>
            {team1Slots.map((slot, index) => (
              <select
                key={slot}
                value={manualMatchForm[slot]}
                onChange={(e) => onUpdateSlot(slot, e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold transition-all focus:border-blue-500 focus:outline-none"
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
                      {poolsEnabled ? ` • ${getPoolLabel(player.pool)}` : ""}
                      {` (${player.user.elo})`}
                    </option>
                  );
                })}
              </select>
            ))}
          </div>

          <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">
              Team 2
            </p>
            {team2Slots.map((slot, index) => (
              <select
                key={slot}
                value={manualMatchForm[slot]}
                onChange={(e) => onUpdateSlot(slot, e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold transition-all focus:border-blue-500 focus:outline-none"
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
                      {poolsEnabled ? ` • ${getPoolLabel(player.pool)}` : ""}
                      {` (${player.user.elo})`}
                    </option>
                  );
                })}
              </select>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-blue-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">
              Note
            </p>
            <p className="mt-1 text-xs text-blue-900">
              {note}
            </p>
            {poolsEnabled ? (
              <label className="mt-3 flex items-start gap-2 text-xs text-blue-900">
                <input
                  type="checkbox"
                  checked={ignorePools}
                  onChange={(event) => onIgnorePoolsChange(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  Ignore pool boundaries for this manual match.
                </span>
              </label>
            ) : null}
          </div>

          {manualMatchPlayerOptions.length < 4 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-bold text-amber-800">
                At least 4 available, unpaused players are required to create a
                manual match.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t bg-white p-4 sm:rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreateMatch}
            disabled={creatingManualMatch || manualMatchPlayerOptions.length < 4}
            className="rounded-xl bg-gray-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingManualMatch ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
