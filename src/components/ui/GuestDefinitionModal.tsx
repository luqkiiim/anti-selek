"use client";

import { useRef } from "react";
import { ModalFrame } from "./ModalFrame";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import {
  MixedSide,
  PlayerGender,
  SessionPool,
} from "@/types/enums";

export const GUEST_ELO_PRESETS = [
  { label: "Beginner", value: 850 },
  { label: "Average", value: 1000 },
  { label: "Advanced", value: 1200 },
] as const;

interface GuestDefinitionModalProps {
  open: boolean;
  name: string;
  initialElo: number;
  gender: PlayerGender;
  mixedSideOverride: MixedSide | null;
  pool: SessionPool;
  representingClubId: string;
  isMixed: boolean;
  poolsEnabled: boolean;
  isInterclub: boolean;
  interclubClubOptions: Array<{ id: string; name: string }>;
  submitting: boolean;
  error: string;
  onNameChange: (value: string) => void;
  onInitialEloChange: (value: number) => void;
  onGenderChange: (value: PlayerGender) => void;
  onMixedSideOverrideChange: (value: MixedSide | null) => void;
  onPoolChange: (value: SessionPool) => void;
  onRepresentingClubChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function GuestDefinitionModal({
  open,
  name,
  initialElo,
  gender,
  mixedSideOverride,
  pool,
  representingClubId,
  isMixed,
  poolsEnabled,
  isInterclub,
  interclubClubOptions,
  submitting,
  error,
  onNameChange,
  onInitialEloChange,
  onGenderChange,
  onMixedSideOverrideChange,
  onPoolChange,
  onRepresentingClubChange,
  onClose,
  onSubmit,
}: GuestDefinitionModalProps) {
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const mixedSideOption = getMixedSideOverrideOptionForGender(gender);

  return (
    <ModalFrame
      title="Add guest"
      subtitle="Not in the club roster."
      onClose={onClose}
      initialFocusRef={nameInputRef}
      backdropClassName="app-modal-backdrop-above-sheet"
      frameClassName="lg:max-w-[32rem]"
      bodyClassName="p-4 sm:p-5"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="app-button-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || name.trim().length < 2}
            className="app-button-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add guest"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium text-gray-900">
          <span>Name</span>
          <input
            ref={nameInputRef}
            type="text"
            aria-label="Guest name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "guest-definition-error" : undefined}
            className="field"
          />
        </label>

        <label className="block space-y-1.5 text-sm font-medium text-gray-900">
          <span>Starting rating</span>
          <select
            aria-label="Guest starting rating"
            value={initialElo}
            onChange={(event) =>
              onInitialEloChange(parseInt(event.target.value, 10))
            }
            className="field"
          >
            {GUEST_ELO_PRESETS.map((preset) => (
              <option key={preset.label} value={preset.value}>
                {preset.label} ({preset.value})
              </option>
            ))}
          </select>
        </label>

        {poolsEnabled ? (
          <label className="block space-y-1.5 text-sm font-medium text-gray-900">
            <span>Game group</span>
            <select
              aria-label="Guest game group"
              value={pool}
              onChange={(event) =>
                onPoolChange(event.target.value as SessionPool)
              }
              className="field"
            >
              <option value={SessionPool.A}>Competitive</option>
              <option value={SessionPool.B}>Social</option>
            </select>
          </label>
        ) : null}

        {isInterclub ? (
          <label className="block space-y-1.5 text-sm font-medium text-gray-900">
            <span>Represents</span>
            <select
              aria-label="Guest representing club"
              value={representingClubId}
              onChange={(event) =>
                onRepresentingClubChange(event.target.value)
              }
              className="field"
            >
              {interclubClubOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isMixed ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium text-gray-900">
              <span>Gender</span>
              <select
                aria-label="Guest gender"
                value={gender}
                onChange={(event) =>
                  onGenderChange(event.target.value as PlayerGender)
                }
                className="field"
              >
                <option value={PlayerGender.MALE}>Male</option>
                <option value={PlayerGender.FEMALE}>Female</option>
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-gray-900">
              <span>Mixed doubles side</span>
              <select
                aria-label="Guest mixed doubles side"
                value={mixedSideOverride ?? ""}
                onChange={(event) =>
                  onMixedSideOverrideChange(
                    event.target.value
                      ? (event.target.value as MixedSide)
                      : null
                  )
                }
                className="field"
              >
                <option value="">Default</option>
                {mixedSideOption ? (
                  <option value={mixedSideOption.value}>
                    {mixedSideOption.label}
                  </option>
                ) : null}
              </select>
            </label>
          </div>
        ) : null}

        {error ? (
          <p
            id="guest-definition-error"
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          >
            {error}
          </p>
        ) : null}
      </div>
    </ModalFrame>
  );
}
