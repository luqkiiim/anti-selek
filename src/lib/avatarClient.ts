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

function getAvatarRoute(userId: string, communityId?: string) {
  const query = communityId
    ? `?communityId=${encodeURIComponent(communityId)}`
    : "";
  return `/api/users/${userId}/avatar${query}`;
}

export async function uploadUserAvatar(
  userId: string,
  file: File,
  communityId?: string
) {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch(getAvatarRoute(userId, communityId), {
    method: "POST",
    body: formData,
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(getRouteErrorMessage(payload, "Failed to upload avatar"));
  }

  return payload as { avatarUrl: string | null };
}

export async function deleteUserAvatar(userId: string, communityId?: string) {
  const response = await fetch(getAvatarRoute(userId, communityId), {
    method: "DELETE",
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(getRouteErrorMessage(payload, "Failed to remove avatar"));
  }

  return payload as { avatarUrl: null };
}
