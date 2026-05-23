import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  IBM_Plex_Mono: () => ({ variable: "mock-mono" }),
  Space_Grotesk: () => ({ variable: "mock-heading" }),
}));

vi.mock("./globals.css", () => ({}));

vi.mock("@/components/Providers", () => ({
  Providers: ({ children }: { children: ReactNode }) => children,
}));

describe("root layout viewport", () => {
  it("opts into viewport cover mode for safe-area aware layouts", async () => {
    const { viewport } = await import("./layout");

    expect(viewport).toMatchObject({
      themeColor: "#102236",
      viewportFit: "cover",
    });
  });
});
