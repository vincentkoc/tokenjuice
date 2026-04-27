import { doctorAiderConvention } from "../aider/index.js";
import { doctorAvanteInstructions } from "../avante/index.js";
import { doctorClaudeCodeHook } from "../claude-code/index.js";
import { doctorClineHook } from "../cline/index.js";
import { doctorCodeBuddyHook } from "../codebuddy/index.js";
import { doctorContinueRule } from "../continue/index.js";
import { doctorCodexHook } from "../codex/index.js";
import { doctorCopilotCliHook } from "../copilot-cli/index.js";
import { doctorCursorHook } from "../cursor/index.js";
import { doctorDroidHook } from "../droid/index.js";
import { doctorGeminiCliHook } from "../gemini-cli/index.js";
import { doctorJunieInstructions } from "../junie/index.js";
import { doctorOpenHandsHook } from "../openhands/index.js";
import { doctorPiExtension } from "../pi/index.js";
import { doctorVscodeCopilotHook } from "../vscode-copilot/index.js";
import { doctorZedInstructions } from "../zed/index.js";

import type { AiderDoctorReport } from "../aider/index.js";
import type { AvanteDoctorReport } from "../avante/index.js";
import type { ClaudeCodeDoctorReport, ClaudeCodeHookCommandOptions } from "../claude-code/index.js";
import type { ClineDoctorReport } from "../cline/index.js";
import type { CodeBuddyDoctorReport, CodeBuddyHookCommandOptions } from "../codebuddy/index.js";
import type { ContinueDoctorReport } from "../continue/index.js";
import type { CodexDoctorReport, CodexHookCommandOptions } from "../codex/index.js";
import type { CopilotCliDoctorReport } from "../copilot-cli/index.js";
import type { CursorDoctorReport } from "../cursor/index.js";
import type { DroidDoctorReport, DroidHookCommandOptions } from "../droid/index.js";
import type { GeminiCliDoctorReport } from "../gemini-cli/index.js";
import type { JunieDoctorReport } from "../junie/index.js";
import type { OpenHandsDoctorReport } from "../openhands/index.js";
import type { PiDoctorReport } from "../pi/index.js";
import type { VscodeCopilotDoctorReport } from "../vscode-copilot/index.js";
import type { ZedDoctorReport } from "../zed/index.js";

export type HookHealthStatus = "ok" | "warn" | "broken" | "disabled";

export type HookIntegrationDoctorReport = {
  aider: AiderDoctorReport;
  avante: AvanteDoctorReport;
  codex: CodexDoctorReport;
  "claude-code": ClaudeCodeDoctorReport;
  cline: ClineDoctorReport;
  codebuddy: CodeBuddyDoctorReport;
  continue: ContinueDoctorReport;
  cursor: CursorDoctorReport;
  droid: DroidDoctorReport;
  "gemini-cli": GeminiCliDoctorReport;
  junie: JunieDoctorReport;
  openhands: OpenHandsDoctorReport;
  pi: PiDoctorReport;
  "vscode-copilot": VscodeCopilotDoctorReport;
  zed: ZedDoctorReport;
  "copilot-cli": CopilotCliDoctorReport;
};

export type HookDoctorReport = {
  status: HookHealthStatus;
  integrations: HookIntegrationDoctorReport;
};

export type HookDoctorCommandOptions = CodexHookCommandOptions & ClaudeCodeHookCommandOptions & CodeBuddyHookCommandOptions & DroidHookCommandOptions;
export type HookIntegrationDoctorEntry = [
  keyof HookIntegrationDoctorReport,
  HookIntegrationDoctorReport[keyof HookIntegrationDoctorReport],
];
type HookDoctorIntegrationDoctors = {
  [Name in keyof HookIntegrationDoctorReport]: (
    options: HookDoctorCommandOptions,
  ) => Promise<HookIntegrationDoctorReport[Name]>;
};

const hookDoctorIntegrationDoctors = {
  aider: () => doctorAiderConvention(),
  avante: () => doctorAvanteInstructions(),
  codex: (options) => doctorCodexHook(undefined, options),
  "claude-code": (options) => doctorClaudeCodeHook(undefined, getHookCommandOptions(options)),
  cline: (options) => doctorClineHook(undefined, getHookCommandOptions(options)),
  codebuddy: (options) => doctorCodeBuddyHook(undefined, getHookCommandOptions(options)),
  continue: () => doctorContinueRule(),
  cursor: (options) => doctorCursorHook(undefined, getHookCommandOptions(options)),
  droid: (options) => doctorDroidHook(undefined, getHookCommandOptions(options)),
  "gemini-cli": (options) => doctorGeminiCliHook(undefined, getHookCommandOptions(options)),
  junie: () => doctorJunieInstructions(),
  openhands: (options) => doctorOpenHandsHook(undefined, getHookCommandOptions(options)),
  pi: () => doctorPiExtension(),
  "vscode-copilot": (options) => doctorVscodeCopilotHook(undefined, getHookCommandOptions(options)),
  zed: () => doctorZedInstructions(),
  "copilot-cli": (options) => doctorCopilotCliHook(undefined, getHookCommandOptions(options)),
} satisfies HookDoctorIntegrationDoctors;

export function getAvailableHookIntegrationNames(): Array<keyof HookIntegrationDoctorReport> {
  return Object.keys(hookDoctorIntegrationDoctors) as Array<keyof HookIntegrationDoctorReport>;
}

function mergeStatus(left: HookHealthStatus, right: HookHealthStatus): HookHealthStatus {
  if (left === "broken" || right === "broken") {
    return "broken";
  }
  if (left === "warn" || right === "warn") {
    return "warn";
  }
  if (left === "ok" || right === "ok") {
    return "ok";
  }
  if (left === "disabled" || right === "disabled") {
    return "disabled";
  }
  return "ok";
}

function mergeStatuses(statuses: readonly HookHealthStatus[]): HookHealthStatus {
  return statuses.reduce(mergeStatus, "disabled");
}

function getHookCommandOptions(options: HookDoctorCommandOptions): HookDoctorCommandOptions {
  return {
    ...(typeof options.local === "boolean" ? { local: options.local } : {}),
    ...(typeof options.binaryPath === "string" ? { binaryPath: options.binaryPath } : {}),
    ...(typeof options.nodePath === "string" ? { nodePath: options.nodePath } : {}),
  };
}

function hasDetectedCommand(report: HookIntegrationDoctorReport[keyof HookIntegrationDoctorReport]): boolean {
  return "detectedCommand" in report && typeof report.detectedCommand === "string" && report.detectedCommand.length > 0;
}

export function isInstalledHookIntegration(
  report: HookIntegrationDoctorReport[keyof HookIntegrationDoctorReport],
): boolean {
  if (hasDetectedCommand(report)) {
    return true;
  }
  // Command-backed hosts can warn about missing config even when tokenjuice is
  // not installed. Instruction/extension hosts have no expected command, so a
  // non-disabled status means their tokenjuice artifact exists.
  return report.status !== "disabled" && !("expectedCommand" in report);
}

export function getInstalledHookIntegrations(report: HookDoctorReport): HookIntegrationDoctorEntry[] {
  return (Object.entries(report.integrations) as HookIntegrationDoctorEntry[])
    .filter(([, integrationReport]) => isInstalledHookIntegration(integrationReport));
}

export async function doctorInstalledHooks(options: HookDoctorCommandOptions = {}): Promise<HookDoctorReport> {
  const integrationEntries = await Promise.all(
    (Object.entries(hookDoctorIntegrationDoctors) as Array<[
      keyof HookIntegrationDoctorReport,
      HookDoctorIntegrationDoctors[keyof HookIntegrationDoctorReport],
    ]>).map(async ([name, doctor]) => [name, await doctor(options)] as const),
  );
  const integrations = Object.fromEntries(integrationEntries) as HookIntegrationDoctorReport;
  const installedIntegrations = getInstalledHookIntegrations({ status: "disabled", integrations });

  return {
    status: mergeStatuses(installedIntegrations.map(([, integrationReport]) => integrationReport.status)),
    integrations,
  };
}
