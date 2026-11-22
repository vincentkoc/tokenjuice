import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { doctorCommands } from "../../src/cli/doctor-commands.js";
import { parseArgs } from "../../src/cli/main.js";
import { installAdalInstructions } from "../../src/hosts/adal/index.js";

const originalProjectDir = process.env.ADAL_PROJECT_DIR;
const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  if (originalProjectDir === undefined) {
    delete process.env.ADAL_PROJECT_DIR;
  } else {
    process.env.ADAL_PROJECT_DIR = originalProjectDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("doctor command exit codes", () => {
  it.each(["text", "json"])("reports broken and repaired instructions in %s mode", async (format) => {
    const projectDir = await mkdtemp(join(tmpdir(), "tokenjuice-doctor-command-"));
    tempDirs.push(projectDir);
    process.env.ADAL_PROJECT_DIR = projectDir;
    await writeFile(join(projectDir, "AGENTS.md"), [
      "<!-- tokenjuice:adal begin -->",
      "stale guidance",
      "<!-- tokenjuice:adal end -->",
    ].join("\n"));

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const handler = doctorCommands.get("adal")!;
    const args = parseArgs(["doctor", "adal", "--format", format]);
    const output = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join("");
    const status = () => format === "json"
      ? JSON.parse(output()).status
      : /^health: (\w+)$/mu.exec(output())?.[1];

    expect(await handler(args, "adal")).toBe(1);
    expect(status()).toBe("broken");

    await installAdalInstructions();
    stdout.mockClear();
    expect(await handler(args, "adal")).toBe(0);
    expect(status()).toBe("ok");
  });
});
