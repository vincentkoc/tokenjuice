import {
  buildWrappedCommand,
  commandAlreadyWrapped,
  isRecord,
  resolveHostShell,
  resolveInstalledTokenjuicePath,
} from "../shared/pre-tool-wrap.js";

/** MiniMax-format plugins use the native lowercase `bash` tool identity. */
export async function runMiniMaxCodePreToolUseHook(rawText: string, wrapLauncher?: string): Promise<number> {
  try {
    const payload: unknown = JSON.parse(rawText);
    if (process.platform === "win32" || !isRecord(payload)
      || payload.hook_event_name !== "PreToolUse" || payload.tool_name !== "bash"
      || !isRecord(payload.tool_input)) return 0;

    const input = payload.tool_input;
    if (typeof input.command !== "string" || !input.command.trim()
      || input.run_in_background === true || commandAlreadyWrapped(input.command)) return 0;

    // The native tool executes Bash syntax; a login shell such as fish is not interchangeable.
    const shellPath = await resolveHostShell(["bash"]);
    const launcher = wrapLauncher ?? await resolveInstalledTokenjuicePath();
    if (!shellPath || !launcher) return 0;

    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: {
          ...input,
          command: buildWrappedCommand({
            wrapLauncher: launcher,
            shellPath,
            command: input.command,
            source: "minimax-code",
          }),
        },
      },
    })}\n`);
  } catch {
    // An unavailable shell or malformed hook input must leave the native tool alone.
  }
  return 0;
}
