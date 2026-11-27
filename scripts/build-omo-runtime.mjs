import { build } from "esbuild";

await build({
  entryPoints: ["src/hosts/omo/extension/runtime.ts"],
  outfile: "dist/hosts/omo/extension/runtime.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
});
