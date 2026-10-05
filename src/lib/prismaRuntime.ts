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
  vercel,
  vercelEnv,
  vercelUrl,
}: {
  nodeEnv?: string;
  useTurso?: string;
  tursoUrl?: string;
  tursoToken?: string;
  vercel?: string;
  vercelEnv?: string;
  vercelUrl?: string;
}): PrismaRuntimeMode {
  const useTursoOverride = parseBooleanEnv(useTurso);
  const hasTursoConfig = hasText(tursoUrl) && hasText(tursoToken);
  const deployed = nodeEnv === "production" && vercel === "1" && hasText(vercelUrl);

  if (deployed) {
    if (vercelEnv !== "production" && vercelEnv !== "preview") {
      throw new Error("Database access is disabled for an unknown deployment environment.");
    }
    if (useTursoOverride === false || !hasTursoConfig) {
      throw new Error("Deployment database access is disabled: explicit matching Turso credentials are required.");
    }
    return "turso";
  }

  if (useTursoOverride === true) {
    if (!hasTursoConfig) throw new Error("USE_TURSO=true requires complete non-production Turso credentials.");
    return "turso";
  }

  if (useTursoOverride === false) {
    return "sqlite";
  }

  return "sqlite";
}

export function selectPrismaTursoCredentials(env: NodeJS.ProcessEnv) {
  const deployed = env.NODE_ENV === "production" && env.VERCEL === "1" && hasText(env.VERCEL_URL);
  if (deployed && env.VERCEL_ENV === "preview") {
    if (hasText(env.TURSO_DATABASE_URL) || hasText(env.TURSO_AUTH_TOKEN)) {
      throw new Error("Preview refuses Production-style TURSO_* variables; use isolated PREVIEW_TURSO_* credentials only.");
    }
    return { tursoUrl: env.PREVIEW_TURSO_DATABASE_URL, tursoToken: env.PREVIEW_TURSO_AUTH_TOKEN };
  }
  return { tursoUrl: env.TURSO_DATABASE_URL, tursoToken: env.TURSO_AUTH_TOKEN };
}
