// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubAdminClub } from "@/components/club-admin/clubAdminTypes";
import { useClubAdminClubActions } from "./useClubAdminClubActions";

const mocks = vi.hoisted(() => ({
  uploadClubAvatar: vi.fn(),
  deleteClubAvatar: vi.fn(),
}));

vi.mock("@/lib/avatarClient", () => ({
  uploadClubAvatar: mocks.uploadClubAvatar,
  deleteClubAvatar: mocks.deleteClubAvatar,
}));

const club: ClubAdminClub = {
  id: "community-1",
  name: "Club One",
  avatarUrl: "https://cdn.test/club-one.png",
  role: "ADMIN",
  viewerIsOwner: true,
  isPasswordProtected: false,
  isTutorial: false,
  tutorialOwnerId: null,
  membersCount: 4,
  sessionsCount: 2,
};

describe("useClubAdminClubActions", () => {
  let container: HTMLDivElement;
  let root: Root;
  let actions: ReturnType<typeof useClubAdminClubActions> | null = null;
  let refreshClubData: ReturnType<typeof vi.fn>;
  let setError: ReturnType<typeof vi.fn>;
  let setSuccess: ReturnType<typeof vi.fn>;

  function Harness() {
    const currentActions = useClubAdminClubActions({
      clubId: club.id,
      club,
      refreshClubData,
      router: { push: vi.fn() },
      setError,
      setSuccess,
    });

    useEffect(() => {
      actions = currentActions;
    }, [currentActions]);

    return null;
  }

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    refreshClubData = vi.fn(async () => undefined);
    setError = vi.fn();
    setSuccess = vi.fn();
    mocks.uploadClubAvatar.mockResolvedValue({
      avatarUrl: "https://cdn.test/club-one-new.png",
    });
    mocks.deleteClubAvatar.mockResolvedValue({ avatarUrl: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    actions = null;
  });

  it("uploads a club avatar and refreshes club data", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "club.webp", {
      type: "image/webp",
    });

    await act(async () => {
      await actions?.handleUploadClubAvatar(file);
    });

    expect(mocks.uploadClubAvatar).toHaveBeenCalledWith(club.id, file);
    expect(refreshClubData).toHaveBeenCalledTimes(1);
    expect(setSuccess).toHaveBeenCalledWith("Club profile picture updated.");
  });

  it("removes a club avatar and refreshes club data", async () => {
    await act(async () => {
      await actions?.handleRemoveClubAvatar();
    });

    expect(mocks.deleteClubAvatar).toHaveBeenCalledWith(club.id);
    expect(refreshClubData).toHaveBeenCalledTimes(1);
    expect(setSuccess).toHaveBeenCalledWith("Club profile picture removed.");
  });
});
