import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
const root = await mkdtemp(join(tmpdir(), "tokenjuice-package-e2e-"));
const project = join(root, "project");
const env = {
  PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
  HOME: join(root, "home"),
  XDG_CONFIG_HOME: join(root, "config"),
  XDG_CACHE_HOME: join(root, "cache"),
  TMPDIR: join(root, "tmp"),
  TOKENJUICE_STATS: "off",
  TOKENJUICE_ARTIFACT_DIR: join(root, "artifacts"),
  npm_config_cache: join(root, "npm-cache"),
  npm_config_userconfig: join(root, "npmrc"),
};

function run(command, args, { cwd = project, status = 0 } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, status, `${command} failed\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

function smoke(cli, packageRoot, installed) {
  assert.equal(run(cli, ["--version"]).trim(), manifest.version);
  const baseline = run("find", ["fixtures", "-type", "f"]);
  const compacted = run(cli, ["wrap", "--", "find", "fixtures", "-type", "f"]);
  assert.match(compacted, /80 matches/u);
  assert.ok(compacted.length < baseline.length);
  assert.equal(run(cli, ["wrap", "--raw", "--", "find", "fixtures", "-type", "f"]), baseline);
  assert.equal(run(cli, ["wrap", "--", "cat", "exact.txt"]), "  exact content\r\ntrailing blanks\n\n");

  const stdout = Array.from({ length: 80 }, (_, i) => `failure-${i}`).join("\n") + "\n";
  const failure = spawnSync(cli, ["wrap", "--keep-failures", "--", process.execPath, "-e",
    `process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write('failure-stderr\\n'); process.exitCode = 7;`],
  { cwd: project, env, encoding: "utf8", timeout: 30_000 });
  assert.ifError(failure.error);
  assert.equal(failure.status, 7);
  assert.equal(failure.stdout, stdout);
  assert.equal(failure.stderr, "failure-stderr\n");

  const main = installed ? "tokenjuice" : pathToFileURL(join(packageRoot, "dist/index.js")).href;
  const openclaw = installed ? "tokenjuice/openclaw" : pathToFileURL(join(packageRoot, "dist/hosts/openclaw/index.js")).href;
  run(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    assert.equal(typeof (await import(${JSON.stringify(main)})).classifyExecution, 'function');
    assert.equal(typeof (await import(${JSON.stringify(openclaw)})).createTokenjuiceOpenClawEmbeddedExtension, 'function');
  `], { cwd: packageRoot });
}

try {
  assert.notEqual(process.platform, "win32", "this fixture requires a POSIX shell");
  for (const path of [project, env.HOME, env.TMPDIR, join(project, "fixtures")]) await mkdir(path, { recursive: true });
  await writeFile(env.npm_config_userconfig, "");
  await Promise.all(Array.from({ length: 80 }, (_, i) => writeFile(join(project, "fixtures", `example-${i}.json`), "{}\n")));
  await writeFile(join(project, "exact.txt"), "  exact content\r\ntrailing blanks\n\n");

  const extracted = join(root, "release");
  await mkdir(extracted);
  const tarball = resolve(repo, "release", `tokenjuice-v${manifest.version}.tar.gz`);
  run("tar", ["-xzf", tarball, "-C", extracted]);
  const release = join(extracted, `tokenjuice-v${manifest.version}`);
  smoke(join(release, "bin/tokenjuice"), release, false);

  const packed = JSON.parse(run("npm", ["pack", "--offline", "--ignore-scripts", "--json", "--pack-destination", root], { cwd: repo }));
  assert.equal(packed.length, 1);
  const installed = join(root, "installed");
  await mkdir(installed);
  await writeFile(join(installed, "package.json"), '{"private":true,"type":"module"}\n');
  run("npm", ["install", "--prefix", installed, "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev", join(root, packed[0].filename)]);
  smoke(join(installed, "node_modules/.bin/tokenjuice"), installed, true);
  process.stdout.write(`${JSON.stringify({ ok: true, version: manifest.version, packages: ["release-tarball", "installed-npm"], checks: ["version", "compaction", "exact-read", "raw", "failure-streams", "library-exports"] })}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
