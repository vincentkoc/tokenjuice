import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const bundleDir = join(root, "dist", "hosts", "deepseek-harness", "bundle");
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
await mkdir(bundleDir, { recursive: true });
await build({
  entryPoints: [join(root, "src", "hosts", "deepseek-harness", "runtime.ts")],
  outfile: join(bundleDir, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: false,
  logLevel: "info",
});
await writeFile(join(bundleDir, "package.json"), `${JSON.stringify({
  name: "tokenjuice-deepseek-harness",
  version,
  type: "module",
  main: "index.js",
  files: ["index.js", "cordis.patch.yml"],
  engines: { dsh: "0.2.2-alpha.2" },
  dsh: { bundle: { patch: "./cordis.patch.yml" } },
}, null, 2)}\n`);
await writeFile(join(bundleDir, "cordis.patch.yml"), "- insert:\n    - id: tokenjuice\n      name: tokenjuice-deepseek-harness\n");
