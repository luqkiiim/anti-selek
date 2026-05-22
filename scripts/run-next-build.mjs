import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

if (process.env.VERCEL === "1" && process.env.VERCEL_PREVIEW_COMMENTS_ENABLED === "1") {
  // Work around a Vercel Next adapter crash in modifyConfig when preview comments are enabled.
  process.env.VERCEL_PREVIEW_COMMENTS_ENABLED = "0";
}

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
