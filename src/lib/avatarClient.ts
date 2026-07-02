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

function getAvatarRoute(userId: string, clubId?: string) {
  const query = clubId
    ? `?clubId=${encodeURIComponent(clubId)}`
    : "";
  return `/api/users/${userId}/avatar${query}`;
}

function getClubAvatarRoute(clubId: string) {
  return `/api/clubs/${clubId}/avatar`;
}

export async function uploadUserAvatar(
  userId: string,
  file: File,
  clubId?: string
) {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch(getAvatarRoute(userId, clubId), {
    method: "POST",
    body: formData,
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(getRouteErrorMessage(payload, "Failed to upload avatar"));
  }

  return payload as { avatarUrl: string | null };
}

export async function deleteUserAvatar(userId: string, clubId?: string) {
  const response = await fetch(getAvatarRoute(userId, clubId), {
    method: "DELETE",
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(getRouteErrorMessage(payload, "Failed to remove avatar"));
  }

  return payload as { avatarUrl: null };
}

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
