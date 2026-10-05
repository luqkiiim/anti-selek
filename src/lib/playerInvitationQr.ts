import QRCode from "qrcode";

export function playerInvitationQr(url: string) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const margin = 4;
  const size = modules.size + margin * 2;
  const cells: string[] = [];
  modules.data.forEach((dark, index) => {
    if (dark) cells.push(`M${index % modules.size + margin},${Math.floor(index / modules.size) + margin}h1v1h-1z`);
  });
  return { size, path: cells.join("") };
}
