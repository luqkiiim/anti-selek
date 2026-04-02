"use client";

import { createPortal } from "react-dom";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import { MixedSide, PlayerGender } from "@/types/enums";
import type { Player, PreferenceEditorState } from "./sessionTypes";

interface SessionPreferenceEditorPortalProps {
  openPreferenceEditor: PreferenceEditorState | null;
  activePreferencePlayer: Player | null;
  isAdmin: boolean;
  isCompletedSession: boolean;
  isMixicano: boolean;
  renamingGuestId: string | null;
  removingPlayerId: string | null;
  onClose: () => void;
  onUpdatePreference: (
    userId: string,
    nextGender: PlayerGender,
    nextMixedSideOverride: MixedSide | null
  ) => Promise<void>;
  onRequestRenameGuest: (userId: string, currentName: string) => void;
  onRemovePlayer: (userId: string, playerName: string) => void;
}

export function SessionPreferenceEditorPortal({
  openPreferenceEditor,
  activePreferencePlayer,
  isAdmin,
  isCompletedSession,
  isMixicano,
  renamingGuestId,
  removingPlayerId,
  onClose,
  onUpdatePreference,
  onRequestRenameGuest,
  onRemovePlayer,
}: SessionPreferenceEditorPortalProps) {
  if (
    !openPreferenceEditor ||
    !activePreferencePlayer ||
    !isAdmin ||
    isCompletedSession ||
    typeof document === "undefined"
  ) {
    return null;
  }

  const mixedSideOption = getMixedSideOverrideOptionForGender(
    activePreferencePlayer.gender
  );

  return createPortal(
    <div
      className="fixed z-[80] w-44 space-y-2 rounded-xl border border-gray-200 bg-white p-2.5 shadow-2xl"
      style={{
        left: openPreferenceEditor.left,
        top: openPreferenceEditor.top,
      }}
    >
      {isMixicano ? (
        <>
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
              Gender
            </p>
            <select
              value={activePreferencePlayer.gender}
              onChange={async (e) => {
                const nextGender = e.target.value as PlayerGender;
                onClose();
                await onUpdatePreference(
                  activePreferencePlayer.userId,
                  nextGender,
                  null
                );
              }}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-[10px] font-black uppercase tracking-wide text-gray-700 focus:border-blue-400 focus:outline-none"
            >
              <option value={PlayerGender.MALE}>Male</option>
              <option value={PlayerGender.FEMALE}>Female</option>
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
              Mixed Side
            </p>
            {mixedSideOption ? (
              <select
                value={activePreferencePlayer.mixedSideOverride ?? ""}
                onChange={async (e) => {
                  onClose();
                  await onUpdatePreference(
                    activePreferencePlayer.userId,
                    activePreferencePlayer.gender,
                    e.target.value ? (e.target.value as MixedSide) : null
                  );
                }}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-[10px] font-black uppercase tracking-wide text-gray-700 focus:border-blue-400 focus:outline-none"
              >
                <option value="">Default</option>
                <option value={mixedSideOption.value}>{mixedSideOption.label}</option>
              </select>
            ) : (
              <p className="px-1 py-2 text-[10px] font-black uppercase tracking-wide text-gray-500">
                Default
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="px-0.5 text-[9px] font-black uppercase tracking-wider text-gray-400">
          Player Actions
        </p>
      )}
      {activePreferencePlayer.isGuest ? (
        <div className="border-t border-gray-100 pt-1">
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
            className="h-8 w-full rounded-lg border border-blue-200 bg-blue-50 text-[10px] font-black uppercase tracking-wide text-blue-700 disabled:opacity-50"
          >
            {renamingGuestId === activePreferencePlayer.userId
              ? "Opening..."
              : "Rename Guest"}
          </button>
        </div>
      ) : null}
      <div className="border-t border-gray-100 pt-1">
        <button
          type="button"
          onClick={() =>
            onRemovePlayer(
              activePreferencePlayer.userId,
              activePreferencePlayer.user.name
            )
          }
          disabled={removingPlayerId === activePreferencePlayer.userId}
          className="h-8 w-full rounded-lg border border-rose-200 bg-rose-50 text-[10px] font-black uppercase tracking-wide text-rose-700 disabled:opacity-50"
        >
          {removingPlayerId === activePreferencePlayer.userId
            ? "Removing..."
            : "Remove Player"}
        </button>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-[9px] font-black uppercase tracking-widest text-gray-500"
        >
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}
