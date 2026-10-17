// @vitest-environment jsdom

import {
  act,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import type { ClubAdminClub } from "@/components/club-admin/clubAdminTypes";
import { useClubAdminClubActions } from "./useClubAdminClubActions";

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
  let refreshClubData: Mock<() => Promise<void>>;
  let setError: Mock<Dispatch<SetStateAction<string>>>;
  let setSuccess: Mock<Dispatch<SetStateAction<string>>>;

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
    refreshClubData = vi.fn<() => Promise<void>>(async () => undefined);
    setError = vi.fn<Dispatch<SetStateAction<string>>>();
    setSuccess = vi.fn<Dispatch<SetStateAction<string>>>();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ avatarUrl: null }))));
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
    vi.unstubAllGlobals();
  });

  it("uploads a club avatar and refreshes club data", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "club.webp", {
      type: "image/webp",
    });

    await act(async () => {
      await actions?.handleUploadClubAvatar(file);
    });

    expect(fetch).toHaveBeenCalledWith(`/api/clubs/${club.id}/avatar`, expect.objectContaining({ method: "POST", body: expect.any(FormData) }));
    expect(refreshClubData).toHaveBeenCalledTimes(1);
    expect(setSuccess).toHaveBeenCalledWith("Club profile picture updated.");
  });

  it("removes a club avatar and refreshes club data", async () => {
    await act(async () => {
      await actions?.handleRemoveClubAvatar();
    });

    expect(fetch).toHaveBeenCalledWith(`/api/clubs/${club.id}/avatar`, expect.objectContaining({ method: "DELETE" }));
    expect(refreshClubData).toHaveBeenCalledTimes(1);
    expect(setSuccess).toHaveBeenCalledWith("Club profile picture removed.");
  });
  it("keeps a confirmed settings save successful when refresh fails", async () => {
    refreshClubData.mockRejectedValue(new Error("Read unavailable"));
    await act(async () => { actions?.setClubNameInput("Club Two"); });
    await act(async () => { await actions?.handleUpdateClubSettings({ preventDefault() {} } as never); });
    expect(setSuccess).toHaveBeenCalledWith("Club settings updated.");
    expect(setError).not.toHaveBeenCalledWith("Read unavailable");
    expect(actions?.savingClubSettings).toBe(false);
    expect(actions?.refreshWarning).toContain("Saved.");
    const writes = vi.mocked(fetch).mock.calls.length;
    refreshClubData.mockResolvedValue(undefined);
    await act(async () => { await actions?.retryRefresh(); });
    expect(vi.mocked(fetch).mock.calls.length).toBe(writes);
    expect(actions?.refreshWarning).toBe("");
  });

  it("releases settings save while refresh remains pending", async () => {
    refreshClubData.mockImplementation(() => new Promise(() => {}));
    await act(async () => { actions?.setClubNameInput("Club Two"); });
    await act(async () => { await actions?.handleUpdateClubSettings({ preventDefault() {} } as never); });
    expect(actions?.savingClubSettings).toBe(false);
    expect(actions?.refreshing).toBe(true);
  });
});
