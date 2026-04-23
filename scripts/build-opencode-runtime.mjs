import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { build } from "esbuild";

const outFile = join(process.cwd(), "dist", "hosts", "opencode", "extension", "runtime.js");

await mkdir(dirname(outFile), { recursive: true });

await build({
  entryPoints: [join(process.cwd(), "src", "hosts", "opencode", "extension", "runtime.ts")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  logLevel: "info",
});
