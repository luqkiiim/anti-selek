import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("preserves the 58-migration predecessor while fixing both hosted expression-depth failures", () => {
  // Explicit prerequisite rather than a skip: Node/libSQL's bundled SQLite
  // builds expose depth 1000 and cannot reproduce the hosted limit themselves.
  const result = execFileSync(process.env.PYTHON ?? "python", ["scripts/test-identity-expression-depth.py", "-v"], {
    cwd: process.cwd(), encoding: "utf8", stdio: "pipe",
  });
  expect(result).toBe("");
}, 30000);
