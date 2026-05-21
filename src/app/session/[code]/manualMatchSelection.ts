import type {
  ManualMatchFormState,
  ManualMatchSlot,
} from "@/components/session/sessionTypes";

export const MANUAL_MATCH_SLOTS: ManualMatchSlot[] = [
  "team1User1Id",
  "team1User2Id",
  "team2User1Id",
  "team2User2Id",
];

export function getManualMatchSelectionOrder(
  manualMatchForm: ManualMatchFormState
) {
  return MANUAL_MATCH_SLOTS.map((slot) => manualMatchForm[slot]).filter(
    (value): value is string => value.length > 0
  );
}

export function buildManualMatchFormFromSelectedIds(
  selectedIds: string[]
): ManualMatchFormState {
  return {
    team1User1Id: selectedIds[0] ?? "",
    team1User2Id: selectedIds[1] ?? "",
    team2User1Id: selectedIds[2] ?? "",
    team2User2Id: selectedIds[3] ?? "",
  };
}

export function toggleManualMatchPlayer(
  manualMatchForm: ManualMatchFormState,
  userId: string
) {
  const selectedIds = getManualMatchSelectionOrder(manualMatchForm);
  const existingIndex = selectedIds.indexOf(userId);

  if (existingIndex >= 0) {
    return buildManualMatchFormFromSelectedIds(
      selectedIds.filter((selectedId) => selectedId !== userId)
    );
  }

  if (selectedIds.length >= MANUAL_MATCH_SLOTS.length) {
    return manualMatchForm;
  }

  return buildManualMatchFormFromSelectedIds([...selectedIds, userId]);
}
