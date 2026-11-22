import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EXPECTED_HELP, VERSION_LINE } from "./helpers/run-dist.js";
import { runCli } from "./helpers/run-cli.js";

const tempDirs: string[] = [];
const RUN_CLI_TIMEOUT_MS = 15_000;

async function writeTempInput(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-cli-input-"));
  tempDirs.push(dir);
  const file = join(dir, name);
  await writeFile(file, content, "utf8");
  return file;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const DIRECT_REDUCE_JSON = JSON.stringify({
  toolName: "exec",
  command: "echo hi",
  combinedText: "hello\n",
  exitCode: 0,
});

const ENVELOPE_REDUCE_JSON = JSON.stringify({
  input: {
    toolName: "exec",
    command: "pnpm test",
    combinedText: "ok",
    exitCode: 0,
  },
  options: {
    classifier: "tests/pnpm-test",
    raw: true,
    noOmit: true,
    store: true,
    maxInlineChars: 800,
  },
});

describe("core command in-process dispatch", () => {
  describe("help, version, and error paths", () => {
    it("bare invocation prints usage and exits 0", async () => {
      const result = await runCli([]);
      expect(result.rejected).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(EXPECTED_HELP);
    });

    it("unknown command prints usage and exits 1", async () => {
      const result = await runCli(["definitely-not-a-command"]);
      expect(result.rejected).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(EXPECTED_HELP);
    });

    it("prints byte-exact usage for --help", async () => {
      const result = await runCli(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(EXPECTED_HELP);
    });

    it("prints byte-exact usage for -h", async () => {
      const result = await runCli(["-h"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe(EXPECTED_HELP);
    });

    it("prints byte-exact usage for help", async () => {
      const result = await runCli(["help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe(EXPECTED_HELP);
    });

    it("prints byte-exact version for --version", async () => {
      const result = await runCli(["--version"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(VERSION_LINE);
      expect(result.stderr).toBe("");
    });

    it("prints byte-exact version for -v", async () => {
      const result = await runCli(["-v"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(VERSION_LINE);
    });

    it("prints byte-exact version for version", async () => {
      const result = await runCli(["version"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(VERSION_LINE);
    });
  });

  describe("reduce", () => {
    it("reads stdin and exits 0", async () => {
      const file = await writeTempInput("sample.txt", "hello\n");
      const result = await runCli(["reduce", file]);
      expect(result.rejected).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("hello\n");
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("supports json, raw, store, classifier, and trace flags", async () => {
      const file = await writeTempInput("sample.txt", "line one\nline two\n");
      const result = await runCli(
        ["reduce", file, "--format", "json", "--raw", "--store", "--classifier", "generic/fallback", "--trace"],
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith("{\n")).toBe(true);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("supports --by-source, --no-omit, --min-reduce-chars, and --max-inline-chars", async () => {
      const file = await writeTempInput("sample.txt", "sample output\n");
      const result = await runCli(
        [
          "reduce",
          file,
          "--by-source",
          "--no-omit",
          "--min-reduce-chars",
          "16384",
          "--max-inline-chars",
          "800",
        ],
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.endsWith("\n")).toBe(true);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("reads a file when provided", async () => {
      const file = await writeTempInput("sample.txt", "file contents\n");
      const result = await runCli(["reduce", file]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.endsWith("\n")).toBe(true);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);
  });

  describe("reduce-json", () => {
    it("accepts a direct ToolExecutionInput payload", async () => {
      const file = await writeTempInput("request.json", `${DIRECT_REDUCE_JSON}\n`);
      const result = await runCli(["reduce-json", file]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith("{\n")).toBe(true);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("accepts an envelope payload with options", async () => {
      const file = await writeTempInput("request.json", `${ENVELOPE_REDUCE_JSON}\n`);
      const result = await runCli(["reduce-json", file]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith("{\n")).toBe(true);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("rejects empty stdin with exit 1", async () => {
      const file = await writeTempInput("request.json", "");
      const result = await runCli(["reduce-json", file]);
      expect(result.rejected).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("reduce-json requires JSON input from stdin or a file\n");
    }, RUN_CLI_TIMEOUT_MS);

    it("rejects malformed JSON with exit 1", async () => {
      const file = await writeTempInput("request.json", "not json\n");
      const result = await runCli(["reduce-json", file]);
      expect(result.rejected).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("not valid JSON");
    }, RUN_CLI_TIMEOUT_MS);

    it("rejects invalid envelope payloads with exit 1", async () => {
      const file = await writeTempInput(
        "request.json",
        `${JSON.stringify({ input: { command: "pnpm test" } })}\n`,
      );
      const result = await runCli(["reduce-json", file]);
      expect(result.rejected).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("input.toolName must be a non-empty string\n");
    }, RUN_CLI_TIMEOUT_MS);
  });

  describe("wrap", () => {
    it("dispatches to the wrapped command", async () => {
      const result = await runCli(["wrap", "--", "printf", "wrapped"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("wrapped");
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("preserves the wrapped command exit code", async () => {
      const result = await runCli(["wrap", "--", "false"]);
      expect(result.rejected).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("supports raw, tee, store, source, and trace flags", async () => {
      const result = await runCli([
        "wrap",
        "--raw",
        "--tee",
        "--store",
        "--source",
        "wrap",
        "--trace",
        "--",
        "printf",
        "ok",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);
  });

  describe("ls", () => {
    it("exits 0", async () => {
      const result = await runCli(["ls"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("supports json output", async () => {
      const result = await runCli(["ls", "--format", "json"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith("[")).toBe(true);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);
  });

  describe("verify", () => {
    it("exits 0", async () => {
      const result = await runCli(["verify"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith("ok:")).toBe(true);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("supports fixtures and json output", async () => {
      const result = await runCli(["verify", "--fixtures", "--format", "json"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith("{\n")).toBe(true);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);
  });

  describe("discover", () => {
    it("with flags exits 0", async () => {
      const file = await writeTempInput("sample.txt", "sample output\n");
      const result = await runCli([
        "discover",
        file,
        "--source-command",
        "echo hi",
        "--tool-name",
        "exec",
        "--exit-code",
        "0",
        "--source",
        "wrap",
        "--by-source",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("supports json output and analysis flags", async () => {
      const file = await writeTempInput("sample.txt", "sample\n");
      const result = await runCli([
        "discover",
        file,
        "--format",
        "json",
        "--source-command",
        "echo hi",
        "--tool-name",
        "exec",
        "--exit-code",
        "0",
        "--source",
        "wrap",
        "--by-source",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith("{\n")).toBe(true);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("reads a file when provided", async () => {
      const file = await writeTempInput("sample.txt", "discover me\n");
      const result = await runCli(["discover", file, "--exit-code", "0"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);
  });

  describe("stats", () => {
    it("exits 0", async () => {
      const result = await runCli(["stats", "--by-source"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^entries: /m);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);

    it("supports json output and timezone filtering", async () => {
      const result = await runCli(["stats", "--format", "json", "--timezone", "utc", "--by-source"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith("{\n")).toBe(true);
      expect(result.stderr).toBe("");
    }, RUN_CLI_TIMEOUT_MS);
  });

  describe("cat", () => {
    it("without id exits 1", async () => {
      const result = await runCli(["cat"]);
      expect(result.rejected).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("cat requires an artifact id\n");
    }, RUN_CLI_TIMEOUT_MS);

    it("with missing artifact exits 1", async () => {
      const result = await runCli(["cat", "tj_missing"]);
      expect(result.rejected).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("artifact not found: tj_missing\n");
    }, RUN_CLI_TIMEOUT_MS);
  });
});
