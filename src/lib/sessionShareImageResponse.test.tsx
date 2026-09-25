import { describe, expect, it } from "vitest";
import { ImageResponse } from "next/og";
import { SessionType } from "@/types/enums";
import {
  buildSessionShareImageViewModel,
  getSessionShareImageFonts,
  renderSessionShareImage,
  SESSION_SHARE_IMAGE_HEIGHT,
  SESSION_SHARE_IMAGE_WIDTH,
} from "./sessionShareImage";

describe("session share image response", () => {
  it("renders the share card JSX into PNG bytes", async () => {
    const viewModel = buildSessionShareImageViewModel({
      sessionName: "Weekend Cup",
      clubName: "Badminton Usuals",
      sessionType: SessionType.POINTS,
      players: [
        { userId: "u1", sessionPoints: 12, user: { name: "Aiman" } },
        { userId: "u2", sessionPoints: 10, user: { name: "Siti" } },
        { userId: "u3", sessionPoints: 9, user: { name: "Farah" } },
        { userId: "u4", sessionPoints: 8, user: { name: "Haziq" } },
      ],
      matches: [],
    });
    const response = new ImageResponse(renderSessionShareImage(viewModel), {
      width: SESSION_SHARE_IMAGE_WIDTH,
      height: SESSION_SHARE_IMAGE_HEIGHT,
      fonts: await getSessionShareImageFonts(),
    });
    const bytes = await response.arrayBuffer();

    expect(response.headers.get("content-type")).toContain("image/png");
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  }, 15_000);

  it("renders the fourteen-player standings layout into PNG bytes", async () => {
    const viewModel = buildSessionShareImageViewModel({
      sessionName: "Championship Finals",
      clubName: "Badminton Usuals",
      sessionType: SessionType.POINTS,
      players: Array.from({ length: 14 }, (_, index) => ({
        userId: `u${index + 1}`,
        sessionPoints: 24 - index,
        user: { name: `Player ${index + 1}` },
      })),
      matches: [],
    });
    const response = new ImageResponse(renderSessionShareImage(viewModel), {
      width: SESSION_SHARE_IMAGE_WIDTH,
      height: SESSION_SHARE_IMAGE_HEIGHT,
      fonts: await getSessionShareImageFonts(),
    });
    const bytes = await response.arrayBuffer();

    expect(response.headers.get("content-type")).toContain("image/png");
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  }, 15_000);
});
