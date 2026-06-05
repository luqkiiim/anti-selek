// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PartnerPreference,
  PlayerGender,
  SessionPool,
  SessionType,
} from "@/types/enums";
import type { Player } from "./sessionTypes";
import { SessionShareDebugModal } from "./SessionShareDebugModal";
import { ShareAvatarPreparationError } from "@/lib/shareAvatar";
import {
  downloadSessionStandingsBlob,
  exportSessionStandingsBlob,
  shareSessionStandingsBlob,
} from "@/lib/sessionShare";

const mocks = vi.hoisted(() => ({
  prepareShareAvatarDataUrlsWithDiagnostics: vi.fn(),
  waitForShareCardRender: vi.fn(),
  exportSessionStandingsBlob: vi.fn(),
  readShareBlobAsDataUrl: vi.fn(),
  shareSessionStandingsBlob: vi.fn(),
  downloadSessionStandingsBlob: vi.fn(),
}));

vi.mock("@/components/ui/chrome", () => ({
  ModalFrame: ({
    title,
    subtitle,
    children,
    footer,
  }: {
    title: string;
    subtitle?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <div role="dialog" aria-label={title}>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      <div>{children}</div>
      <footer>{footer}</footer>
    </div>
  ),
}));

vi.mock("./SessionShareCard", () => ({
  SessionShareCard: ({
    preparedAvatarUrlsByUserId,
  }: {
    preparedAvatarUrlsByUserId: Map<string, string>;
  }) => (
    <div data-testid="share-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preparedAvatarUrlsByUserId.get("u1")} alt="Lina avatar" />
    </div>
  ),
}));

vi.mock("@/lib/shareAvatar", () => {
  class ShareAvatarPreparationError extends Error {
    diagnostics: unknown[];

    constructor(message: string, diagnostics: unknown[]) {
      super(message);
      this.name = "ShareAvatarPreparationError";
      this.diagnostics = diagnostics;
    }
  }

  return {
    ShareAvatarPreparationError,
    prepareShareAvatarDataUrlsWithDiagnostics:
      mocks.prepareShareAvatarDataUrlsWithDiagnostics,
    waitForShareCardRender: mocks.waitForShareCardRender,
  };
});

vi.mock("@/lib/sessionShare", () => ({
  downloadSessionStandingsBlob: mocks.downloadSessionStandingsBlob,
  exportSessionStandingsBlob: mocks.exportSessionStandingsBlob,
  readShareBlobAsDataUrl: mocks.readShareBlobAsDataUrl,
  shareSessionStandingsBlob: mocks.shareSessionStandingsBlob,
}));

function createPlayer({
  userId,
  name,
  avatarUrl = null,
}: {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}): Player {
  return {
    userId,
    sessionPoints: 12,
    isPaused: false,
    isGuest: false,
    gender: PlayerGender.UNSPECIFIED,
    partnerPreference: PartnerPreference.OPEN,
    pool: SessionPool.A,
    user: {
      id: userId,
      name,
      avatarUrl,
      elo: 1000,
    },
  };
}

const players = [
  createPlayer({
    userId: "u1",
    name: "Lina",
    avatarUrl: "https://cdn.test/lina.png",
  }),
  createPlayer({ userId: "u2", name: "Agiq" }),
];

const pointDiffByUserId = new Map([
  ["u1", 5],
  ["u2", -2],
]);
const playerStatsByUserId = new Map([
  ["u1", { played: 4, wins: 3, losses: 1 }],
  ["u2", { played: 4, wins: 1, losses: 3 }],
]);

function renderModal(container: HTMLElement) {
  const root = createRoot(container);
  root.render(
    <SessionShareDebugModal
      open
      sessionName="Badminton 29/5/26"
      communityName="Badminton Usuals"
      sessionType={SessionType.SOCIAL_MIX}
      sessionTypeLabel="Social Mix"
      players={players}
      pointDiffByUserId={pointDiffByUserId}
      playerStatsByUserId={playerStatsByUserId}
      fileName="badminton-standings"
      shareTitle="Badminton standings"
      onClose={vi.fn()}
    />
  );
  return root;
}

async function flushAsyncWork() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function flushDebugCapture() {
  await flushAsyncWork();
  await flushAsyncWork();
  await flushAsyncWork();
}

describe("SessionShareDebugModal", () => {
  let container: HTMLElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = null;

    mocks.prepareShareAvatarDataUrlsWithDiagnostics.mockReset();
    mocks.waitForShareCardRender.mockReset();
    mocks.exportSessionStandingsBlob.mockReset();
    mocks.readShareBlobAsDataUrl.mockReset();
    mocks.shareSessionStandingsBlob.mockReset();
    mocks.downloadSessionStandingsBlob.mockReset();

    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.waitForShareCardRender.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 0))
    );
    mocks.exportSessionStandingsBlob.mockResolvedValue(
      new Blob(["png"], { type: "image/png" })
    );
    mocks.readShareBlobAsDataUrl.mockResolvedValue("data:image/png;base64,UE5H");
    mocks.shareSessionStandingsBlob.mockResolvedValue({
      method: "native-share",
    });

    class TestImage {
      naturalWidth = 1080;
      naturalHeight = 1920;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal("Image", TestImage);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    vi.unstubAllGlobals();
  });

  it("previews the real card and captured PNG from prepared avatars", async () => {
    mocks.prepareShareAvatarDataUrlsWithDiagnostics.mockResolvedValue({
      avatarUrlsByUserId: new Map([["u1", "data:image/png;base64,TEk="]]),
      diagnostics: [
        {
          userId: "u1",
          name: "Lina",
          rank: 1,
          status: "prepared-photo",
          dataUrlBytes: 22,
          dataUrlLength: 30,
          mimeType: "image/png",
        },
        { userId: "u2", name: "Agiq", rank: 2, status: "initials" },
      ],
      displayedPlayerCount: 2,
      uploadedPhotoCount: 1,
      preparedPhotoCount: 1,
      initialsOnlyCount: 1,
      failedPhotoCount: 0,
    });

    await act(async () => {
      root = renderModal(container);
    });
    await flushDebugCapture();

    expect(container.textContent).toContain("Ready");
    expect(container.textContent).toContain("Prepared 1");
    expect(container.textContent).toContain("Initials 1");
    expect(container.textContent).toContain("1080x1920");
    expect(container.querySelector('img[alt="Lina avatar"]')).toHaveProperty(
      "src",
      "data:image/png;base64,TEk="
    );
    expect(container.querySelector('img[alt="Generated standings PNG preview"]'))
      .toHaveProperty("src", "data:image/png;base64,UE5H");
    expect(exportSessionStandingsBlob).toHaveBeenCalledTimes(1);
  });

  it("stops before capture when avatar preparation fails", async () => {
    mocks.prepareShareAvatarDataUrlsWithDiagnostics.mockRejectedValue(
      new ShareAvatarPreparationError(
        "Could not prepare profile pictures. Try again.",
        [
          {
            userId: "u1",
            name: "Lina",
            rank: 1,
            status: "failed-photo",
          },
        ]
      )
    );

    await act(async () => {
      root = renderModal(container);
    });
    await flushDebugCapture();

    expect(container.textContent).toContain(
      "Could not prepare profile pictures. Try again."
    );
    expect(container.textContent).toContain("Photo failed");
    expect(exportSessionStandingsBlob).not.toHaveBeenCalled();
  });

  it("reuses the previewed PNG for native share and download actions", async () => {
    const exportedBlob = new Blob(["png"], { type: "image/png" });
    mocks.exportSessionStandingsBlob.mockResolvedValue(exportedBlob);
    mocks.prepareShareAvatarDataUrlsWithDiagnostics.mockResolvedValue({
      avatarUrlsByUserId: new Map([["u1", "data:image/png;base64,TEk="]]),
      diagnostics: [
        {
          userId: "u1",
          name: "Lina",
          rank: 1,
          status: "prepared-photo",
          dataUrlBytes: 22,
          dataUrlLength: 30,
          mimeType: "image/png",
        },
      ],
      displayedPlayerCount: 1,
      uploadedPhotoCount: 1,
      preparedPhotoCount: 1,
      initialsOnlyCount: 0,
      failedPhotoCount: 0,
    });

    await act(async () => {
      root = renderModal(container);
    });
    await flushDebugCapture();

    const buttons = Array.from(container.querySelectorAll("button"));
    const nativeShareButton = buttons.find((button) =>
      button.textContent?.includes("Native share")
    );
    const downloadButton = buttons.find((button) =>
      button.textContent?.includes("Download PNG")
    );
    const copyButton = buttons.find((button) =>
      button.textContent?.includes("Copy debug info")
    );

    expect(nativeShareButton).toBeTruthy();
    expect(downloadButton).toBeTruthy();
    expect(copyButton).toBeTruthy();

    await act(async () => {
      nativeShareButton?.click();
    });
    await act(async () => {
      downloadButton?.click();
    });
    await act(async () => {
      copyButton?.click();
    });

    expect(exportSessionStandingsBlob).toHaveBeenCalledTimes(1);
    expect(shareSessionStandingsBlob).toHaveBeenCalledWith({
      blob: exportedBlob,
      fileName: "badminton-standings",
      shareTitle: "Badminton standings",
      fallbackToDownload: false,
    });
    expect(downloadSessionStandingsBlob).toHaveBeenCalledWith(
      exportedBlob,
      "badminton-standings"
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.not.stringContaining("cdn.test")
    );
  });
});
