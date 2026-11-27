import { describe, expect, it } from "vitest";

import { reduceExecution } from "../../src/index.js";

const buildProgress = Array.from({ length: 40 }, (_, i) => "#7 0.100 writing build progress " + i);
const compilerProgress = Array.from({ length: 40 }, (_, i) => "cc -c unit-" + i + ".c -o unit-" + i + ".o");
const missingHeaders = ["first", "second", "third"].map((name) =>
  name + ".c:1:10: fatal error: missing-" + name + ".h: No such file or directory");
const npmErrors = [
  "#7 0.314 npm ERR! code E404",
  "#7 0.315 npm ERR! 404 missing-dependency@1.0.0",
  "#7 ERROR: process did not complete successfully: exit code: 1",
];

const lockfileText = JSON.stringify({
  name: "fixture",
  lockfileVersion: 3,
  packages: Object.fromEntries(Array.from({ length: 80 }, (_, i) => ["node_modules/pkg-" + i, { version: "1.0.0" }])),
}, null, 2) + "\n";

describe("result fidelity", () => {
  it.each([
    ["make -k", "task/make", missingHeaders, compilerProgress],
    ["docker build .", "devops/docker-build", npmErrors, buildProgress],
  ] as const)("retains every actionable middle diagnostic for failed %s", async (command, reducer, diagnostics, noise) => {
    const combinedText = [...noise, ...diagnostics.flatMap((line) => [line, ...noise]), "Build stopped."].join("\n");
    const result = await reduceExecution({ toolName: "exec", command, combinedText, exitCode: 2 });

    expect(result.classification.matchedReducer).toBe(reducer);
    expect(result.inlineText).toContain("exit 2");
    for (const line of diagnostics) expect(result.inlineText).toContain(line);
    expect(result.inlineText.length).toBeLessThan(combinedText.length);
    expect(result.compaction?.authoritative).toBe(true);
  });

  it("prioritizes a missing Make prerequisite alongside a compiler diagnostic", async () => {
    const missingTarget = "make: *** No rule to make target 'missing-target', needed by 'all'.";
    const compiler = missingHeaders[0]!;
    const combinedText = [missingTarget, ...compilerProgress, compiler, ...compilerProgress, "make: *** [Makefile:5: unit] Error 1"].join("\n");
    const result = await reduceExecution({ toolName: "exec", command: "make -k", combinedText, exitCode: 2 });
    expect(result.inlineText).toContain(missingTarget);
    expect(result.inlineText).toContain(compiler);
    expect(result.compaction?.authoritative).toBe(true);
  });

  it("recognizes a recursive Make stop, but not a recipe exit wrapper alone, as a cause", async () => {
    const wrapper = "make[1]: *** [Makefile:8: unit] Error 2";
    const wrapperOnly = [...compilerProgress, wrapper, ""].join("\n");
    const input = { toolName: "exec", command: "make", exitCode: 2 };
    const passthrough = await reduceExecution({ ...input, combinedText: wrapperOnly });
    expect(passthrough.inlineText).toBe(wrapperOnly);

    const stop = "make[1]: *** No targets specified and no makefile found.  Stop.";
    const stopped = await reduceExecution({ ...input, combinedText: [stop, wrapperOnly].join("\n") });
    expect(stopped.inlineText).toContain(stop);
    expect(stopped.compaction?.authoritative).toBe(true);
  });

  it.each([2, undefined])("keeps the raw build when diagnostics cannot fit, exit=%s", async (exitCode) => {
    const combinedText = "\n#7 [2/2] RUN npm install\n#7 0.253 npm ERR! 404 "
      + "missing-dependency ".repeat(80) + "\n#7 ERROR: failed to solve\n";
    const result = await reduceExecution({ toolName: "exec", command: "docker build .", combinedText, exitCode }, { maxInlineChars: 200 });
    expect(result.inlineText).toBe(combinedText);
    expect(result.stats.ratio).toBe(1);
  });

  it("keeps raw output if the only error marker is the build wrapper failure", async () => {
    const combinedText = [...buildProgress, "#7 ERROR: process did not complete successfully: exit code: 1", ""].join("\n");
    const result = await reduceExecution({ toolName: "exec", command: "docker build .", combinedText, exitCode: 1 });
    expect(result.inlineText).toBe(combinedText);
    expect(result.stats.ratio).toBe(1);
  });

  it.each([
    ["git status --porcelain=v1", " M src/file-", "\n"],
    ["git -C repo status --porcelain=v2", "1 .M N... 100644 100644 100644 0123456 0123456 src/file-", "\n"],
    ["git status --porc=v2", "1 .M N... 100644 100644 100644 0123456 0123456 src/file-", "\n"],
    ["git status -sz", " M src/file-", "\0"],
    ["bash -lc 'git ls-files -z'", "src/file-", "\0"],
    ["git -c alias.names=ls-files names -z", "src/file-", "\0"],
  ])("keeps bulk explicit machine output from %s verbatim", async (command, prefix, separator) => {
    const combinedText = Array.from({ length: 150 }, (_, i) => prefix + i + ".ts" + separator).join("");
    const result = await reduceExecution({ toolName: "exec", command, combinedText, exitCode: 0 });
    expect(result.inlineText === combinedText).toBe(true);
    expect(result.stats.ratio).toBe(1);
  });

  it.each([{}, { noOmit: true }])("keeps cat package-lock.json byte-for-byte with options %j", async (options) => {
    for (const file of ["regular.json", "package-lock.json"]) {
      const result = await reduceExecution({ toolName: "exec", command: "cat " + file, combinedText: lockfileText, exitCode: 0 }, options);
      expect(result.inlineText === lockfileText).toBe(true);
    }
  });

  it("does not treat a machine-directed jq invocation as a lockfile summary", async () => {
    const combinedText = JSON.stringify(JSON.parse(lockfileText)) + "\n";
    const result = await reduceExecution({ toolName: "exec", command: "jq -c . package-lock.json", combinedText, exitCode: 0 });
    expect(result.inlineText === combinedText).toBe(true);
  });
});
