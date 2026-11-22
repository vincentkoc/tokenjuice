/** Read a shell command without treating OpenClaw Code Mode as shell execution. */
export function readOpenClawShellCommand(input: unknown): string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return "";
  }
  // Code Mode pairs its JavaScript code with a command alias before hooks.
  // Do not parse the source or trust the exec name: even a malformed/empty code
  // field is ambiguous and must not opt arbitrary tool results into compaction.
  if ("code" in input) {
    return "";
  }
  return "command" in input && typeof input.command === "string" ? input.command : "";
}
