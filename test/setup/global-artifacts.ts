import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_ARTIFACT_DIR_ENV = "TOKENJUICE_TEST_ARTIFACT_DIR";

export default async function setup(): Promise<() => Promise<void>> {
  const artifactDir = await mkdtemp(join(tmpdir(), "tokenjuice-vitest-artifacts-"));
  process.env[TEST_ARTIFACT_DIR_ENV] = artifactDir;

  return async () => {
    delete process.env[TEST_ARTIFACT_DIR_ENV];
    await rm(artifactDir, { recursive: true, force: true });
  };
}
