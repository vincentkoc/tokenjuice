import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const releaseRoot = join(repoRoot, "release");

function parseArgs(argv) {
  let output;
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--output") {
      output = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`unknown flag: ${current}`);
  }
  return { output };
}

function parseRepositoryUrl(repository) {
  if (!repository || typeof repository !== "object" || typeof repository.url !== "string") {
    return "https://github.com/vincentkoc/tokenjuice";
  }

  return repository.url
    .replace(/^git\+/, "")
    .replace(/\.git$/, "");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const version = packageJson.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("package.json version is required");
  }

  const artifactName = `tokenjuice-v${version}.tar.gz`;
  const sumsPath = join(releaseRoot, "sha256sums.txt");
  const sumsText = await readFile(sumsPath, "utf8").catch(async () => {
    const fallbackPath = join(releaseRoot, `${artifactName}.sha256`);
    return await readFile(fallbackPath, "utf8").catch(() => {
      throw new Error(`missing ${sumsPath}. run \`pnpm release:checksums\` first.`);
    });
  });
  const sha256 = sumsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.endsWith(`  ${artifactName}`) || line.endsWith(` ${artifactName}`))
    ?.split(/\s+/)[0];
  if (!sha256) {
    throw new Error(`could not parse sha256 for ${artifactName}`);
  }

  const repoUrl = parseRepositoryUrl(packageJson.repository);
  const outputPath = args.output ? resolve(repoRoot, args.output) : join(releaseRoot, "Formula", "tokenjuice.rb");

  const formula = `class Tokenjuice < Formula
  desc "Lean output compaction for terminal-heavy agent workflows"
  homepage "${repoUrl}"
  url "${repoUrl}/releases/download/v${version}/${artifactName}"
  sha256 "${sha256}"
  license "${packageJson.license}"
  version "${version}"

  depends_on "node"

  def install
    libexec.install "dist", "package.json", "README.md", "LICENSE"

    (bin/"tokenjuice").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/dist/cli/main.js" "\$@"
    EOS
    (bin/"tokenjuice").chmod 0755
  end

  test do
    assert_equal "${version}", shell_output("#{bin}/tokenjuice --version").strip
  end
end
`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, formula, "utf8");
  process.stdout.write(`wrote ${outputPath}\n`);
}

await main();
