import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const releaseRoot = join(repoRoot, "release");

async function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

function isReleaseArtifact(fileName) {
  return fileName.endsWith(".tar.gz") || fileName.endsWith(".deb") || fileName.endsWith(".rpm");
}

async function main() {
  const entries = await readdir(releaseRoot, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && isReleaseArtifact(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    throw new Error("no release artifacts found. build artifacts before generating checksums.");
  }

  const lines = await Promise.all(
    files.map(async (fileName) => `${await sha256File(join(releaseRoot, fileName))}  ${fileName}`),
  );

  await writeFile(join(releaseRoot, "sha256sums.txt"), `${lines.join("\n")}\n`, "utf8");
  process.stdout.write(`wrote ${join(releaseRoot, "sha256sums.txt")}\n`);
}

await main();
