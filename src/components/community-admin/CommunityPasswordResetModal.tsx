"use client";

import type { FormEvent } from "react";
import { FlashMessage, ModalFrame } from "@/components/ui/chrome";
import type { CommunityAdminPlayer } from "./communityAdminTypes";

interface CommunityPasswordResetModalProps {
  target: CommunityAdminPlayer | null;
  passwordResetValue: string;
  passwordResetConfirm: string;
  passwordResetError: string;
  savingPasswordReset: boolean;
  onPasswordResetValueChange: (value: string) => void;
  onPasswordResetConfirmChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function CommunityPasswordResetModal({
  target,
  passwordResetValue,
  passwordResetConfirm,
  passwordResetError,
  savingPasswordReset,
  onPasswordResetValueChange,
  onPasswordResetConfirmChange,
  onClose,
  onSubmit,
}: CommunityPasswordResetModalProps) {
  if (!target) return null;

  return (
    <ModalFrame
      title="Reset member password"
      subtitle="Set a new sign-in password here, then share it with the player manually."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="app-button-secondary px-4 py-2"
            disabled={savingPasswordReset}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="reset-member-password-form"
            className="app-button-primary px-4 py-2"
            disabled={savingPasswordReset}
          >
            {savingPasswordReset ? "Saving..." : "Save password"}
          </button>
        </div>
      }
    >
      <form
        id="reset-member-password-form"
        onSubmit={onSubmit}
        className="space-y-4 px-4 py-4 sm:px-5"
      >
        <div className="app-panel-muted space-y-1 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Member
          </p>
          <p className="text-sm font-semibold text-gray-900">{target.name}</p>
          <p className="text-sm text-gray-600">{target.email}</p>
        </div>

        {passwordResetError ? (
          <FlashMessage tone="error">{passwordResetError}</FlashMessage>
        ) : null}

        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>New password</span>
          <input
            type="password"
            value={passwordResetValue}
            onChange={(event) => onPasswordResetValueChange(event.target.value)}
            className="field"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>

        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Confirm password</span>
          <input
            type="password"
            value={passwordResetConfirm}
            onChange={(event) =>
              onPasswordResetConfirmChange(event.target.value)
            }
            className="field"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>

        <p className="text-sm text-gray-600">
          This replaces the player&apos;s existing sign-in password immediately.
        </p>
      </form>
    </ModalFrame>
  );
}
