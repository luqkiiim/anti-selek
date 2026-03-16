"use client";

import type { ReactNode } from "react";
import { ModalFrame } from "@/components/ui/chrome";

interface CommunityActionConfirmModalProps {
  title: string;
  subtitle: ReactNode;
  details?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CommunityActionConfirmModal({
  title,
  subtitle,
  details,
  confirmLabel,
  cancelLabel = "Cancel",
  isSubmitting,
  onClose,
  onConfirm,
}: CommunityActionConfirmModalProps) {
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
            disabled={isSubmitting}
            className="app-button-danger"
          >
            {isSubmitting ? "Working..." : confirmLabel}
          </button>
        </div>
      }
    >
      {details ? <div className="space-y-4 px-4 py-4 sm:px-5">{details}</div> : null}
    </ModalFrame>
  );
}
