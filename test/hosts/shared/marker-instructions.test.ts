import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  collectMarkerDelimitedBlockIssues,
  installMarkerDelimitedBlock,
  inspectMarkerDelimitedBlock,
} from "../../../src/hosts/shared/marker-instructions.js";

const config = {
  beginMarker: "<!-- tokenjuice:begin -->",
  endMarker: "<!-- tokenjuice:end -->",
  block: "<!-- tokenjuice:begin -->\nbody\n<!-- tokenjuice:end -->",
};

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-marker-instructions-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("marker instruction helpers", () => {
  it("reports unmatched and duplicate marker blocks", () => {
    const startOnly = inspectMarkerDelimitedBlock("prefix\n<!-- tokenjuice:begin -->\nbody", config);
    expect(collectMarkerDelimitedBlockIssues(startOnly, {
      configuredLabel: "Zed rules",
      repairCommand: "tokenjuice install zed",
    })).toEqual(["configured Zed rules have a tokenjuice start marker without an end marker"]);

    const duplicate = inspectMarkerDelimitedBlock(`${config.block}\n\n${config.block}`, config);
    expect(collectMarkerDelimitedBlockIssues(duplicate, {
      configuredLabel: "Zed rules",
      repairCommand: "tokenjuice install zed",
    })).toEqual(["configured Zed rules have multiple tokenjuice blocks; run tokenjuice install zed to repair"]);
  });

  it("does not create backups when reinstalling an unchanged marker block", async () => {
    const dir = await createTempDir();
    const filePath = join(dir, "RULES.md");

    await installMarkerDelimitedBlock(filePath, config);
    const result = await installMarkerDelimitedBlock(filePath, config);

    expect(result.backupPath).toBeUndefined();
    await expect(readFile(filePath, "utf8")).resolves.toBe(`${config.block}\n`);
    await expect(readFile(`${filePath}.bak`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
