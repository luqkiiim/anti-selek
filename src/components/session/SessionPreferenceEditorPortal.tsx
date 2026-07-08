"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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

interface PopoverPosition {
  key: string;
  left: number;
  top: number;
}

const DESKTOP_POPOVER_WIDTH = 224;
const POPOVER_MARGIN = 8;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function labelClassName() {
  return "text-[11px] font-semibold text-gray-500";
}

function selectClassName(isSheet: boolean) {
  return cx("field px-3 py-2 text-sm", isSheet ? "h-11" : "h-10");
}

function sectionTitleClassName() {
  return "text-xs font-semibold text-gray-500";
}

interface ActionSectionProps {
  title?: string;
  className?: string;
  children: ReactNode;
}

function ActionSection({ title, className, children }: ActionSectionProps) {
  return (
    <section className={cx("space-y-3", className)}>
      {title ? <h3 className={sectionTitleClassName()}>{title}</h3> : null}
      {children}
    </section>
  );
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
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [popoverPosition, setPopoverPosition] =
    useState<PopoverPosition | null>(null);
  const canRender =
    !!openPreferenceEditor &&
    !!activePreferencePlayer &&
    isAdmin &&
    !isCompletedSession &&
    typeof document !== "undefined";
  const isSheet = openPreferenceEditor?.placement === "sheet";
  const isPopover = openPreferenceEditor?.placement === "popover";
  const popoverPositionKey =
    openPreferenceEditor?.placement === "popover"
      ? [
          openPreferenceEditor.userId,
          openPreferenceEditor.anchor.top,
          openPreferenceEditor.anchor.right,
          openPreferenceEditor.anchor.bottom,
          openPreferenceEditor.anchor.left,
        ].join(":")
      : null;

  useEffect(() => {
    if (!canRender) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        !isSheet &&
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const attachListenerTimeout = window.setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      window.clearTimeout(attachListenerTimeout);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [canRender, isSheet, onClose]);

  useLayoutEffect(() => {
    if (
      !canRender ||
      !openPreferenceEditor ||
      openPreferenceEditor.placement !== "popover" ||
      !popoverPositionKey
    ) {
      return;
    }

    const anchor = openPreferenceEditor.anchor;
    const measureTimeout = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const panelRect = panel.getBoundingClientRect();
      const panelWidth = panelRect.width || DESKTOP_POPOVER_WIDTH;
      const panelHeight = panelRect.height || Math.min(panel.scrollHeight || 320, 512);
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxLeft = Math.max(
        POPOVER_MARGIN,
        viewportWidth - panelWidth - POPOVER_MARGIN
      );
      const left = clamp(anchor.right - panelWidth, POPOVER_MARGIN, maxLeft);
      const spaceBelow = viewportHeight - anchor.bottom - POPOVER_MARGIN;
      const spaceAbove = anchor.top - POPOVER_MARGIN;
      const shouldOpenUp = spaceBelow < panelHeight && spaceAbove > spaceBelow;
      const preferredTop = shouldOpenUp
        ? anchor.top - panelHeight - POPOVER_MARGIN
        : anchor.bottom + POPOVER_MARGIN;
      const maxTop = Math.max(
        POPOVER_MARGIN,
        viewportHeight - panelHeight - POPOVER_MARGIN
      );
      const top = clamp(preferredTop, POPOVER_MARGIN, maxTop);

      setPopoverPosition((previous) =>
        previous?.key === popoverPositionKey &&
        previous.left === left &&
        previous.top === top
          ? previous
          : { key: popoverPositionKey, left, top }
      );
    }, 0);

    return () => {
      window.clearTimeout(measureTimeout);
    };
  }, [
    activePreferencePlayer,
    canRender,
    interclubClubOptions.length,
    isInterclub,
    isMixicano,
    isPopover,
    openPreferenceEditor,
    poolsEnabled,
    popoverPositionKey,
  ]);

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
  const actionButtonClassName = cx(
    "w-full px-3 text-sm",
    isSheet ? "min-h-11 py-2.5" : "py-2.5"
  );

  const preferenceControls = (
    <>
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
              className={selectClassName(Boolean(isSheet))}
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
                className={selectClassName(Boolean(isSheet))}
              >
                <option value="">Default</option>
                <option value={mixedSideOption.value}>
                  {mixedSideOption.label}
                </option>
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
            className={selectClassName(Boolean(isSheet))}
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
            className={selectClassName(Boolean(isSheet))}
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

      <label
        className={cx(
          "flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs text-gray-600",
          isSheet ? "min-h-11 py-3" : "py-2"
        )}
      >
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

      {activePreferencePlayer.isGuest ? (
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
          className={cx("app-button-secondary", actionButtonClassName)}
        >
          {renamingGuestId === activePreferencePlayer.userId
            ? "Opening..."
            : "Rename Guest"}
        </button>
      ) : null}
    </>
  );

  const rotationControls = !activePreferencePlayer.isPaused ? (
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
      className={cx(
        "app-button-secondary disabled:cursor-not-allowed disabled:opacity-50",
        actionButtonClassName
      )}
    >
      {skippingNextPlayerId === activePreferencePlayer.userId
        ? "Saving..."
        : hasSkipNext
          ? "Cancel Skip Next"
          : "Skip Next Match"}
    </button>
  ) : null;

  const dangerControls = (
    <button
      type="button"
      onClick={() =>
        onRemovePlayer(
          activePreferencePlayer.userId,
          activePreferencePlayer.user.name
        )
      }
      disabled={removingPlayerId === activePreferencePlayer.userId}
      className={cx("app-button-danger", actionButtonClassName)}
    >
      {removingPlayerId === activePreferencePlayer.userId
        ? "Removing..."
        : "Remove Player"}
    </button>
  );

  if (isSheet) {
    return createPortal(
      <div
        className="fixed inset-0 z-[90]"
        data-session-player-actions-layout="sheet"
      >
        <button
          type="button"
          aria-label="Close player actions"
          className="absolute inset-0 h-full w-full cursor-default bg-[rgba(23,32,31,0.34)]"
          data-session-player-actions-backdrop="true"
          onClick={onClose}
        />
        <div className="absolute inset-x-0 bottom-0 flex max-h-[min(86dvh,40rem)] flex-col overflow-hidden rounded-t-2xl border-t border-gray-200 bg-white shadow-[0_-18px_42px_rgba(23,32,31,0.18)]">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={subtitleId}
            tabIndex={-1}
            className="relative z-10 flex min-h-0 flex-col"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-300" />
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 px-4 pb-3 pt-3">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="truncate text-base font-semibold text-gray-900"
                >
                  {activePreferencePlayer.user.name}
                </h2>
                <p id={subtitleId} className="mt-0.5 text-sm text-gray-500">
                  Player actions
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-[rgba(15,118,110,0.28)] hover:text-[var(--accent-strong)]"
              >
                <X aria-hidden="true" size={19} strokeWidth={2.2} />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-y-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] [touch-action:pan-y]">
              <div className="space-y-5">
                <ActionSection title="Preferences">
                  {preferenceControls}
                </ActionSection>

                {rotationControls ? (
                  <ActionSection title="Rotation">
                    {rotationControls}
                  </ActionSection>
                ) : null}

                <ActionSection
                  title="Danger"
                  className="border-t border-gray-200 pt-4"
                >
                  {dangerControls}
                </ActionSection>
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const popoverStyle =
    isPopover && popoverPosition?.key === popoverPositionKey
      ? { left: popoverPosition.left, top: popoverPosition.top }
      : isPopover
        ? {
            left: openPreferenceEditor.anchor.right - DESKTOP_POPOVER_WIDTH,
            top: openPreferenceEditor.anchor.bottom + POPOVER_MARGIN,
            visibility: "hidden" as const,
          }
        : undefined;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      tabIndex={-1}
      className="fixed z-[90] max-h-[min(32rem,calc(100dvh-1rem))] w-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 shadow-[0_16px_34px_rgba(23,32,31,0.14)]"
      style={popoverStyle}
      data-session-player-actions-layout="popover"
    >
      <div>
        <p id={titleId} className="truncate text-sm font-semibold text-gray-900">
          {activePreferencePlayer.user.name}
        </p>
        <p id={subtitleId} className="mt-0.5 text-xs text-gray-500">
          Player actions
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {preferenceControls}

        {rotationControls ? (
          <div className="border-t border-gray-100 pt-3">
            {rotationControls}
          </div>
        ) : null}

        <div className="border-t border-gray-100 pt-3">{dangerControls}</div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-full items-center justify-center rounded-lg text-sm font-semibold text-gray-500 transition hover:text-[var(--accent-strong)]"
        >
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}
