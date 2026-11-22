import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EXPECTED_HELP, runDist } from "./helpers/run-dist.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("argv dispatch contracts", () => {
  it("bare invocation prints usage and exits 0", async () => {
    const result = await runDist([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(EXPECTED_HELP);
  });

  it("unknown command prints usage and exits 1", async () => {
    const result = await runDist(["definitely-not-a-command"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(EXPECTED_HELP);
  });

  it("reduce reads stdin and exits 0", async () => {
    const result = await runDist(["reduce"], "hello\n");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello\n");
    expect(result.stderr).toBe("");
  });

  it("reduce-json rejects empty stdin with exit 1", async () => {
    const result = await runDist(["reduce-json"], "");
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("reduce-json requires JSON input from stdin or a file\n");
  });

  it("wrap dispatches to the wrapped command", async () => {
    const result = await runDist(["wrap", "--", "printf", "wrapped"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("wrapped");
    expect(result.stderr).toBe("");
  });

  it("ls exits 0", async () => {
    const result = await runDist(["ls"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("verify exits 0", async () => {
    const result = await runDist(["verify"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.startsWith("ok:")).toBe(true);
    expect(result.stderr).toBe("");
  });

  it("discover with flags exits 0", async () => {
    const result = await runDist(
      [
        "discover",
        "--source-command",
        "echo hi",
        "--tool-name",
        "exec",
        "--exit-code",
        "0",
        "--source",
        "wrap",
        "--by-source",
      ],
      "sample output\n",
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("stats exits 0", async () => {
    const result = await runDist(["stats", "--by-source"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^entries: /m);
    expect(result.stderr).toBe("");
  });

  it("doctor default exits 0", async () => {
    const result = await runDist(["doctor"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^entries: /m);
    expect(result.stderr).toBe("");
  });

  it("cat without id exits 1", async () => {
    const result = await runDist(["cat"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cat requires an artifact id\n");
  });

  it("cat with missing artifact exits 1", async () => {
    const result = await runDist(["cat", "tj_missing"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("artifact not found: tj_missing\n");
  });

  it("install without target exits 1", async () => {
    const result = await runDist(["install"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.startsWith("install currently supports:")).toBe(true);
  });

  it("uninstall without target exits 1", async () => {
    const result = await runDist(["uninstall"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.startsWith("uninstall currently supports:")).toBe(true);
  });

  it("reduce-json with valid stdin exits 0", async () => {
    const result = await runDist(
      ["reduce-json"],
      `${JSON.stringify({
        input: {
          toolName: "exec",
          command: "echo hi",
          combinedText: "hello\n",
          exitCode: 0,
        },
      })}\n`,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.startsWith("{\n")).toBe(true);
    expect(result.stderr).toBe("");
  });

  it("reduce reads a file when provided", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tokenjuice-reduce-file-"));
    tempDirs.push(dir);
    const file = join(dir, "sample.txt");
    await writeFile(file, "file contents\n", "utf8");
    const result = await runDist(["reduce", file]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stderr).toBe("");
  });

  it("discover reads a file when provided", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tokenjuice-discover-file-"));
    tempDirs.push(dir);
    const file = join(dir, "sample.txt");
    await writeFile(file, "discover me\n", "utf8");
    const result = await runDist(["discover", file, "--exit-code", "0"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });
});
