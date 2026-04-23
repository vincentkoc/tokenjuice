import { describe, expect, it } from "vitest";

import { repairPosixShimText } from "../../scripts/repair-pnpm-bin-shims.mjs";

describe("repairPosixShimText", () => {
  it("repairs broken pnpm relative targets back to the local virtual store", () => {
    const shimPath = "/Users/vincentkoc/GIT/_Perso/tokenjuice/node_modules/.bin/vitest";
    const projectRoot = "/Users/vincentkoc/GIT/_Perso/tokenjuice";
    const brokenText = `#!/bin/sh
if [ -x "$basedir/node" ]; then
  exec "$basedir/node"  "$basedir/../../../../../../GIT/_Perso/tokenjuice/node_modules/.pnpm/vitest@3.2.4/node_modules/vitest/vitest.mjs" "$@"
else
  exec node  "$basedir/../../../../../../GIT/_Perso/tokenjuice/node_modules/.pnpm/vitest@3.2.4/node_modules/vitest/vitest.mjs" "$@"
fi
`;

    const result = repairPosixShimText({
      text: brokenText,
      shimPath,
      projectRoot,
      targetExists: (path) => path === "/Users/vincentkoc/GIT/_Perso/tokenjuice/node_modules/.pnpm/vitest@3.2.4/node_modules/vitest/vitest.mjs",
    });

    expect(result.changed).toBe(true);
    expect(result.text).toContain(`"$basedir/../.pnpm/vitest@3.2.4/node_modules/vitest/vitest.mjs"`);
    expect(result.text).not.toContain("../../../../../../GIT/_Perso/tokenjuice");
  });

  it("leaves healthy pnpm shims untouched", () => {
    const shimPath = "/Users/vincentkoc/GIT/_Perso/tokenjuice/node_modules/.bin/vitest";
    const projectRoot = "/Users/vincentkoc/GIT/_Perso/tokenjuice";
    const healthyText = `#!/bin/sh
if [ -x "$basedir/node" ]; then
  exec "$basedir/node"  "$basedir/../.pnpm/vitest@3.2.4/node_modules/vitest/vitest.mjs" "$@"
else
  exec node  "$basedir/../.pnpm/vitest@3.2.4/node_modules/vitest/vitest.mjs" "$@"
fi
`;

    const result = repairPosixShimText({
      text: healthyText,
      shimPath,
      projectRoot,
      targetExists: (path) => path === "/Users/vincentkoc/GIT/_Perso/tokenjuice/node_modules/.pnpm/vitest@3.2.4/node_modules/vitest/vitest.mjs",
    });

    expect(result.changed).toBe(false);
    expect(result.text).toBe(healthyText);
  });

  it("ignores shims when the target cannot be mapped back into the local virtual store", () => {
    const shimPath = "/Users/vincentkoc/GIT/_Perso/tokenjuice/node_modules/.bin/custom";
    const projectRoot = "/Users/vincentkoc/GIT/_Perso/tokenjuice";
    const brokenText = `#!/bin/sh
exec node "$basedir/../../../../../../GIT/_Perso/tokenjuice/node_modules/.pnpm/custom@1.0.0/node_modules/custom/bin.js" "$@"
`;

    const result = repairPosixShimText({
      text: brokenText,
      shimPath,
      projectRoot,
      targetExists: () => false,
    });

    expect(result.changed).toBe(false);
    expect(result.text).toBe(brokenText);
  });
});
