const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);

if (Number.isNaN(major)) {
  console.error("Unable to detect the current Node.js version.");
  process.exit(1);
}

if (major < 20 || major >= 23) {
  console.error(
    [
      `Unsupported Node.js ${process.version}.`,
      "Anti-Selek is pinned to Node.js 20 or 22 LTS because Prisma 5.22 and the local Next dev server are unreliable on Node 24.",
      "Switch to Node 22 LTS, then rerun the command.",
    ].join("\n")
  );
  process.exit(1);
}
