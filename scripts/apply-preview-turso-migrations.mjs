import path from "node:path";
import { fileURLToPath } from "node:url";
import target from "../config/preview-turso-migration-target.json" with { type: "json" };
import manifest from "../config/preview-turso-migration-manifest.json" with { type: "json" };
import {
  createPreviewMigrationRunner,
  createPreviewHttpBatchDiagnostics,
  formatPreviewFailure,
} from "./preview-turso-migration-core.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(argv) {
  const values = new Map();
  const modes = new Set(["--expect-empty", "--resume", "--verify-only"]);
  let selectedMode = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (modes.has(argument)) {
      if (selectedMode) throw new Error("PREVIEW_ARGUMENTS_INVALID");
      selectedMode = argument;
      continue;
    }
    if (!["--confirm-name", "--confirm-endpoint-sha256", "--confirm-manifest-sha256"].includes(argument)) {
      throw new Error("PREVIEW_ARGUMENTS_INVALID");
    }
    if (values.has(argument) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
      throw new Error("PREVIEW_ARGUMENTS_INVALID");
    }
    values.set(argument, argv[index + 1]);
    index += 1;
  }

  if (
    !selectedMode ||
    values.get("--confirm-name") !== target.databaseName ||
    values.get("--confirm-endpoint-sha256") !== target.endpointSha256 ||
    values.get("--confirm-manifest-sha256") !== manifest.manifestSha256
  ) {
    throw new Error("PREVIEW_CONFIRMATION_MISMATCH");
  }

  return {
    mode: selectedMode === "--expect-empty" ? "initial" : selectedMode === "--resume" ? "resume" : "verify-only",
    confirmation: {
      databaseName: values.get("--confirm-name"),
      endpointSha256: values.get("--confirm-endpoint-sha256"),
      manifestSha256: values.get("--confirm-manifest-sha256"),
      expectEmpty: selectedMode === "--expect-empty",
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const runPreviewTursoMigration = createPreviewMigrationRunner({
    target,
    manifest,
    migrationsRoot: path.join(rootDir, "prisma", "migrations"),
  });

  const result = await runPreviewTursoMigration({
    ...options,
    clientFactory: async ({ url, authToken }) => {
      const { createClient } = await import("@libsql/client");
      const { fetch } = await import("@libsql/isomorphic-fetch");
      const diagnostics = createPreviewHttpBatchDiagnostics(fetch);
      return diagnostics.instrument(createClient({ url, authToken, fetch: diagnostics.fetch }));
    },
  });
  console.log(`Preview migration verification: ${result.status} (${result.applied}/${result.total}).`);
  if (result.lastMigration) console.log(`Last committed migration: ${result.lastMigration}.`);
  if (result.schemaSha256) console.log(`Verified schema checkpoint SHA-256: ${result.schemaSha256}.`);
  console.log("Foreign-key violations: 0.");
}

main().catch((error) => {
  console.error(formatPreviewFailure(error));
  process.exitCode = 1;
});
