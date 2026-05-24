const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);

if (Number.isNaN(major)) {
  console.error("Unable to detect the current Node.js version.");
  process.exit(1);
}

if (major !== 24) {
  console.error(
    [
      `Unsupported Node.js ${process.version}.`,
      "Anti-Selek is pinned to Node.js 24 to match the production runtime.",
      "Switch to Node 24, then rerun the command.",
    ].join("\n")
  );
  process.exit(1);
}
