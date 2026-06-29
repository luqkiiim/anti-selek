"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, Upload, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarCropModal } from "@/components/ui/AvatarCropModal";
import {
  getAvatarSourceValidationError,
  getAvatarUploadValidationError,
} from "@/lib/avatar";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Something went wrong while updating the avatar.";
}

export function AvatarUploader({
  name,
  avatarUrl,
  size = "xl",
  editable = true,
  helperText,
  presentation = "inline",
  onPreviewAvatar,
  previewAvatarLabel,
  onUpload,
  onRemove,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "lg" | "xl" | "hero";
  editable?: boolean;
  helperText?: string;
  presentation?: "inline" | "menu";
  onPreviewAvatar?: (avatarUrl: string) => void;
  previewAvatarLabel?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const currentAvatarUrl = previewUrl ?? avatarUrl ?? null;
  const canPreviewAvatar = !!currentAvatarUrl && !!onPreviewAvatar;

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      ) {
        return;
      }

      setMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (cropSourceUrl) {
        URL.revokeObjectURL(cropSourceUrl);
      }
    };
  }, [cropSourceUrl]);

  const handleChooseFile = () => {
    if (!editable || uploading || removing) {
      return;
    }

    setMenuOpen(false);
    inputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const validationError = getAvatarSourceValidationError({
      mimeType: file.type,
      size: file.size,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl);
    }

    const nextCropSourceUrl = URL.createObjectURL(file);
    setCropSourceFile(file);
    setCropSourceUrl(nextCropSourceUrl);
    setError("");
  };

  const handleCloseCropModal = () => {
    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl);
    }

    setCropSourceFile(null);
    setCropSourceUrl(null);
  };

  const handleConfirmCrop = async (file: File) => {
    const validationError = getAvatarUploadValidationError({
      mimeType: file.type,
      size: file.size,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(nextPreviewUrl);
    setError("");
    setUploading(true);

    try {
      await onUpload(file);
      URL.revokeObjectURL(nextPreviewUrl);
      setPreviewUrl(null);
    } catch (uploadError) {
      URL.revokeObjectURL(nextPreviewUrl);
      setPreviewUrl(null);
      setError(getErrorMessage(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setError("");
    setRemoving(true);
    setMenuOpen(false);

    try {
      await onRemove();
    } catch (removeError) {
      setError(getErrorMessage(removeError));
    } finally {
      setRemoving(false);
    }
  };

  const avatarControl = canPreviewAvatar ? (
    <button
      type="button"
      onClick={() => onPreviewAvatar(currentAvatarUrl)}
      className="rounded-full transition hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      aria-label={previewAvatarLabel ?? `View profile photo of ${name}`}
    >
      <Avatar name={name} avatarUrl={currentAvatarUrl} size={size} />
    </button>
  ) : (
    <Avatar name={name} avatarUrl={currentAvatarUrl} size={size} />
  );

  if (presentation === "menu" && editable) {
    return (
      <div className="space-y-3">
        <div ref={menuRef} className="relative inline-flex">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => void handleFileChange(event)}
          />
          <button
            type="button"
            onClick={() => {
              if (!uploading && !removing) {
                setMenuOpen((value) => !value);
              }
            }}
            disabled={uploading || removing}
            className="relative rounded-full transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label={`${avatarUrl ? "Change" : "Add"} profile photo for ${name}`}
            aria-expanded={menuOpen}
          >
            <Avatar name={name} avatarUrl={currentAvatarUrl} size={size} />
            <span className="absolute bottom-1 right-1 inline-flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-white bg-[var(--accent)] text-white shadow-[0_8px_18px_rgba(15,118,110,0.22)]">
              <Camera aria-hidden="true" size={16} strokeWidth={2.3} />
            </span>
          </button>
          {menuOpen ? (
            <div className="absolute left-0 top-[calc(100%+0.6rem)] z-30 grid min-w-44 overflow-hidden rounded-xl border border-[var(--line)] bg-white text-sm font-semibold text-gray-900 shadow-[0_18px_44px_rgba(23,32,31,0.18)]">
              <button
                type="button"
                onClick={handleChooseFile}
                disabled={uploading || removing}
                className="inline-flex items-center gap-2 border-b border-[var(--line)] px-3 py-3 text-left transition hover:bg-[var(--accent-faint)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Camera aria-hidden="true" size={17} strokeWidth={2.1} />
                {uploading
                  ? "Uploading..."
                  : avatarUrl
                    ? "Change photo"
                    : "Add photo"}
              </button>
              {avatarUrl ? (
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={uploading || removing}
                  className="inline-flex items-center gap-2 px-3 py-3 text-left text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 aria-hidden="true" size={17} strokeWidth={2.1} />
                  {removing ? "Removing..." : "Remove"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {helperText ? <p className="text-sm text-gray-600">{helperText}</p> : null}
        {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
        <AvatarCropModal
          file={cropSourceFile}
          imageUrl={cropSourceUrl}
          onClose={handleCloseCropModal}
          onConfirm={(file) => {
            void handleConfirmCrop(file);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
        {avatarControl}
        {editable ? (
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void handleFileChange(event)}
            />
            <button
              type="button"
              onClick={handleChooseFile}
              disabled={uploading || removing}
              className="app-button-secondary inline-flex items-center gap-2 px-4 py-2"
            >
              <Upload aria-hidden="true" size={15} />
              {uploading ? "Uploading..." : avatarUrl ? "Replace photo" : "Upload photo"}
            </button>
            {avatarUrl ? (
              <button
                type="button"
                onClick={() => void handleRemove()}
                disabled={uploading || removing}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X aria-hidden="true" size={15} />
                {removing ? "Removing..." : "Remove photo"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {helperText ? <p className="text-sm text-gray-600">{helperText}</p> : null}
      {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
      <AvatarCropModal
        file={cropSourceFile}
        imageUrl={cropSourceUrl}
        onClose={handleCloseCropModal}
        onConfirm={(file) => {
          void handleConfirmCrop(file);
        }}
      />
    </div>
  );
}
