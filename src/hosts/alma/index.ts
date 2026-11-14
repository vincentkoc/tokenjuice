import {
  buildWrappedCommand,
  commandAlreadyWrapped,
  isRecord,
  resolveHostShell,
  resolveInstalledTokenjuicePath,
} from "../shared/pre-tool-wrap.js";

type AlmaContext = {
  events: {
    on(event: "tool.willExecute", handler: (input: unknown, output: unknown) => Promise<void>): { dispose(): void };
  };
};

export type AlmaWrapOptions = {
  wrapLauncher?: string;
  shellPath?: string;
};

/** Modify only the effective Bash arguments; Alma still owns approval and execution. */
export function createAlmaPreToolUseHandler(options: AlmaWrapOptions = {}) {
  return async (input: unknown, output: unknown): Promise<void> => {
    try {
      if (process.platform === "win32" || !isRecord(input) || !isRecord(output)
        || input.tool !== "Bash" || output.cancel === true) return;
      const args = output.args ?? input.args;
      if (!isRecord(args) || typeof args.command !== "string" || !args.command.trim()
        || args.run_in_background === true || commandAlreadyWrapped(args.command)) return;
      const wrapLauncher = options.wrapLauncher ?? await resolveInstalledTokenjuicePath();
      const shellPath = options.shellPath ?? await resolveHostShell(["bash"]);
      if (!wrapLauncher || !shellPath) return;
      output.args = {
        ...args,
        command: buildWrappedCommand({ wrapLauncher, shellPath, command: args.command, source: "alma" }),
      };
    } catch {
      // A missing executable or incompatible hook payload leaves the host call unchanged.
    }
  };
}

/** Alma's native plugin lifecycle. No configuration or permission state is modified. */
export async function activate(context: AlmaContext) {
  const subscription = context.events.on("tool.willExecute", createAlmaPreToolUseHandler());
  return { dispose: () => subscription.dispose() };
}
