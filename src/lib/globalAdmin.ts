const FORCED_GLOBAL_ADMIN_EMAILS = new Set<string>([
  "h.luqman1998@gmail.com",
]);

function normalizeEmail(email?: string | null): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

const configuredAdminEmails = new Set<string>(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter((email): email is string => !!email)
);

for (const email of FORCED_GLOBAL_ADMIN_EMAILS) {
  configuredAdminEmails.add(email);
}

export function isGlobalAdminEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return configuredAdminEmails.has(normalized);
}

export function normalizeAuthEmail(email?: string | null): string | null {
  return normalizeEmail(email);
}
