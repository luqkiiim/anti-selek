"use client";

interface CommunityDangerZonePanelProps {
  resettingCommunity: boolean;
  deletingCommunity: boolean;
  onResetCommunity: () => void;
  onDeleteCommunity: () => void;
}

export function CommunityDangerZonePanel({
  resettingCommunity,
  deletingCommunity,
  onResetCommunity,
  onDeleteCommunity,
}: CommunityDangerZonePanelProps) {
  return (
    <section className="app-panel p-6">
      <div className="space-y-2">
        <p className="app-eyebrow">Danger zone</p>
        <h3 className="text-xl font-semibold text-gray-900">
          Reset or delete community
        </h3>
        <p className="text-sm text-gray-600">
          Reset clears tournament history and ratings. Delete removes the whole
          community permanently.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">
            Reset tournaments and ratings
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Deletes all tournaments in this community and returns member ratings
            to 1000.
          </p>
          <button
            type="button"
            onClick={onResetCommunity}
            disabled={resettingCommunity || deletingCommunity}
            className="app-button-dark mt-4 px-4 py-2"
          >
            {resettingCommunity ? "Resetting..." : "Reset community"}
          </button>
        </div>

        <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
          <p className="text-sm font-semibold text-gray-900">
            Delete this community
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Permanently removes this community and all related data.
          </p>
          <button
            type="button"
            onClick={onDeleteCommunity}
            disabled={deletingCommunity || resettingCommunity}
            className="app-button-danger mt-4 px-4 py-2"
          >
            {deletingCommunity ? "Deleting..." : "Delete community"}
          </button>
        </div>
      </div>
    </section>
  );
}
