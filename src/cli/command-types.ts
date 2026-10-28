export type Format = "text" | "json";

/** Parsed command-line arguments shared by every CLI command. */
export type ParsedArgs = {
  command: string | undefined;
  format: Format;
  local: boolean;
  classifier: string | undefined;
  fixtures: boolean;
  sourceCommand: string | undefined;
  toolName: string | undefined;
  exitCode: number | undefined;
  store: boolean;
  noStats: boolean;
  tee: boolean;
  raw: boolean;
  noOmit: boolean;
  allowOmit: boolean;
  storeDir: string | undefined;
  maxInlineChars: number | undefined;
  maxCaptureBytes: number | undefined;
  maxInputBytes: number | undefined;
  timeZone: string | undefined;
  source: string | undefined;
  bySource: boolean;
  limit: number | undefined;
  cursor: string | undefined;
  wrapLauncher: string | undefined;
  trace: boolean;
  printInstructions: boolean;
  skipCommandNames: string[];
  positionals: string[];
  passthrough: string[];
};

/** Runs one CLI command for a resolved target and returns the process exit code. */
export type HostCommandHandler = (args: ParsedArgs, target: string) => Promise<number>;
