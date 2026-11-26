import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const outdir = "dist/hosts/alma/bundle";
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: ["src/hosts/alma/index.ts"],
  outfile: `${outdir}/main.js`,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
});
const manifest = JSON.parse(await readFile("src/hosts/alma/manifest.json", "utf8"));
manifest.version = JSON.parse(await readFile("package.json", "utf8")).version;
await writeFile(`${outdir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(`${outdir}/package.json`, '{"type":"module"}\n');
