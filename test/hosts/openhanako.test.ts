import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import openHanakoExtension, { compactOpenHanakoResult } from "../../src/hosts/openhanako/index.js";

const output = Array.from({ length: 80 }, (_, i) => `fixtures/example-${i}.json`).join("\n");
const command = "find fixtures -type f";
const makeEvent = () => ({
  toolName: "exec_command",
  input: { cmd: command, tty: false },
  content: [{ type: "text", text: output, custom: "preserve" }],
  details: { execCommand: { cmd: command, workdir: "/workspace/demo", tty: false, ok: true, exitCode: 0, transportError: false }, native: "preserve" },
});

describe("OpenHanako native result plugin", () => {
  beforeEach(() => vi.stubEnv("TOKENJUICE_STATS", "off"));
  afterEach(() => vi.unstubAllEnvs());

  it("compacts completed exec_command output and retains native metadata", async () => {
    const event = makeEvent();
    const patch = await compactOpenHanakoResult(event);
    expect(patch?.content[0]?.text).toContain("80 matches");
    expect(patch?.content[0]?.custom).toBe("preserve");
    expect(patch?.details).toBe(event.details);
    expect(event.content[0]?.text).toBe(output);
  });

  it.each([
    ["failed", { ok: false, exitCode: 7 }],
    ["missing exit", { exitCode: undefined }],
    ["missing completion", { ok: undefined }],
    ["transport error", { transportError: true }],
    ["TTY", { tty: true }],
    ["unknown TTY", { tty: undefined }],
    ["error code", { errorCode: "FAILED" }],
  ])("preserves %s results", async (_name, change) => {
    const event = makeEvent();
    Object.assign(event.details.execCommand, change);
    expect(await compactOpenHanakoResult(event)).toBeUndefined();
  });

  it("preserves truncation, alternate projections and partial updates", async () => {
    const event = makeEvent();
    expect(await compactOpenHanakoResult({ ...event, details: { ...event.details, fullOutputPath: "/tmp/native-output" } })).toBeUndefined();
    expect(await compactOpenHanakoResult({ ...event, details: { ...event.details, truncation: { truncated: true } } })).toBeUndefined();
    expect(await compactOpenHanakoResult({ ...event, content: [...event.content, { type: "image", data: "opaque" }] })).toBeUndefined();
    expect(await compactOpenHanakoResult({ ...event, details: {} })).toBeUndefined();
    expect(await compactOpenHanakoResult({ ...event, isError: true })).toBeUndefined();
    expect(await compactOpenHanakoResult({ ...event, toolName: "write_stdin" })).toBeUndefined();
  });

  it.each(["cat exact.txt", "tokenjuice wrap --raw -- find fixtures -type f"])("preserves exact and raw commands: %s", async cmd => {
    const event = makeEvent();
    event.input.cmd = cmd;
    event.details.execCommand.cmd = cmd;
    expect(await compactOpenHanakoResult(event)).toBeUndefined();
  });

  it("registers only a native tool_result callback", () => {
    const on = vi.fn();
    openHanakoExtension({ on });
    expect(on).toHaveBeenCalledOnce();
    expect(on).toHaveBeenCalledWith("tool_result", expect.any(Function));
  });
});
