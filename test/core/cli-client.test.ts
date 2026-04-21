import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runReduceJsonCli } from "../../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-cli-client-"));
  tempDirs.push(dir);
  return dir;
}

async function writeScript(source: string): Promise<string> {
  const dir = await createTempDir();
  const scriptPath = join(dir, "fake-reduce-json.mjs");
  await writeFile(scriptPath, source, "utf8");
  return scriptPath;
}

describe("runReduceJsonCli", () => {
  it("sends the request payload and parses the JSON response", async () => {
    const scriptPath = await writeScript(`
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
      const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      process.stdout.write(JSON.stringify({
        inlineText: request.input.command,
        stats: { rawChars: 10, reducedChars: 5, ratio: 0.5 },
        classification: { family: "test", confidence: 1, matchedReducer: "test/rule" }
      }));
    `);

    const result = await runReduceJsonCli(
      {
        input: {
          toolName: "exec",
          command: "pnpm test",
          combinedText: "ok",
        },
      },
      {
        command: [process.execPath, scriptPath],
      },
    );

    expect(result.inlineText).toBe("pnpm test");
    expect(result.classification.matchedReducer).toBe("test/rule");
  });

  it("surfaces non-zero exits with stderr", async () => {
    const scriptPath = await writeScript(`
      process.stderr.write("broken on purpose\\n");
      process.exit(7);
    `);

    await expect(
      runReduceJsonCli(
        {
          input: {
            toolName: "exec",
          },
        },
        {
          command: [process.execPath, scriptPath],
        },
      ),
    ).rejects.toThrow("broken on purpose");
  });

  it("does not leak unhandled EPIPE when the child exits before reading stdin", async () => {
    const scriptPath = await writeScript(`
      process.stderr.write("no stdin wanted\\n");
      process.exit(7);
    `);

    await expect(
      runReduceJsonCli(
        {
          input: {
            toolName: "exec",
            command: "fake command",
            combinedText: "payload",
          },
        },
        {
          command: [process.execPath, scriptPath],
        },
      ),
    ).rejects.toThrow("no stdin wanted");
  });

  it("rejects invalid JSON output", async () => {
    const scriptPath = await writeScript(`
      process.stdout.write("not-json");
    `);

    await expect(
      runReduceJsonCli(
        {
          input: {
            toolName: "exec",
          },
        },
        {
          command: [process.execPath, scriptPath],
        },
      ),
    ).rejects.toThrow("invalid JSON");
  });

  it("rejects oversized child output", async () => {
    const scriptPath = await writeScript(`
      process.stdout.write("x".repeat(4096));
    `);

    await expect(
      runReduceJsonCli(
        {
          input: {
            toolName: "exec",
          },
        },
        {
          command: [process.execPath, scriptPath],
          maxOutputBytes: 128,
        },
      ),
    ).rejects.toThrow("max output size");
  });
});
