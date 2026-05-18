"use client";

import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Minus, Plus } from "lucide-react";
import { createCroppedAvatarFile } from "@/lib/avatarCrop";
import { ModalFrame } from "@/components/ui/chrome";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Something went wrong while preparing the avatar.";
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.01;
const ZOOM_BUTTON_STEP = 0.2;

export function AvatarCropModal({
  file,
  imageUrl,
  onClose,
  onConfirm,
}: {
  file: File | null;
  imageUrl: string | null;
  onClose: () => void;
  onConfirm: (file: File) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file || !imageUrl) {
      return;
    }

    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setProcessing(false);
    setError("");
  }, [file, imageUrl]);

  if (!file || !imageUrl) {
    return null;
  }

  const handleZoomButton = (direction: "in" | "out") => {
    setZoom((currentZoom) => {
      const delta = direction === "in" ? ZOOM_BUTTON_STEP : -ZOOM_BUTTON_STEP;
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom + delta));
    });
  };

  const handleConfirm = async () => {
    if (!croppedAreaPixels) {
      return;
    }

    setProcessing(true);
    setError("");

    try {
      const croppedFile = await createCroppedAvatarFile({
        src: imageUrl,
        crop: croppedAreaPixels,
        fileName: file.name,
        mimeType: file.type,
      });
      onConfirm(croppedFile);
      onClose();
    } catch (cropError) {
      setError(getErrorMessage(cropError));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ModalFrame
      title="Crop photo"
      subtitle="Drag and zoom to frame the circular avatar exactly how you want it."
      onClose={processing ? () => undefined : onClose}
      bodyScroll={false}
      bodyClassName="flex min-h-0 flex-1 flex-col"
      fullscreenUntilDesktop
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="app-button-secondary px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={processing || !croppedAreaPixels}
            className="app-button-primary px-4 py-2"
          >
            {processing ? "Preparing..." : "Use this crop"}
          </button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="relative min-h-[18rem] flex-1 overflow-hidden rounded-[1.35rem] border border-[rgba(15,118,110,0.18)] bg-[radial-gradient(circle_at_top,#18352f,#0f1715_72%)] sm:min-h-[22rem]">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            objectFit="cover"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, areaPixels) => {
              setCroppedAreaPixels(areaPixels);
            }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(7,10,10,0.58)] to-transparent px-4 pb-4 pt-12 text-center text-xs text-white/82">
            The circular frame is the visible avatar. We save a square image behind it for consistent display across the app.
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900">Zoom</p>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
              {Math.round(zoom * 100)}%
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleZoomButton("out")}
              disabled={processing || zoom <= MIN_ZOOM}
              className={cx(
                "inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:border-[rgba(15,118,110,0.28)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
              )}
              aria-label="Zoom out"
            >
              <Minus aria-hidden="true" size={16} />
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={zoom}
              onChange={(event) => {
                setZoom(Number(event.target.value));
              }}
              disabled={processing}
              className="h-2 w-full accent-[var(--accent)]"
              aria-label="Zoom crop"
            />
            <button
              type="button"
              onClick={() => handleZoomButton("in")}
              disabled={processing || zoom >= MAX_ZOOM}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:border-[rgba(15,118,110,0.28)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Zoom in"
            >
              <Plus aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
      </div>
    </ModalFrame>
  );
}
