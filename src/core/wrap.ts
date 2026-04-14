import { spawn } from "node:child_process";

import { reduceExecution } from "./reduce.js";

import type { WrapOptions, WrapResult } from "../types.js";

export async function runWrappedCommand(argv: string[], opts: WrapOptions = {}): Promise<WrapResult> {
  if (argv.length === 0) {
    throw new Error("wrap requires a command after --");
  }

  return await new Promise<WrapResult>((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd: opts.cwd,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      if (opts.tee) {
        process.stdout.write(text);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      if (opts.tee) {
        process.stderr.write(text);
      }
    });

    child.on("error", reject);
    child.on("close", async (code) => {
      try {
        const result = await reduceExecution(
          {
            toolName: "exec",
            command: argv.join(" "),
            argv,
            stdout,
            stderr,
            exitCode: code ?? 1,
          },
          {
            store: opts.store ?? true,
            ...(opts.storeDir ? { storeDir: opts.storeDir } : {}),
            ...(typeof opts.maxInlineChars === "number" ? { maxInlineChars: opts.maxInlineChars } : {}),
          },
        );

        resolve({
          result,
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}
