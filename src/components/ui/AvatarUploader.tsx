"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarCropModal } from "@/components/ui/AvatarCropModal";
import { getAvatarValidationError } from "@/lib/avatar";

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
  onUpload,
  onRemove,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "lg" | "xl" | "hero";
  editable?: boolean;
  helperText?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

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

    inputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const validationError = getAvatarValidationError({
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

    try {
      await onRemove();
    } catch (removeError) {
      setError(getErrorMessage(removeError));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
        <Avatar name={name} avatarUrl={previewUrl ?? avatarUrl} size={size} />
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
