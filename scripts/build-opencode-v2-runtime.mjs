import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { build } from "esbuild";

const outfile = join(process.cwd(), "dist", "hosts", "opencode", "v2", "bundle", "index.js");
await mkdir(dirname(outfile), { recursive: true });
await build({
  entryPoints: [join(process.cwd(), "src", "hosts", "opencode", "v2", "runtime.ts")],
  outfile, bundle: true, format: "esm", platform: "node", target: "node22",
  sourcemap: false, logLevel: "info",
});
