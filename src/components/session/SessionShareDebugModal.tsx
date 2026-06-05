"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, RefreshCw, Share2 } from "lucide-react";
import { ModalFrame } from "@/components/ui/chrome";
import {
  prepareShareAvatarDataUrlsWithDiagnostics,
  ShareAvatarPreparationError,
  waitForShareCardRender,
  type ShareAvatarDiagnostic,
} from "@/lib/shareAvatar";
import {
  downloadSessionStandingsBlob,
  exportSessionStandingsBlob,
  readShareBlobAsDataUrl,
  shareSessionStandingsBlob,
} from "@/lib/sessionShare";
import { SessionShareCard } from "./SessionShareCard";
import type { Player } from "./sessionTypes";

type DebugPhase =
  | "idle"
  | "preparing"
  | "rendering"
  | "capturing"
  | "ready"
  | "error";

interface CaptureSummary {
  blobBytes: number;
  width: number | null;
  height: number | null;
  cardImageCount: number;
  dataUrlImageCount: number;
}

interface SessionShareDebugModalProps {
  open: boolean;
  sessionName: string;
  communityName: string;
  sessionType: string;
  sessionTypeLabel: string;
  players: Player[];
  pointDiffByUserId: Map<string, number>;
  playerStatsByUserId: Map<
    string,
    {
      played: number;
      wins: number;
      losses: number;
    }
  >;
  fileName: string;
  shareTitle: string;
  onClose: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}

function getPhaseLabel(phase: DebugPhase) {
  switch (phase) {
    case "preparing":
      return "Preparing avatars";
    case "rendering":
      return "Rendering card";
    case "capturing":
      return "Capturing PNG";
    case "ready":
      return "Ready";
    case "error":
      return "Stopped";
    default:
      return "Idle";
  }
}

function getImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();

    image.onload = () =>
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    image.onerror = () => reject(new Error("Could not inspect generated PNG"));
    image.src = src;
  });
}

function buildDebugInfoText({
  sessionName,
  communityName,
  phase,
  diagnostics,
  captureSummary,
  errorMessage,
}: {
  sessionName: string;
  communityName: string;
  phase: DebugPhase;
  diagnostics: ShareAvatarDiagnostic[];
  captureSummary: CaptureSummary | null;
  errorMessage: string;
}) {
  const lines = [
    "Share PNG debug",
    `Session: ${sessionName}`,
    `Community: ${communityName}`,
    `Phase: ${getPhaseLabel(phase)}`,
    `Browser: ${navigator.userAgent}`,
  ];

  if (errorMessage) {
    lines.push(`Error: ${errorMessage}`);
  }

  lines.push(
    `Players checked: ${diagnostics.length}`,
    `Prepared photos: ${
      diagnostics.filter((entry) => entry.status === "prepared-photo").length
    }`,
    `Initials expected: ${
      diagnostics.filter((entry) => entry.status === "initials").length
    }`,
    `Photo failures: ${
      diagnostics.filter((entry) => entry.status === "failed-photo").length
    }`
  );

  for (const diagnostic of diagnostics) {
    const detail =
      diagnostic.status === "prepared-photo"
        ? `${formatBytes(diagnostic.dataUrlBytes ?? 0)}, ${
            diagnostic.mimeType ?? "unknown"
          }`
        : diagnostic.status === "initials"
          ? "initials"
          : "failed";
    lines.push(`#${diagnostic.rank} ${diagnostic.name}: ${detail}`);
  }

  if (captureSummary) {
    lines.push(
      `Card images: ${captureSummary.cardImageCount}`,
      `Data URL images: ${captureSummary.dataUrlImageCount}`,
      `PNG size: ${formatBytes(captureSummary.blobBytes)}`,
      `PNG dimensions: ${captureSummary.width ?? "unknown"}x${
        captureSummary.height ?? "unknown"
      }`
    );
  }

  return lines.join("\n");
}

export function SessionShareDebugModal({
  open,
  sessionName,
  communityName,
  sessionType,
  sessionTypeLabel,
  players,
  pointDiffByUserId,
  playerStatsByUserId,
  fileName,
  shareTitle,
  onClose,
}: SessionShareDebugModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const runIdRef = useRef(0);
  const [phase, setPhase] = useState<DebugPhase>("idle");
  const [preparedAvatarUrlsByUserId, setPreparedAvatarUrlsByUserId] =
    useState<Map<string, string> | null>(null);
  const [diagnostics, setDiagnostics] = useState<ShareAvatarDiagnostic[]>([]);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [pngPreviewUrl, setPngPreviewUrl] = useState("");
  const [captureSummary, setCaptureSummary] = useState<CaptureSummary | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const uploadedCount = diagnostics.filter(
    (diagnostic) => diagnostic.status === "prepared-photo"
  ).length;
  const initialsCount = diagnostics.filter(
    (diagnostic) => diagnostic.status === "initials"
  ).length;
  const failureCount = diagnostics.filter(
    (diagnostic) => diagnostic.status === "failed-photo"
  ).length;

  const resetPreviewState = useCallback(() => {
    setPreparedAvatarUrlsByUserId(null);
    setDiagnostics([]);
    setPngBlob(null);
    setPngPreviewUrl("");
    setCaptureSummary(null);
    setErrorMessage("");
    setActionMessage("");
  }, []);

  const runDebugCapture = useCallback(async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    resetPreviewState();
    setPhase("preparing");

    try {
      const avatarPreparation = await prepareShareAvatarDataUrlsWithDiagnostics(
        players
      );
      if (runIdRef.current !== runId) {
        return;
      }

      setDiagnostics(avatarPreparation.diagnostics);
      setPreparedAvatarUrlsByUserId(avatarPreparation.avatarUrlsByUserId);
      setPhase("rendering");
      await waitForShareCardRender();
      if (runIdRef.current !== runId) {
        return;
      }

      const cardNode = cardRef.current;
      if (!cardNode) {
        throw new Error("Share card preview did not render.");
      }

      const images = Array.from(cardNode.querySelectorAll("img"));
      setPhase("capturing");
      const blob = await exportSessionStandingsBlob(cardNode);
      const previewUrl = await readShareBlobAsDataUrl(blob);
      const dimensions = await getImageDimensions(previewUrl).catch(() => ({
        width: null,
        height: null,
      }));
      if (runIdRef.current !== runId) {
        return;
      }

      setPngBlob(blob);
      setPngPreviewUrl(previewUrl);
      setCaptureSummary({
        blobBytes: blob.size,
        width: dimensions.width,
        height: dimensions.height,
        cardImageCount: images.length,
        dataUrlImageCount: images.filter((image) => image.src.startsWith("data:"))
          .length,
      });
      setPhase("ready");
    } catch (error) {
      if (runIdRef.current !== runId) {
        return;
      }

      if (error instanceof ShareAvatarPreparationError) {
        setDiagnostics(error.diagnostics);
      }
      setErrorMessage(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Could not generate share preview."
      );
      setPhase("error");
    }
  }, [players, resetPreviewState]);

  useEffect(() => {
    if (!open) {
      runIdRef.current += 1;
      resetPreviewState();
      setPhase("idle");
      return;
    }

    void runDebugCapture();
  }, [open, resetPreviewState, runDebugCapture]);

  const handleNativeShare = useCallback(async () => {
    if (!pngBlob) {
      return;
    }

    setActionMessage("");
    try {
      await shareSessionStandingsBlob({
        blob: pngBlob,
        fileName,
        shareTitle,
        fallbackToDownload: false,
      });
      setActionMessage("Native share completed.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setActionMessage(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Native share failed."
      );
    }
  }, [fileName, pngBlob, shareTitle]);

  const handleDownload = useCallback(() => {
    if (!pngBlob) {
      return;
    }

    downloadSessionStandingsBlob(pngBlob, fileName);
    setActionMessage("Download started.");
  }, [fileName, pngBlob]);

  const handleCopyDebugInfo = useCallback(async () => {
    const debugInfo = buildDebugInfoText({
      sessionName,
      communityName,
      phase,
      diagnostics,
      captureSummary,
      errorMessage,
    });

    try {
      await navigator.clipboard.writeText(debugInfo);
      setActionMessage("Debug info copied.");
    } catch {
      setActionMessage("Could not copy debug info. Screenshot this modal instead.");
    }
  }, [
    captureSummary,
    communityName,
    diagnostics,
    errorMessage,
    phase,
    sessionName,
  ]);

  if (!open) {
    return null;
  }

  const isBusy =
    phase === "preparing" || phase === "rendering" || phase === "capturing";
  const canUsePng = phase === "ready" && !!pngBlob;

  return (
    <ModalFrame
      title="Share preview"
      subtitle="Debug mode shows the exact card and PNG before sharing."
      onClose={onClose}
      fullscreenUntilDesktop
      frameClassName="sm:max-w-5xl"
      bodyClassName="space-y-5 px-4 py-4 sm:px-5"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="app-button-secondary"
            onClick={() => void runDebugCapture()}
            disabled={isBusy}
          >
            <RefreshCw aria-hidden="true" size={17} />
            Retry
          </button>
          <button
            type="button"
            className="app-button-secondary"
            onClick={() => void handleCopyDebugInfo()}
          >
            <Copy aria-hidden="true" size={17} />
            Copy debug info
          </button>
          <button
            type="button"
            className="app-button-secondary"
            onClick={handleDownload}
            disabled={!canUsePng}
          >
            <Download aria-hidden="true" size={17} />
            Download PNG
          </button>
          <button
            type="button"
            className="app-button-primary"
            onClick={() => void handleNativeShare()}
            disabled={!canUsePng}
          >
            <Share2 aria-hidden="true" size={17} />
            Native share
          </button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
        <section className="space-y-4">
          <div
            className="rounded-lg border border-gray-200 bg-gray-50 p-4"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Status
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {getPhaseLabel(phase)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                  Prepared {uploadedCount}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
                  Initials {initialsCount}
                </span>
                <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">
                  Failed {failureCount}
                </span>
              </div>
            </div>
            {errorMessage ? (
              <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {errorMessage}
              </p>
            ) : null}
            {actionMessage ? (
              <p className="mt-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
                {actionMessage}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Top 11 avatar checks
              </h3>
              <p className="text-xs font-semibold text-gray-500">
                No source URLs shown
              </p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {diagnostics.length > 0 ? (
                diagnostics.map((diagnostic) => (
                  <div
                    key={diagnostic.userId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        #{diagnostic.rank} {diagnostic.name}
                      </p>
                      <p className="text-xs font-medium text-gray-500">
                        {diagnostic.status === "prepared-photo"
                          ? `${formatBytes(
                              diagnostic.dataUrlBytes ?? 0
                            )} embedded`
                          : diagnostic.status === "initials"
                            ? "Initials expected"
                            : "Photo failed"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
                        diagnostic.status === "prepared-photo"
                          ? "bg-emerald-50 text-emerald-700"
                          : diagnostic.status === "initials"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {diagnostic.status === "prepared-photo"
                        ? "Photo"
                        : diagnostic.status === "initials"
                          ? "Initials"
                          : "Failed"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm font-medium text-gray-500">
                  Waiting for avatar preparation.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Captured PNG
              </h3>
              {captureSummary ? (
                <p className="text-xs font-semibold text-gray-500">
                  {formatBytes(captureSummary.blobBytes)} ·{" "}
                  {captureSummary.width ?? "?"}x{captureSummary.height ?? "?"}
                </p>
              ) : null}
            </div>
            <div className="mt-3 flex justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
              {pngPreviewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={pngPreviewUrl}
                  alt="Generated standings PNG preview"
                  className="max-h-[60vh] w-auto rounded-lg border border-gray-200 bg-white"
                />
              ) : (
                <div className="flex min-h-48 items-center justify-center text-sm font-medium text-gray-500">
                  PNG preview will appear after capture.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Card preview
              </h3>
              {captureSummary ? (
                <p className="text-xs font-semibold text-gray-500">
                  {captureSummary.dataUrlImageCount}/
                  {captureSummary.cardImageCount} images embedded
                </p>
              ) : null}
            </div>
            <div className="mt-3 flex justify-center overflow-auto rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
              {preparedAvatarUrlsByUserId ? (
                <div className="h-[480px] w-[270px] shrink-0 overflow-hidden rounded-[20px] bg-white">
                  <div
                    style={{
                      width: 540,
                      height: 960,
                      transform: "scale(0.5)",
                      transformOrigin: "top left",
                    }}
                  >
                    <div ref={cardRef}>
                      <SessionShareCard
                        sessionName={sessionName}
                        communityName={communityName}
                        sessionType={sessionType}
                        sessionTypeLabel={sessionTypeLabel}
                        players={players}
                        preparedAvatarUrlsByUserId={preparedAvatarUrlsByUserId}
                        pointDiffByUserId={pointDiffByUserId}
                        playerStatsByUserId={playerStatsByUserId}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-[480px] w-[270px] items-center justify-center text-center text-sm font-medium text-gray-500">
                  Share card will appear after avatars are prepared.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </ModalFrame>
  );
}
