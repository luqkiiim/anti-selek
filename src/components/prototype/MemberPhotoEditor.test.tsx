// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubPageMember } from "@/components/club/clubTypes";
import { MemberPhotoEditor } from "./MemberPhotoEditor";

vi.mock("./Primitives", () => ({ Avatar: () => null, ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null }));
vi.mock("@/lib/avatarCrop", () => ({ createCroppedAvatarFile: async () => new File(["image"], "crop.webp", { type: "image/webp" }) }));
vi.mock("react-easy-crop", () => ({ default: function MockCropper({ onCropComplete }: { onCropComplete: (unused: unknown, area: { x: number; y: number; width: number; height: number }) => void }) {
  useEffect(() => { onCropComplete(null, { x: 0, y: 0, width: 50, height: 50 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <span>Crop ready</span>;
} }));
const member = { id: "player", name: "Alex", avatarUrl: null, isClaimed: false } as ClubPageMember;

describe("MemberPhotoEditor recovery", () => {
  let container: HTMLDivElement; let root: Root;
  const onSaved = vi.fn(); const onBusyChange = vi.fn(); const refresh = vi.fn<() => Promise<unknown>>();
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    onSaved.mockReset(); onBusyChange.mockReset(); refresh.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ avatarUrl: "/photo.webp" }) }) as Response));
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: () => "blob:test", revokeObjectURL: vi.fn() }));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  async function choosePhoto() {
    await act(async () => root.render(<MemberPhotoEditor member={member} clubId="club" onSaved={onSaved} onBusyChange={onBusyChange} refresh={refresh} />));
    const input = container.querySelector('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["photo"], "photo.jpg", { type: "image/jpeg" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  }
  function button(label: string) { return Array.from(container.querySelectorAll("button")).find(item => item.textContent === label) as HTMLButtonElement; }
  it("commits the uploaded photo locally and unlocks even while refresh is pending", async () => {
    refresh.mockImplementation(() => new Promise(() => {}));
    await choosePhoto();
    await act(async () => button("Save photo").click());
    expect(onSaved).toHaveBeenCalledExactlyOnceWith("/photo.webp");
    expect(container.textContent).not.toContain("Crop ready");
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(fetch).toHaveBeenCalledWith("/api/users/player/avatar?clubId=club", expect.objectContaining({ method: "POST", body: expect.any(FormData), signal: expect.any(AbortSignal) }));
  });
  it("preserves the crop on a lost save response and recovers with reads only", async () => {
    await choosePhoto(); vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Network lost"));
    await act(async () => button("Save photo").click());
    expect(container.textContent).toContain("Couldn’t confirm the save. Refresh to check.");
    expect(container.textContent).toContain("Crop ready");
    expect(button("Save photo").disabled).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    await act(async () => button("Refresh details").click());
    expect(fetch).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledOnce();
    expect(button("Save photo").disabled).toBe(false);
  });
});
