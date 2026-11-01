import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = join(repoRoot, "release");
const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:[.-][0-9A-Za-z]+)*$/);
const minimumNode = /^>=(\d+)$/.exec(pkg.engines.node)?.[1];
assert.ok(minimumNode, "expected engines.node to declare one minimum Node.js major");
const template = await readFile(join(repoRoot, "packaging/nfpm.yaml"), "utf8");

const artifacts = [
  { format: "deb", arch: "all", name: `tokenjuice_${pkg.version}_all.deb` },
  { format: "rpm", arch: "noarch", name: `tokenjuice-${pkg.version}-1.noarch.rpm` },
];

for (const { format, arch, name } of artifacts) {
  const config = join(releaseRoot, `nfpm-${format}.yaml`);
  await writeFile(config, template.replaceAll("__VERSION__", pkg.version).replaceAll("__ARCH__", arch));
  execFileSync("nfpm", ["package", "--config", config, "--packager", format, "--target", join(releaseRoot, name)], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

const debDependencies = execFileSync("dpkg-deb", ["--field", join(releaseRoot, artifacts[0].name), "Depends"], {
  encoding: "utf8",
}).trim();
assert.ok(
  debDependencies.split(",").map((dependency) => dependency.trim()).includes(`nodejs (>= ${minimumNode})`),
  `DEB must require nodejs >= ${minimumNode}; got: ${debDependencies}`,
);

const rpmDependencies = execFileSync("rpm", ["--query", "--package", "--requires", join(releaseRoot, artifacts[1].name)], {
  encoding: "utf8",
}).trim();
assert.ok(
  rpmDependencies.split("\n").map((dependency) => dependency.trim()).includes(`nodejs >= ${minimumNode}`),
  `RPM must require nodejs >= ${minimumNode}; got: ${rpmDependencies}`,
);

process.stdout.write(`verified DEB and RPM require Node.js >= ${minimumNode}\n`);
