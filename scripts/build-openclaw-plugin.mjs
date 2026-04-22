import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const rootPackageJsonPath = join(repoRoot, "package.json");
const templateDir = join(repoRoot, "packaging", "openclaw-plugin");
const outputRoot = join(repoRoot, "dist", "openclaw-plugin");
const outputDistDir = join(outputRoot, "dist");
const outputEntryPath = join(outputDistDir, "index.js");
const BLOCKED_SOURCE_SUFFIXES = ["src/core/cli-client.ts", "src/core/wrap.ts"];
const BLOCKED_OUTPUT_PATTERNS = [/node:child_process/u, /\bchild_process\b/u];
const OPENCLAW_PLUGIN_COMPAT_VERSION = "2026.4.21";

function fail(message) {
  throw new Error(message);
}

function usesBlockedSource(inputPath) {
  const normalized = inputPath.replaceAll("\\", "/");
  return BLOCKED_SOURCE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

async function loadRootPackageMetadata() {
  const raw = await readFile(rootPackageJsonPath, "utf8");
  const parsed = JSON.parse(raw);
  if (typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
    fail("package.json version is required to build the OpenClaw plugin package.");
  }
  return parsed;
}

async function writePluginPackageJson(version) {
  const packageJson = {
    name: "tokenjuice-openclaw",
    version,
    description: "Native OpenClaw plugin package for tokenjuice exec output compaction.",
    license: "MIT",
    type: "module",
    homepage: "https://github.com/vincentkoc/tokenjuice",
    bugs: {
      url: "https://github.com/vincentkoc/tokenjuice/issues",
    },
    repository: {
      type: "git",
      url: "git+https://github.com/vincentkoc/tokenjuice.git",
    },
    main: "./dist/index.js",
    exports: {
      ".": "./dist/index.js",
    },
    files: ["dist", "openclaw.plugin.json", "README.md", "LICENSE", "SECURITY.md"],
    keywords: ["openclaw", "plugin", "terminal", "tokens", "developer-tools"],
    openclaw: {
      extensions: ["./dist/index.js"],
      compat: {
        pluginApi: `>=${OPENCLAW_PLUGIN_COMPAT_VERSION}`,
        minGatewayVersion: OPENCLAW_PLUGIN_COMPAT_VERSION,
      },
      build: {
        openclawVersion: OPENCLAW_PLUGIN_COMPAT_VERSION,
      },
    },
  };

  await writeFile(join(outputRoot, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function copyStaticPackageFiles() {
  await cp(join(templateDir, "README.md"), join(outputRoot, "README.md"));
  await cp(join(templateDir, "openclaw.plugin.json"), join(outputRoot, "openclaw.plugin.json"));
  await cp(join(repoRoot, "LICENSE"), join(outputRoot, "LICENSE"));
  await cp(join(repoRoot, "SECURITY.md"), join(outputRoot, "SECURITY.md"));
}

async function assertBundleSafety(metafile) {
  const blockedInputs = Object.keys(metafile.inputs).filter(usesBlockedSource);
  if (blockedInputs.length > 0) {
    fail(
      `OpenClaw plugin bundle pulled in disallowed runtime sources: ${blockedInputs.join(", ")}.`,
    );
  }

  const outputText = await readFile(outputEntryPath, "utf8");
  const matchedPattern = BLOCKED_OUTPUT_PATTERNS.find((pattern) => pattern.test(outputText));
  if (matchedPattern) {
    fail(
      `OpenClaw plugin bundle leaked shell-execution code (${matchedPattern.source}).`,
    );
  }
}

async function main() {
  const rootPackageJson = await loadRootPackageMetadata();

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputDistDir, { recursive: true });

  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: ["src/openclaw-plugin.ts"],
    outfile: outputEntryPath,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "silent",
    metafile: true,
  });

  await assertBundleSafety(result.metafile);
  await writePluginPackageJson(rootPackageJson.version);
  await copyStaticPackageFiles();
}

await main();
