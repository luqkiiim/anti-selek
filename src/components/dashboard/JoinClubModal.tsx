"use client";

import { useEffect, useRef } from "react";

import { validateJoinClubInput } from "./clubFormValidation";
import type { ClubFormError } from "./dashboardTypes";
import { FlashMessage, ModalFrame } from "@/components/ui/chrome";

interface JoinClubModalProps {
  open: boolean;
  clubName: string;
  clubPassword: string;
  joiningClub: boolean;
  error: ClubFormError | null;
  onClubNameChange: (value: string) => void;
  onClubPasswordChange: (value: string) => void;
  onClose: () => void;
  onJoinClub: () => void | Promise<void>;
}

export function JoinClubModal({
  open,
  clubName,
  clubPassword,
  joiningClub,
  error,
  onClubNameChange,
  onClubPasswordChange,
  onClose,
  onJoinClub,
}: JoinClubModalProps) {
  const clubNameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const genericErrorRef = useRef<HTMLDivElement | null>(null);
  const validationError = validateJoinClubInput(clubName, clubPassword);

  useEffect(() => {
    if (!open || !error) return;
    const target =
      error.field === "password"
        ? passwordRef.current
        : error.field === "clubName"
          ? clubNameRef.current
          : genericErrorRef.current;
    target?.focus();
  }, [error, open]);

  if (!open) return null;

  return (
    <ModalFrame
      title="Join club"
      subtitle="Enter the exact club name and its password if it has one."
      onClose={onClose}
      initialFocusRef={clubNameRef}
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
            type="submit"
            form="join-club-form"
            disabled={joiningClub || validationError !== null}
            className="app-button-dark"
          >
            {joiningClub ? "Joining..." : "Join"}
          </button>
        </div>
      }
    >
      <form
        id="join-club-form"
        noValidate
        aria-busy={joiningClub}
        onSubmit={(event) => {
          event.preventDefault();
          void onJoinClub();
        }}
        className="space-y-4 px-4 py-4 sm:px-5"
      >
        {error ? (
          <div ref={genericErrorRef} tabIndex={-1} className="outline-none">
            <FlashMessage id="join-club-error" tone="error">
              {error.error}
            </FlashMessage>
          </div>
        ) : null}
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Club name</span>
          <input
            ref={clubNameRef}
            type="text"
            value={clubName}
            onChange={(event) => onClubNameChange(event.target.value)}
            placeholder="Club name"
            className="field"
            autoComplete="organization"
            disabled={joiningClub}
            aria-invalid={error?.field === "clubName" || undefined}
            aria-describedby={`join-club-name-help${
              error && (!error.field || error.field === "clubName")
                ? " join-club-error"
                : ""
            }`}
          />
          <span id="join-club-name-help" className="block text-xs text-gray-600">
            Enter the full name shown by your club host.
          </span>
        </label>
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Password <span className="font-normal text-gray-600">(if required)</span></span>
          <input
            ref={passwordRef}
            type="password"
            value={clubPassword}
            onChange={(event) => onClubPasswordChange(event.target.value)}
            placeholder="Club password"
            className="field"
            autoComplete="current-password"
            disabled={joiningClub}
            aria-invalid={error?.field === "password" || undefined}
            aria-describedby={`join-club-password-help${
              error && (!error.field || error.field === "password")
                ? " join-club-error"
                : ""
            }`}
          />
          <span id="join-club-password-help" className="block text-xs text-gray-600">
            Protected clubs use a password of at least 4 characters.
          </span>
        </label>
      </form>
    </ModalFrame>
  );
}
