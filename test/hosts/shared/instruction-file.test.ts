import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectGuidanceIssues, writeInstructionFile } from "../../../src/hosts/shared/instruction-file.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-instruction-file-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("collectGuidanceIssues", () => {
  it("reports missing required guidance and present forbidden guidance in order", () => {
    const issues = collectGuidanceIssues("marker\nuse `tokenjuice wrap -- <command>`\nuse `tokenjuice wrap --full -- <command>`", {
      required: [
        { requiredText: "marker", missingIssue: "missing marker" },
        { requiredText: "tokenjuice wrap -- <command>", missingIssue: "missing wrap" },
        { requiredText: "tokenjuice wrap --raw -- <command>", missingIssue: "missing raw" },
      ],
      forbidden: [
        { forbiddenText: "tokenjuice wrap --full -- <command>", presentIssue: "has full" },
      ],
    });

    expect(issues).toEqual(["missing raw", "has full"]);
  });

  it("uses suffixed backups instead of overwriting an existing backup", async () => {
    const dir = await createTempDir();
    const filePath = join(dir, "RULES.md");
    await writeFile(filePath, "custom guidance\n", "utf8");

    const first = await writeInstructionFile(filePath, "generated guidance\n");
    const second = await writeInstructionFile(filePath, "updated generated guidance\n");

    expect(first.backupPath).toBe(`${filePath}.bak`);
    expect(second.backupPath).toBe(`${filePath}.bak.1`);
    await expect(readFile(`${filePath}.bak`, "utf8")).resolves.toBe("custom guidance\n");
    await expect(readFile(`${filePath}.bak.1`, "utf8")).resolves.toBe("generated guidance\n");
  });

  it("skips existing backup symlinks when choosing a backup path", async () => {
    const dir = await createTempDir();
    const filePath = join(dir, "RULES.md");
    const targetPath = join(dir, "outside-backup");
    await writeFile(filePath, "custom guidance\n", "utf8");
    await writeFile(targetPath, "outside\n", "utf8");
    await symlink(targetPath, `${filePath}.bak`);

    const result = await writeInstructionFile(filePath, "generated guidance\n");

    expect(result.backupPath).toBe(`${filePath}.bak.1`);
    await expect(readFile(targetPath, "utf8")).resolves.toBe("outside\n");
    await expect(readFile(`${filePath}.bak.1`, "utf8")).resolves.toBe("custom guidance\n");
  });

  it("skips dangling backup symlinks when choosing a backup path", async () => {
    const dir = await createTempDir();
    const filePath = join(dir, "RULES.md");
    await writeFile(filePath, "custom guidance\n", "utf8");
    await symlink(join(dir, "missing-backup-target"), `${filePath}.bak`);

    const result = await writeInstructionFile(filePath, "generated guidance\n");

    expect(result.backupPath).toBe(`${filePath}.bak.1`);
    await expect(readFile(`${filePath}.bak.1`, "utf8")).resolves.toBe("custom guidance\n");
  });
});
