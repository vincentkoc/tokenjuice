import { cp, mkdir } from "node:fs/promises";

await mkdir("dist/rules", { recursive: true });
await cp("src/rules", "dist/rules", { recursive: true });
