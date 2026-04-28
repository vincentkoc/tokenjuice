import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ARTIFACT_DIR_ENV } from "../../src/index.js";

export default async function setup(): Promise<() => Promise<void>> {
  const artifactDir = await mkdtemp(join(tmpdir(), "tokenjuice-vitest-artifacts-"));
  process.env[ARTIFACT_DIR_ENV] = artifactDir;

  return async () => {
    delete process.env[ARTIFACT_DIR_ENV];
    await rm(artifactDir, { recursive: true, force: true });
  };
}
