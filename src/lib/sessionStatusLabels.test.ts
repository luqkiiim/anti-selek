import { describe, expect, it } from "vitest";
import { SessionStatus } from "@/types/enums";
import { getSessionStatusLabel } from "./sessionStatusLabels";

describe("getSessionStatusLabel", () => {
  it("formats internal tournament states for users", () => {
    expect(getSessionStatusLabel(SessionStatus.WAITING)).toBe("Waiting");
    expect(getSessionStatusLabel(SessionStatus.ACTIVE)).toBe("Live");
    expect(getSessionStatusLabel(SessionStatus.COMPLETED)).toBe("Completed");
    expect(getSessionStatusLabel("SOMETHING_NEW")).toBe("Unknown");
  });
});
