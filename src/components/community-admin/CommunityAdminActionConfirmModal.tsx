"use client";

import type { ReactNode } from "react";
import { ModalFrame } from "@/components/ui/chrome";

interface CommunityAdminActionConfirmModalProps {
  title: string;
  subtitle: ReactNode;
  details?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmTone?: "primary" | "danger";
  confirmationKeyword?: string;
  confirmationValue?: string;
  onConfirmationValueChange?: (value: string) => void;
  confirmationInputLabel?: string;
  confirmationHint?: ReactNode;
}

export function CommunityAdminActionConfirmModal({
  title,
  subtitle,
  details,
  confirmLabel,
  cancelLabel = "Cancel",
  isSubmitting,
  onClose,
  onConfirm,
  confirmTone = "danger",
  confirmationKeyword,
  confirmationValue = "",
  onConfirmationValueChange,
  confirmationInputLabel,
  confirmationHint,
}: CommunityAdminActionConfirmModalProps) {
  const requiresTypedConfirmation = typeof confirmationKeyword === "string";
  const isConfirmEnabled =
    !requiresTypedConfirmation || confirmationValue === confirmationKeyword;

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
            disabled={isSubmitting}
            className="app-button-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting || !isConfirmEnabled}
            className={
              confirmTone === "primary" ? "app-button-primary" : "app-button-danger"
            }
          >
            {isSubmitting ? "Working..." : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {details}
        {requiresTypedConfirmation ? (
          <label className="block space-y-2 text-sm font-medium text-gray-900">
            <span>
              {confirmationInputLabel ??
                `Type ${confirmationKeyword} to confirm`}
            </span>
            <input
              type="text"
              value={confirmationValue}
              onChange={(event) =>
                onConfirmationValueChange?.(event.target.value)
              }
              autoComplete="off"
              className="field"
            />
          </label>
        ) : null}
        {confirmationHint ? (
          <p className="text-sm text-gray-600">{confirmationHint}</p>
        ) : null}
      </div>
    </ModalFrame>
  );
}
