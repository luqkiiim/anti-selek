export function getCourtDisplayLabel(
  court: Pick<{ courtNumber: number; label?: string | null }, "courtNumber" | "label">
) {
  const trimmedLabel = typeof court.label === "string" ? court.label.trim() : "";
  return trimmedLabel.length > 0 ? trimmedLabel : `Court ${court.courtNumber}`;
}
