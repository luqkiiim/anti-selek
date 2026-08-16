"use client";

import { useEffect, useRef } from "react";

import { validateCreateClubInput } from "./clubFormValidation";
import type { ClubFormError } from "./dashboardTypes";
import { FlashMessage, ModalFrame } from "@/components/ui/chrome";

interface CreateClubModalProps {
  open: boolean;
  clubName: string;
  clubPassword: string;
  creatingClub: boolean;
  error: ClubFormError | null;
  onClubNameChange: (value: string) => void;
  onClubPasswordChange: (value: string) => void;
  onClose: () => void;
  onCreateClub: () => void | Promise<void>;
}

export function CreateClubModal({
  open,
  clubName,
  clubPassword,
  creatingClub,
  error,
  onClubNameChange,
  onClubPasswordChange,
  onClose,
  onCreateClub,
}: CreateClubModalProps) {
  const clubNameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const genericErrorRef = useRef<HTMLDivElement | null>(null);
  const validationError = validateCreateClubInput(clubName, clubPassword);

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
      title="Create club"
      subtitle="Choose a recognizable name and add a password only if needed."
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
            form="create-club-form"
            disabled={creatingClub || validationError !== null}
            className="app-button-primary"
          >
            {creatingClub ? "Creating..." : "Create"}
          </button>
        </div>
      }
    >
      <form
        id="create-club-form"
        noValidate
        aria-busy={creatingClub}
        onSubmit={(event) => {
          event.preventDefault();
          void onCreateClub();
        }}
        className="space-y-4 px-4 py-4 sm:px-5"
      >
        {error ? (
          <div ref={genericErrorRef} tabIndex={-1} className="outline-none">
            <FlashMessage id="create-club-error" tone="error">
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
            placeholder="Unique club name"
            className="field"
            autoComplete="organization"
            disabled={creatingClub}
            aria-invalid={error?.field === "clubName" || undefined}
            aria-describedby={`create-club-name-help${
              error && (!error.field || error.field === "clubName")
                ? " create-club-error"
                : ""
            }`}
          />
          <span id="create-club-name-help" className="block text-xs text-gray-600">
            Use at least 3 characters, including a letter or number.
          </span>
        </label>
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Password <span className="font-normal text-gray-600">(optional)</span></span>
          <input
            ref={passwordRef}
            type="password"
            value={clubPassword}
            onChange={(event) => onClubPasswordChange(event.target.value)}
            placeholder="Leave blank for an open club"
            className="field"
            autoComplete="new-password"
            disabled={creatingClub}
            aria-invalid={error?.field === "password" || undefined}
            aria-describedby={`create-club-password-help${
              error && (!error.field || error.field === "password")
                ? " create-club-error"
                : ""
            }`}
          />
          <span id="create-club-password-help" className="block text-xs text-gray-600">
            If added, use at least 4 characters.
          </span>
        </label>
      </form>
    </ModalFrame>
  );
}
