import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli/main.js";

let home: string;
let originalArgv: string[];
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "tokenjuice-qoder-cli-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("PATH", home);
  originalArgv = [...process.argv];
  const launcher = join(home, "tokenjuice");
  await writeFile(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  process.argv[1] = launcher;
});
afterEach(async () => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

async function json(args: string[]) {
  let output = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  try {
    const code = await main([...args, "--format", "json"]);
    return { code, value: JSON.parse(output) };
  } finally { spy.mockRestore(); }
}

describe("Qoder CLI native target", () => {
  it("installs and diagnoses user hooks independently of the instruction target", async () => {
    expect((await json(["doctor", "qoder-cli", "--local"])).value.status).toBe("disabled");
    const installed = await json(["install", "qoder-cli", "--local"]);
    expect(installed.code).toBe(0);
    expect(installed.value.settingsPath).toBe(join(home, ".qoder", "settings.json"));
    const settings = JSON.parse(await readFile(installed.value.settingsPath, "utf8"));
    expect(settings.hooks.PostToolUse[0].matcher).toBe("Bash");
    expect(settings.hooks.PostToolUse[0].hooks[0].async).toBe(false);
    expect((await json(["doctor", "qoder-cli", "--local"])).value.status).toBe("ok");
    expect((await json(["uninstall", "qoder-cli"])).value.removed).toBe(1);
    expect((await json(["uninstall", "qoder-cli"])).value.removed).toBe(0);
  });

  it("reports malformed settings as broken JSON without aborting diagnostics", async () => {
    const installed = await json(["install", "qoder-cli", "--local"]);
    await writeFile(installed.value.settingsPath, "{broken");
    const report = await json(["doctor", "qoder-cli", "--local"]);
    expect(report.code).toBe(1);
    expect(report.value.status).toBe("broken");
    expect(report.value.issues).toHaveLength(1);
  });

  it("returns a failing doctor status for asynchronous replacement hooks", async () => {
    const installed = await json(["install", "qoder-cli", "--local"]);
    const settings = JSON.parse(await readFile(installed.value.settingsPath, "utf8"));
    settings.hooks.PostToolUse[0].hooks[0].async = true;
    await writeFile(installed.value.settingsPath, JSON.stringify(settings));
    const report = await json(["doctor", "qoder-cli", "--local"]);
    expect(report.code).toBe(1);
    expect(report.value.status).toBe("broken");
  });
});
