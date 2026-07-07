"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import { getSessionPoolOptions } from "@/lib/sessionPools";
import { MixedSide, PlayerGender, SessionPool } from "@/types/enums";
import type { Player, PreferenceEditorState } from "./sessionTypes";

interface SessionPreferenceEditorPortalProps {
  openPreferenceEditor: PreferenceEditorState | null;
  activePreferencePlayer: Player | null;
  isAdmin: boolean;
  isCompletedSession: boolean;
  isMixicano: boolean;
  isInterclub: boolean;
  interclubClubOptions: Array<{ id: string; name: string }>;
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
  renamingGuestId: string | null;
  removingPlayerId: string | null;
  skippingNextPlayerId: string | null;
  onClose: () => void;
  onUpdatePreference: (
    userId: string,
    nextGender: PlayerGender,
    nextMixedSideOverride: MixedSide | null,
    nextPool: SessionPool,
    nextNeedsMoreRest: boolean,
    nextRepresentingClubId?: string | null
  ) => Promise<void>;
  onRequestRenameGuest: (userId: string, currentName: string) => void;
  onRequestSkipNext: (userId: string, playerName: string) => void;
  onToggleSkipNext: (userId: string, hasSkipNext: boolean) => void;
  onRemovePlayer: (userId: string, playerName: string) => void;
}

function labelClassName() {
  return "text-[11px] font-semibold text-gray-500";
}

function selectClassName() {
  return "field h-10 px-3 py-2 text-sm";
}

export function SessionPreferenceEditorPortal({
  openPreferenceEditor,
  activePreferencePlayer,
  isAdmin,
  isCompletedSession,
  isMixicano,
  isInterclub,
  interclubClubOptions,
  poolsEnabled,
  poolAName,
  poolBName,
  renamingGuestId,
  removingPlayerId,
  skippingNextPlayerId,
  onClose,
  onUpdatePreference,
  onRequestRenameGuest,
  onRequestSkipNext,
  onToggleSkipNext,
  onRemovePlayer,
}: SessionPreferenceEditorPortalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const canRender =
    !!openPreferenceEditor &&
    !!activePreferencePlayer &&
    isAdmin &&
    !isCompletedSession &&
    typeof document !== "undefined";

  useEffect(() => {
    if (!canRender) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    const attachListenerTimeout = window.setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
    }, 0);

    return () => {
      window.clearTimeout(attachListenerTimeout);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [canRender, onClose]);

  if (!canRender || !openPreferenceEditor || !activePreferencePlayer) {
    return null;
  }

  const mixedSideOption = getMixedSideOverrideOptionForGender(
    activePreferencePlayer.gender
  );
  const poolOptions = getSessionPoolOptions({
    poolsEnabled,
    poolAName,
    poolBName,
  });
  const hasSkipNext = Boolean(activePreferencePlayer.skipNextMatchAt);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Player actions for ${activePreferencePlayer.user.name}`}
      className="fixed z-[80] w-56 space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-[0_16px_34px_rgba(23,32,31,0.14)]"
      style={{
        left: openPreferenceEditor.left,
        top: openPreferenceEditor.top,
      }}
    >
      <div>
        <p className="truncate text-sm font-semibold text-gray-900">
          {activePreferencePlayer.user.name}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">Player actions</p>
      </div>

      {isMixicano ? (
        <>
          <label className="block space-y-1.5">
            <span className={labelClassName()}>Gender</span>
            <select
              value={activePreferencePlayer.gender}
              onChange={async (event) => {
                const nextGender = event.target.value as PlayerGender;
                onClose();
                await onUpdatePreference(
                  activePreferencePlayer.userId,
                  nextGender,
                  null,
                  activePreferencePlayer.pool,
                  activePreferencePlayer.needsMoreRest,
                  activePreferencePlayer.representingClubId ?? null
                );
              }}
              className={selectClassName()}
            >
              <option value={PlayerGender.MALE}>Male</option>
              <option value={PlayerGender.FEMALE}>Female</option>
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className={labelClassName()}>Mixed side</span>
            {mixedSideOption ? (
              <select
                value={activePreferencePlayer.mixedSideOverride ?? ""}
                onChange={async (event) => {
                  onClose();
                  await onUpdatePreference(
                    activePreferencePlayer.userId,
                    activePreferencePlayer.gender,
                    event.target.value ? (event.target.value as MixedSide) : null,
                    activePreferencePlayer.pool,
                    activePreferencePlayer.needsMoreRest,
                    activePreferencePlayer.representingClubId ?? null
                  );
                }}
                className={selectClassName()}
              >
                <option value="">Default</option>
                <option value={mixedSideOption.value}>{mixedSideOption.label}</option>
              </select>
            ) : (
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                Default
              </p>
            )}
          </label>
        </>
      ) : null}

      {poolsEnabled ? (
        <label className="block space-y-1.5">
          <span className={labelClassName()}>Pool</span>
          <select
            value={activePreferencePlayer.pool}
            onChange={async (event) => {
              onClose();
              await onUpdatePreference(
                activePreferencePlayer.userId,
                activePreferencePlayer.gender,
                activePreferencePlayer.mixedSideOverride ?? null,
                event.target.value as SessionPool,
                activePreferencePlayer.needsMoreRest,
                activePreferencePlayer.representingClubId ?? null
              );
            }}
            className={selectClassName()}
          >
            {poolOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {isInterclub ? (
        <label className="block space-y-1.5">
          <span className={labelClassName()}>Represents</span>
          <select
            value={activePreferencePlayer.representingClubId ?? ""}
            onChange={async (event) => {
              onClose();
              await onUpdatePreference(
                activePreferencePlayer.userId,
                activePreferencePlayer.gender,
                activePreferencePlayer.mixedSideOverride ?? null,
                activePreferencePlayer.pool,
                activePreferencePlayer.needsMoreRest,
                event.target.value || null
              );
            }}
            className={selectClassName()}
          >
            <option value="">Unassigned</option>
            {interclubClubOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={activePreferencePlayer.needsMoreRest}
          onChange={async (event) => {
            onClose();
            await onUpdatePreference(
              activePreferencePlayer.userId,
              activePreferencePlayer.gender,
              activePreferencePlayer.mixedSideOverride ?? null,
              activePreferencePlayer.pool,
              event.target.checked,
              activePreferencePlayer.representingClubId ?? null
            );
          }}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--accent)]"
        />
        <span>
          <span className="block font-semibold text-gray-900">
            More rest this session
          </span>
          <span className="mt-0.5 block">
            Prefer a lighter rotation for this player.
          </span>
        </span>
      </label>

      {!activePreferencePlayer.isPaused ? (
        <div className="border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              if (hasSkipNext) {
                onToggleSkipNext(activePreferencePlayer.userId, true);
                return;
              }

              onRequestSkipNext(
                activePreferencePlayer.userId,
                activePreferencePlayer.user.name
              );
            }}
            disabled={skippingNextPlayerId === activePreferencePlayer.userId}
            className="app-button-secondary w-full px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {skippingNextPlayerId === activePreferencePlayer.userId
              ? "Saving..."
              : hasSkipNext
                ? "Cancel Skip Next"
                : "Skip Next Match"}
          </button>
        </div>
      ) : null}

      {activePreferencePlayer.isGuest ? (
        <div className="border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onRequestRenameGuest(
                activePreferencePlayer.userId,
                activePreferencePlayer.user.name
              );
            }}
            disabled={renamingGuestId === activePreferencePlayer.userId}
            className="app-button-secondary w-full px-3 py-2.5 text-sm"
          >
            {renamingGuestId === activePreferencePlayer.userId
              ? "Opening..."
              : "Rename Guest"}
          </button>
        </div>
      ) : null}

      <div className="border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() =>
            onRemovePlayer(
              activePreferencePlayer.userId,
              activePreferencePlayer.user.name
            )
          }
          disabled={removingPlayerId === activePreferencePlayer.userId}
          className="app-button-danger w-full px-3 py-2.5 text-sm"
        >
          {removingPlayerId === activePreferencePlayer.userId
            ? "Removing..."
            : "Remove Player"}
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="flex h-9 w-full items-center justify-center rounded-lg text-sm font-semibold text-gray-500 transition hover:text-[var(--accent-strong)]"
      >
        Close
      </button>
    </div>,
    document.body
  );
}
