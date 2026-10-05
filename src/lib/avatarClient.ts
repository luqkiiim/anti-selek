async function safeJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Invalid server response" };
  }
}

function getRouteErrorMessage(
  payload: unknown,
  fallback: string
): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }

  return fallback;
}

function getAvatarRoute(playerId: string, clubId?: string) {
  const query = clubId
    ? `?clubId=${encodeURIComponent(clubId)}`
    : "";
  return `/api/users/${encodeURIComponent(playerId)}/avatar${query}`;
}

const accountAvatarRoute = "/api/user/me/avatar";

export async function uploadAccountAvatar(file: File) {
  const formData = new FormData();
  formData.append("avatar", file);
  const response = await fetch(accountAvatarRoute, { method: "POST", body: formData });
  const payload = await safeJson(response);
  if (!response.ok) throw new Error(getRouteErrorMessage(payload, "Failed to upload avatar"));
  return payload as { avatarUrl: string | null };
}

export async function deleteAccountAvatar() {
  const response = await fetch(accountAvatarRoute, { method: "DELETE" });
  const payload = await safeJson(response);
  if (!response.ok) throw new Error(getRouteErrorMessage(payload, "Failed to remove avatar"));
  return payload as { avatarUrl: null };
}

function getClubAvatarRoute(clubId: string) {
  return `/api/clubs/${clubId}/avatar`;
}

export async function uploadPlayerAvatar(
  playerId: string,
  file: File,
  clubId?: string
) {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch(getAvatarRoute(playerId, clubId), {
    method: "POST",
    body: formData,
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(getRouteErrorMessage(payload, "Failed to upload avatar"));
  }

  return payload as { avatarUrl: string | null };
}

export async function deletePlayerAvatar(playerId: string, clubId?: string) {
  const response = await fetch(getAvatarRoute(playerId, clubId), {
    method: "DELETE",
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(getRouteErrorMessage(payload, "Failed to remove avatar"));
  }

  return payload as { avatarUrl: null };
}

/** Compatibility aliases for older callers; the route ID is always a Player ID. */
export const uploadUserAvatar = uploadPlayerAvatar;
export const deleteUserAvatar = deletePlayerAvatar;

export async function uploadClubAvatar(clubId: string, file: File) {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch(getClubAvatarRoute(clubId), {
    method: "POST",
    body: formData,
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(
      getRouteErrorMessage(payload, "Failed to upload club photo")
    );
  }

  return payload as { avatarUrl: string | null };
}

export async function deleteClubAvatar(clubId: string) {
  const response = await fetch(getClubAvatarRoute(clubId), {
    method: "DELETE",
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(
      getRouteErrorMessage(payload, "Failed to remove club photo")
    );
  }

  return payload as { avatarUrl: null };
}
