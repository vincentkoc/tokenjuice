import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { doctorAnteInstructions, installAnteInstructions, uninstallAnteInstructions } from "../../src/index.js";

const dirs: string[] = [];
const originalCwd = process.cwd();
afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function sandbox() {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-ante-test-"));
  dirs.push(dir);
  return dir;
}

describe("Ante instructions", () => {
  it("installs idempotent guidance and removes only its own block", async () => {
    const root = await sandbox();
    const path = join(root, "AGENTS.md");
    const original = "# project rules\n\n<!-- tokenjuice:other begin -->\nkeep this\n<!-- tokenjuice:other end -->\n";
    await writeFile(path, original);
    expect((await doctorAnteInstructions(path)).status).toBe("disabled");
    const first = await installAnteInstructions(path);
    expect(await readFile(first.backupPath!, "utf8")).toBe(original);
    const installed = await readFile(path, "utf8");
    expect(installed).toContain("through Ante");
    expect(installed).toContain("tokenjuice wrap --raw -- <command>");
    await installAnteInstructions(path);
    expect(await readFile(path, "utf8")).toBe(installed);
    expect((await doctorAnteInstructions(path)).status).toBe("ok");
    expect((await uninstallAnteInstructions(path)).removed).toBe(true);
    expect(await readFile(path, "utf8")).toBe(original);
    expect((await uninstallAnteInstructions(path)).removed).toBe(false);
  });

  it("uses the nearest CLAUDE.md fallback without shadowing it with a new AGENTS.md", async () => {
    const root = await sandbox();
    const nested = join(root, "nested");
    await mkdir(join(root, ".git"));
    await mkdir(nested);
    await writeFile(join(root, "AGENTS.md"), "root rules\n");
    await writeFile(join(nested, "CLAUDE.md"), "nested rules\n");
    process.chdir(nested);
    const result = await installAnteInstructions();
    expect(result.instructionsPath).toBe(join(nested, "CLAUDE.md"));
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("root rules\n");
    await expect(readFile(join(nested, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await doctorAnteInstructions()).status).toBe("ok");
  });

  it("prefers AGENTS.md to CLAUDE.md and creates a project file when neither exists", async () => {
    const root = await sandbox();
    const options = { projectDir: root };
    expect((await installAnteInstructions(undefined, options)).instructionsPath).toBe(join(root, "AGENTS.md"));
    await writeFile(join(root, "CLAUDE.md"), "fallback\n");
    expect((await doctorAnteInstructions(undefined, options)).instructionsPath).toBe(join(root, "AGENTS.md"));
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("fallback\n");
  });

  it("refuses to overwrite or uninstall unmatched markers", async () => {
    const root = await sandbox();
    const path = join(root, "AGENTS.md");
    const original = "<!-- tokenjuice:ante begin -->\nkeep these rules\n";
    await writeFile(path, original);
    expect((await doctorAnteInstructions(path)).status).toBe("broken");
    await expect(installAnteInstructions(path)).rejects.toThrow("malformed");
    await expect(uninstallAnteInstructions(path)).rejects.toThrow("malformed");
    expect(await readFile(path, "utf8")).toBe(original);
  });
});
