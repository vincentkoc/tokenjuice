import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { renderHomebrewFormula, resolveFormulaSha256 } from "../../scripts/generate-homebrew-formula.mjs";

const execFileAsync = promisify(execFile);
const generatorScript = fileURLToPath(new URL("../../scripts/generate-homebrew-formula.mjs", import.meta.url));
const releaseWorkflow = new URL("../../.github/workflows/release.yml", import.meta.url);
const legacyTapWorkflow = new URL("../../.github/workflows/homebrew-tap.yml", import.meta.url);
const tempDirs = new Set<string>();

afterEach(async () => {
  await Promise.all([...tempDirs].map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.clear();
});

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-homebrew-formula-test-"));
  tempDirs.add(dir);
  return dir;
}

describe("Homebrew formula release flow", () => {
  it("renders current Homebrew DSL without a redundant version stanza", () => {
    const formula = renderHomebrewFormula({
      repoUrl: "https://github.com/vincentkoc/tokenjuice",
      version: "1.2.3",
      sha256: "a".repeat(64),
      license: "MIT",
    });

    expect(formula).toContain(
      'url "https://github.com/vincentkoc/tokenjuice/releases/download/v1.2.3/tokenjuice-v1.2.3.tar.gz"',
    );
    expect(formula).toContain(`sha256 "${"a".repeat(64)}"`);
    expect(formula).toContain('exec "#{formula_opt_bin("node")}/node" "#{libexec}/dist/cli/main.js" "$@"');
    expect(formula).not.toMatch(/^\s*version\s+"/m);
    expect(formula.indexOf("  url ")).toBeLessThan(formula.indexOf("  sha256 "));
    expect(formula.indexOf("  sha256 ")).toBeLessThan(formula.indexOf("  license "));
  });

  it("rejects a checksum entry that does not match the local tarball", async () => {
    const dir = await makeTempDir();
    const artifactName = "tokenjuice-v1.2.3.tar.gz";
    const artifactPath = join(dir, artifactName);
    await writeFile(artifactPath, "local tarball bytes", "utf8");

    await expect(
      resolveFormulaSha256({
        artifactName,
        artifactPath,
        sumsText: `${"0".repeat(64)}  ${artifactName}\n`,
      }),
    ).rejects.toThrow(/does not match the local tarball/);
  });

  it("renders an exact published checksum without requiring a local tarball", async () => {
    const dir = await makeTempDir();
    const outputPath = join(dir, "tokenjuice.rb");
    const publishedSha256 = "25f950e7c8f516f4541b61c0788511fab7990eee4de91365b83fc755e4b9a9ea";
    const sha256 = await resolveFormulaSha256({
      artifactName: "tokenjuice-v0.8.2.tar.gz",
      artifactPath: "/path/that/does/not/exist",
      publishedTarballSha256: publishedSha256,
    });
    const formula = renderHomebrewFormula({
      repoUrl: "https://github.com/vincentkoc/tokenjuice",
      version: "0.8.2",
      sha256,
      license: "MIT",
    });

    expect(formula).toContain(`sha256 "${publishedSha256}"`);
    await execFileAsync(process.execPath, [
      generatorScript,
      "--",
      "--published-tarball-sha256",
      publishedSha256,
      "--output",
      outputPath,
    ]);
    await expect(readFile(outputPath, "utf8")).resolves.toContain(`sha256 "${publishedSha256}"`);
  });

  it("rejects invalid published checksum overrides", async () => {
    const dir = await makeTempDir();
    await expect(
      execFileAsync(process.execPath, [
        generatorScript,
        "--published-tarball-sha256",
        "A".repeat(64),
        "--output",
        join(dir, "tokenjuice.rb"),
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "--published-tarball-sha256 must be exactly 64 lowercase hexadecimal characters",
      ),
    });
  });

  it("leaves Homebrew publication to the target repository workflow", async () => {
    const workflow = await readFile(releaseWorkflow, "utf8");

    await expect(access(legacyTapWorkflow)).rejects.toMatchObject({ code: "ENOENT" });
    expect(workflow).not.toContain("Sync Homebrew tap");
    expect(workflow).not.toContain("homebrew-tap.yml");
    expect(workflow).not.toContain("/dispatches");
  });
});
