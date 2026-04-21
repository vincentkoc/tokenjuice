import { describe, expect, it } from "vitest";

import { reduceExecution, runWrappedCommand } from "../src/index.js";

describe("reduce trace", () => {
  it("includes normalized command and argv when trace is enabled", async () => {
    const result = await reduceExecution(
      {
        toolName: "exec",
        command: "bash -lc 'git status --short'",
        argv: ["bash", "-lc", "git status --short"],
        combinedText: " M src/core/reduce.ts\n",
        exitCode: 0,
      },
      { trace: true },
    );

    expect(result.trace?.normalizedCommand).toBe("git status --short");
    expect(result.trace?.normalizedArgv).toEqual(["git", "status", "--short"]);
    expect(result.trace?.matchedReducer).toBe("git/status");
  });

  it("does not emit trace block when trace is disabled", async () => {
    const result = await reduceExecution(
      {
        toolName: "exec",
        command: "git status --short",
        combinedText: " M src/core/reduce.ts\n",
        exitCode: 0,
      },
      {},
    );

    expect(result.trace).toBeUndefined();
  });

  it("classifies wrapped commands from absolute-path shell launchers", async () => {
    const result = await reduceExecution(
      {
        toolName: "exec",
        command: "/usr/bin/zsh -lc 'rg --files src'",
        argv: ["/usr/bin/zsh", "-lc", "rg --files src"],
        combinedText: "src/index.ts\nsrc/core/command.ts\nsrc/core/classify.ts\n",
        exitCode: 0,
      },
      { trace: true },
    );

    expect(result.trace?.normalizedCommand).toBe("rg --files src");
    expect(result.trace?.normalizedArgv).toEqual(["rg", "--files", "src"]);
    expect(result.trace?.matchedReducer).toBe("filesystem/rg-files");
  });

  it("propagates trace through wrap execution", async () => {
    const wrapped = await runWrappedCommand(["bash", "-lc", "git status --short"], {
      trace: true,
    });

    expect(wrapped.result.trace?.normalizedCommand).toBe("git status --short");
    expect(wrapped.result.trace?.normalizedArgv).toEqual(["git", "status", "--short"]);
    expect(wrapped.result.trace?.matchedReducer).toBe("git/status");
  });
});
