import { spawn } from "node:child_process";

import { reduceExecution } from "./reduce.js";

import type { WrapOptions, WrapResult } from "../types.js";

const DEFAULT_MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const CAPTURE_TRUNCATED_SUFFIX = "\n[tokenjuice: output truncated]\n";

type CapturedStream = {
  text: string;
  bytes: number;
  truncated: boolean;
};

function appendCapturedChunk(
  current: CapturedStream,
  chunk: Buffer,
  limitBytes: number,
): CapturedStream {
  if (current.truncated || limitBytes <= 0) {
    return current.truncated
      ? current
      : {
          text: CAPTURE_TRUNCATED_SUFFIX,
          bytes: 0,
          truncated: true,
        };
  }

  const remaining = limitBytes - current.bytes;
  if (remaining <= 0) {
    return {
      text: `${current.text}${CAPTURE_TRUNCATED_SUFFIX}`,
      bytes: current.bytes,
      truncated: true,
    };
  }

  if (chunk.length <= remaining) {
    return {
      text: `${current.text}${chunk.toString("utf8")}`,
      bytes: current.bytes + chunk.length,
      truncated: false,
    };
  }

  return {
    text: `${current.text}${chunk.subarray(0, remaining).toString("utf8")}${CAPTURE_TRUNCATED_SUFFIX}`,
    bytes: limitBytes,
    truncated: true,
  };
}

export async function runWrappedCommand(argv: string[], opts: WrapOptions = {}): Promise<WrapResult> {
  if (argv.length === 0) {
    throw new Error("wrap requires a command after --");
  }

  return await new Promise<WrapResult>((resolve, reject) => {
    const maxCaptureBytes = typeof opts.maxCaptureBytes === "number"
      ? opts.maxCaptureBytes
      : DEFAULT_MAX_CAPTURE_BYTES;
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd: opts.cwd,
      shell: false,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout: CapturedStream = { text: "", bytes: 0, truncated: false };
    let stderr: CapturedStream = { text: "", bytes: 0, truncated: false };
    let combined: CapturedStream = { text: "", bytes: 0, truncated: false };

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout = appendCapturedChunk(stdout, chunk, maxCaptureBytes);
      combined = appendCapturedChunk(combined, chunk, maxCaptureBytes);
      if (opts.tee) {
        process.stdout.write(text);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = appendCapturedChunk(stderr, chunk, maxCaptureBytes);
      combined = appendCapturedChunk(combined, chunk, maxCaptureBytes);
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
            stdout: stdout.text,
            stderr: stderr.text,
            combinedText: combined.text,
            exitCode: code ?? 1,
          },
          {
            raw: opts.raw ?? false,
            trace: opts.trace ?? false,
            recordStats: opts.recordStats ?? false,
            store: opts.store ?? false,
            ...(opts.storeDir ? { storeDir: opts.storeDir } : {}),
            ...(typeof opts.maxInlineChars === "number" ? { maxInlineChars: opts.maxInlineChars } : {}),
          },
        );

        resolve({
          result,
          exitCode: code ?? 1,
          stdout: stdout.text,
          stderr: stderr.text,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}
