import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const hasPython3 = spawnSync("python3", ["--version"], { stdio: "ignore" }).status === 0;
const testFile = fileURLToPath(new URL("./test_bridge.py", import.meta.url));

describe("python bridge", () => {
  it.skipIf(!hasPython3)("resolves the CLI launcher and reports failures", () => {
    const result = spawnSync("python3", ["-B", testFile, "-v"], { encoding: "utf8", timeout: 60_000 });
    if (result.status !== 0) {
      throw new Error(`${result.stdout}\n${result.stderr}`);
    }
    expect(result.stderr).toMatch(/OK/u);
  });
});
