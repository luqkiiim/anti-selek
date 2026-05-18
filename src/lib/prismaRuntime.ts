export type PrismaRuntimeMode = "sqlite" | "turso";

function hasText(value?: string | null) {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseBooleanEnv(value?: string | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  return undefined;
}

export function resolvePrismaRuntimeMode({
  nodeEnv,
  useTurso,
  tursoUrl,
  tursoToken,
}: {
  nodeEnv?: string;
  useTurso?: string;
  tursoUrl?: string;
  tursoToken?: string;
}): PrismaRuntimeMode {
  const useTursoOverride = parseBooleanEnv(useTurso);
  const hasTursoConfig = hasText(tursoUrl) && hasText(tursoToken);

  if (useTursoOverride === true) {
    return hasTursoConfig ? "turso" : "sqlite";
  }

  if (useTursoOverride === false) {
    return "sqlite";
  }

  if (nodeEnv === "production" && hasTursoConfig) {
    return "turso";
  }

  return "sqlite";
}
