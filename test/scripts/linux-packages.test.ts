import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempDirs = new Set<string>();

afterEach(async () => {
  await Promise.all([...tempDirs].map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.clear();
});

async function checkDependencies(deb: string, rpm: string) {
  const root = await mkdtemp(join(tmpdir(), "tokenjuice-linux-packages-test-"));
  tempDirs.add(root);
  for (const dir of ["scripts", "packaging", "release", "bin"]) {
    await mkdir(join(root, dir));
  }
  await copyFile(new URL("../../scripts/build-linux-packages.mjs", import.meta.url), join(root, "scripts/build-linux-packages.mjs"));
  await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.2.3", engines: { node: ">=22" } }));
  await writeFile(join(root, "packaging/nfpm.yaml"), "version: __VERSION__\narch: __ARCH__\n");
  // Fake inspector output exercises the release gate; CI also builds and inspects real packages.
  await writeFile(join(root, "bin/nfpm"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  await writeFile(join(root, "bin/dpkg-deb"), '#!/bin/sh\nprintf "%s\\n" "$TEST_DEB_DEPENDENCIES"\n', { mode: 0o755 });
  await writeFile(join(root, "bin/rpm"), '#!/bin/sh\nprintf "%s\\n" "$TEST_RPM_DEPENDENCIES"\n', { mode: 0o755 });
  return execFileAsync(process.execPath, [join(root, "scripts/build-linux-packages.mjs")], {
    env: {
      ...process.env,
      PATH: `${join(root, "bin")}${delimiter}${process.env.PATH ?? ""}`,
      TEST_DEB_DEPENDENCIES: deb,
      TEST_RPM_DEPENDENCIES: rpm,
    },
  });
}

describe("Linux package runtime dependency gate", () => {
  it("accepts the engine minimum alongside unrelated dependencies", async () => {
    await expect(checkDependencies("bash, nodejs (>= 22)", "/bin/sh\nnodejs >= 22\nrpmlib(PayloadIsXz) <= 5.2-1"))
      .resolves.toMatchObject({ stdout: expect.stringContaining("verified DEB and RPM require Node.js >= 22") });
  });

  it.each(["nodejs", "nodejs (>= 20)", "nodejs (>= 22) | alternative-node"])("rejects weakened DEB dependency %s", async (dependency) => {
    await expect(checkDependencies(dependency, "nodejs >= 22"))
      .rejects.toMatchObject({ stderr: expect.stringContaining("DEB must require nodejs >= 22") });
  });

  it.each(["nodejs", "nodejs >= 20", "nodejs = 22"])("rejects an RPM dependency that does not match the engine minimum: %s", async (dependency) => {
    await expect(checkDependencies("nodejs (>= 22)", dependency))
      .rejects.toMatchObject({ stderr: expect.stringContaining("RPM must require nodejs >= 22") });
  });
});
