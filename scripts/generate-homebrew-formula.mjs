import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const releaseRoot = join(repoRoot, "release");

function parseArgs(argv) {
  let output;
  let publishedTarballSha256;
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--") {
      continue;
    }
    if (current === "--output") {
      output = requireFlagValue(argv, index, current);
      index += 1;
      continue;
    }
    if (current === "--published-tarball-sha256") {
      publishedTarballSha256 = requireFlagValue(argv, index, current);
      index += 1;
      continue;
    }
    throw new Error(`unknown flag: ${current}`);
  }
  return { output, publishedTarballSha256 };
}

function requireFlagValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseRepositoryUrl(repository) {
  if (!repository || typeof repository !== "object" || typeof repository.url !== "string") {
    return "https://github.com/vincentkoc/tokenjuice";
  }

  return repository.url
    .replace(/^git\+/, "")
    .replace(/\.git$/, "");
}

function validateSha256(sha256, source) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error(`${source} must be exactly 64 lowercase hexadecimal characters`);
  }
  return sha256;
}

function parseArtifactSha256(sumsText, artifactName) {
  const matches = sumsText
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 2 && parts[1] === artifactName)
    .map((parts) => parts[0]);

  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`expected exactly one checksum entry for ${artifactName}`);
  }
  return validateSha256(matches[0], `checksum for ${artifactName}`);
}

async function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

export async function resolveFormulaSha256({
  artifactName,
  artifactPath,
  sumsText,
  publishedTarballSha256,
}) {
  if (publishedTarballSha256 !== undefined) {
    return validateSha256(publishedTarballSha256, "--published-tarball-sha256");
  }
  if (sumsText === undefined) {
    throw new Error("checksum text is required for local formula generation");
  }

  const expectedSha256 = parseArtifactSha256(sumsText, artifactName);
  const actualSha256 = await sha256File(artifactPath);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `checksum for ${artifactName} does not match the local tarball: expected ${expectedSha256}, actual ${actualSha256}`,
    );
  }
  return expectedSha256;
}

export function renderHomebrewFormula({ repoUrl, version, sha256, license }) {
  return `class Tokenjuice < Formula
  desc "Lean output compaction for terminal-heavy agent workflows"
  homepage "${repoUrl}"
  url "${repoUrl}/releases/download/v${version}/tokenjuice-v${version}.tar.gz"
  sha256 "${sha256}"
  license "${license}"

  depends_on "node"

  def install
    libexec.install "dist", "package.json", "README.md", "LICENSE"

    (bin/"tokenjuice").write <<~EOS
      #!/bin/bash
      exec "#{formula_opt_bin("node")}/node" "#{libexec}/dist/cli/main.js" "$@"
    EOS
    (bin/"tokenjuice").chmod 0755
  end

  test do
    assert_equal "${version}", shell_output("#{bin}/tokenjuice --version").strip
  end
end
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const version = packageJson.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("package.json version is required");
  }

  const artifactName = `tokenjuice-v${version}.tar.gz`;
  let sumsText;
  if (args.publishedTarballSha256 === undefined) {
    const sumsPath = join(releaseRoot, "sha256sums.txt");
    sumsText = await readFile(sumsPath, "utf8").catch(async () => {
      const fallbackPath = join(releaseRoot, `${artifactName}.sha256`);
      return await readFile(fallbackPath, "utf8").catch(() => {
        throw new Error(`missing ${sumsPath}. run \`pnpm release:checksums\` first.`);
      });
    });
  }
  const sha256 = await resolveFormulaSha256({
    artifactName,
    artifactPath: join(releaseRoot, artifactName),
    sumsText,
    publishedTarballSha256: args.publishedTarballSha256,
  });

  const repoUrl = parseRepositoryUrl(packageJson.repository);
  const outputPath = args.output ? resolve(repoRoot, args.output) : join(releaseRoot, "Formula", "tokenjuice.rb");
  const formula = renderHomebrewFormula({
    repoUrl,
    version,
    sha256,
    license: packageJson.license,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, formula, "utf8");
  process.stdout.write(`wrote ${outputPath}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
