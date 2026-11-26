import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { build } from "esbuild";

const outfile = join(process.cwd(), "dist", "hosts", "omp", "extension.js");
await mkdir(dirname(outfile), { recursive: true });
await build({
  entryPoints: [join(process.cwd(), "src", "hosts", "omp", "extension.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  logLevel: "info",
});
