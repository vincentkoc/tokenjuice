function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Cline's native pre-tool control replaces the complete run_commands input. */
export function rewriteClineInput(
  payload: unknown,
  rewriteCommand: (command: string) => string,
): { overrideInput: Record<string, unknown> } | undefined {
  if (!record(payload) || payload.hookName !== "tool_call" || !record(payload.tool_call)
    || payload.tool_call.name !== "run_commands" || !record(payload.tool_call.input)) return undefined;
  const input = payload.tool_call.input;
  if (!Array.isArray(input.commands) || input.commands.length === 0
    || !input.commands.every(command => typeof command === "string" && command.trim())) return undefined;
  const original = input.commands as string[];
  const commands = original.map(rewriteCommand);
  if (commands.every((command, index) => command === original[index])) return undefined;
  return { overrideInput: { ...input, commands } };
}
