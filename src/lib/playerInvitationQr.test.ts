import { expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { playerInvitationQr } from "./playerInvitationQr";

it("renders a QR that decodes to the identical secure invitation URL", () => {
  const url = "https://anti-selek.example/player-invites/test-invitation#synthetic-secret-0123456789012345678901234567";
  const { size, path } = playerInvitationQr(url);
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const scale = 5;
  const pixels = new Uint8ClampedArray(size * scale * size * scale * 4).fill(255);
  const cells = [...path.matchAll(/M(\d+),(\d+)h1v1h-1z/g)];
  expect(cells.length).toBeGreaterThan(0);
  expect(size).toBe(modules.size + 8);
  for (const [, x, y] of cells) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
    const index = ((Number(y) * scale + dy) * size * scale + Number(x) * scale + dx) * 4;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
  }
  expect(jsQR(pixels, size * scale, size * scale)?.data).toBe(url);
});
