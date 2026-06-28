"use client";

import { ModalFrame } from "@/components/ui/chrome";

export function AvatarPreviewModal({
  name,
  avatarUrl,
  onClose,
}: {
  name: string;
  avatarUrl: string | null;
  onClose: () => void;
}) {
  if (!avatarUrl) {
    return null;
  }

  return (
    <ModalFrame
      title={`${name} photo`}
      subtitle="Profile photo"
      onClose={onClose}
      bodyScroll={false}
      bodyClassName="flex min-h-0 flex-1 items-center justify-center bg-[#0b1211] px-4 py-5 sm:px-6 sm:py-6"
      frameClassName="app-modal-frame-photo-viewer overflow-hidden"
      fullscreenUntilDesktop
    >
      <div className="flex h-full w-full items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={`${name} profile photo`}
          className="max-h-[72vh] w-full object-contain sm:max-h-[78vh]"
        />
      </div>
    </ModalFrame>
  );
}
