import { doctorAiderConvention } from "../aider/index.js";
import { doctorAmazonQRule } from "../amazon-q/index.js";
import { doctorAmpInstructions } from "../amp/index.js";
import { doctorAntigravityRule } from "../antigravity/index.js";
import { doctorAugmentRule } from "../augment/index.js";
import { doctorAvanteInstructions } from "../avante/index.js";
import { doctorBobInstructions } from "../bob/index.js";
import { doctorBuilderRule } from "../builder/index.js";
import { doctorClaudeCodeHook } from "../claude-code/index.js";
import { doctorClineHook } from "../cline/index.js";
import { doctorCodebuffInstructions } from "../codebuff/index.js";
import { doctorCodeBuddyHook } from "../codebuddy/index.js";
import { doctorContinueRule } from "../continue/index.js";
import { doctorCodexHook } from "../codex/index.js";
import { doctorCopilotAgentHook } from "../copilot-agent/index.js";
import { doctorCopilotCliHook } from "../copilot-cli/index.js";
import { doctorCrushSkill } from "../crush/index.js";
import { doctorCursorHook } from "../cursor/index.js";
import { doctorDevinHook } from "../devin/index.js";
import { doctorDroidHook } from "../droid/index.js";
import { doctorFirebaseStudioRule } from "../firebase-studio/index.js";
import { doctorGeminiCliHook } from "../gemini-cli/index.js";
import { doctorGitLabDuoRule } from "../gitlab-duo/index.js";
import { doctorGooseHints } from "../goose/index.js";
import { doctorGrokBuildInstructions } from "../grok-build/index.js";
import { doctorGrokCliHook } from "../grok-cli/index.js";
import { doctorGptmeInstructions } from "../gptme/index.js";
import { doctorJetBrainsAiRule } from "../jetbrains-ai/index.js";
import { doctorJunieInstructions } from "../junie/index.js";
import { doctorJulesInstructions } from "../jules/index.js";
import { doctorKimiHook } from "../kimi/index.js";
import { doctorKiroSteering } from "../kiro/index.js";
import { doctorKiloRule } from "../kilo/index.js";
import { doctorMistralVibeInstructions } from "../mistral-vibe/index.js";
import { doctorMuxHook } from "../mux/index.js";
import { doctorOpenHandsHook } from "../openhands/index.js";
import { doctorOpenInterpreterInstructions } from "../open-interpreter/index.js";
import { doctorOpenWebUITool } from "../openwebui/index.js";
import { doctorPiExtension } from "../pi/index.js";
import { doctorPlandexConvention } from "../plandex/index.js";
import { doctorQoderInstructions } from "../qoder/index.js";
import { doctorQwenCodeHook } from "../qwen-code/index.js";
import { doctorReplitInstructions } from "../replit/index.js";
import { doctorRooInstructions } from "../roo/index.js";
import { doctorRovoInstructions } from "../rovo/index.js";
import { doctorRulerRule } from "../ruler/index.js";
import { doctorTabnineInstructions } from "../tabnine/index.js";
import { doctorTraeRule } from "../trae/index.js";
import { doctorVscodeCopilotHook } from "../vscode-copilot/index.js";
import { doctorWarpInstructions } from "../warp/index.js";
import { doctorWindsurfRule } from "../windsurf/index.js";
import { doctorZedInstructions } from "../zed/index.js";
import { doctorZencoderRule } from "../zencoder/index.js";

import type { AiderDoctorReport } from "../aider/index.js";
import type { AmazonQDoctorReport, AmazonQRuleOptions } from "../amazon-q/index.js";
import type { AmpDoctorReport, AmpInstructionsOptions } from "../amp/index.js";
import type { AntigravityDoctorReport, AntigravityRuleOptions } from "../antigravity/index.js";
import type { AugmentDoctorReport, AugmentRuleOptions } from "../augment/index.js";
import type { AvanteDoctorReport } from "../avante/index.js";
import type { BobDoctorReport, BobInstructionsOptions } from "../bob/index.js";
import type { BuilderDoctorReport, BuilderRuleOptions } from "../builder/index.js";
import type { ClaudeCodeDoctorReport, ClaudeCodeHookCommandOptions } from "../claude-code/index.js";
import type { ClineDoctorReport } from "../cline/index.js";
import type { CodebuffDoctorReport, CodebuffInstructionsOptions } from "../codebuff/index.js";
import type { CodeBuddyDoctorReport, CodeBuddyHookCommandOptions } from "../codebuddy/index.js";
import type { ContinueDoctorReport } from "../continue/index.js";
import type { CodexDoctorReport, CodexHookCommandOptions } from "../codex/index.js";
import type { CopilotAgentDoctorReport, CopilotAgentHookCommandOptions } from "../copilot-agent/index.js";
import type { CopilotCliDoctorReport } from "../copilot-cli/index.js";
import type { CrushDoctorReport, CrushSkillOptions } from "../crush/index.js";
import type { CursorDoctorReport } from "../cursor/index.js";
import type { DevinDoctorReport, DevinHookCommandOptions } from "../devin/index.js";
import type { DroidDoctorReport, DroidHookCommandOptions } from "../droid/index.js";
import type { FirebaseStudioDoctorReport, FirebaseStudioRuleOptions } from "../firebase-studio/index.js";
import type { GeminiCliDoctorReport } from "../gemini-cli/index.js";
import type { GitLabDuoDoctorReport, GitLabDuoRuleOptions } from "../gitlab-duo/index.js";
import type { GooseDoctorReport, GooseHintsOptions } from "../goose/index.js";
import type { GrokBuildDoctorReport, GrokBuildInstructionsOptions } from "../grok-build/index.js";
import type { GrokCliDoctorReport, GrokCliHookCommandOptions } from "../grok-cli/index.js";
import type { GptmeDoctorReport, GptmeInstructionsOptions } from "../gptme/index.js";
import type { JetBrainsAiDoctorReport, JetBrainsAiRuleOptions } from "../jetbrains-ai/index.js";
import type { JunieDoctorReport } from "../junie/index.js";
import type { JulesDoctorReport, JulesInstructionsOptions } from "../jules/index.js";
import type { KimiDoctorReport, KimiHookCommandOptions } from "../kimi/index.js";
import type { KiroDoctorReport } from "../kiro/index.js";
import type { KiloDoctorReport } from "../kilo/index.js";
import type { MistralVibeDoctorReport, MistralVibeInstructionsOptions } from "../mistral-vibe/index.js";
import type { MuxDoctorReport, MuxHookCommandOptions } from "../mux/index.js";
import type { OpenInterpreterDoctorReport, OpenInterpreterInstructionsOptions } from "../open-interpreter/index.js";
import type { OpenHandsDoctorReport } from "../openhands/index.js";
import type { OpenWebUIDoctorReport, OpenWebUIToolOptions } from "../openwebui/index.js";
import type { PiDoctorReport } from "../pi/index.js";
import type { PlandexConventionOptions, PlandexDoctorReport } from "../plandex/index.js";
import type { QoderDoctorReport, QoderInstructionsOptions } from "../qoder/index.js";
import type { QwenCodeDoctorReport, QwenCodeHookCommandOptions } from "../qwen-code/index.js";
import type { ReplitDoctorReport, ReplitInstructionsOptions } from "../replit/index.js";
import type { RooDoctorReport } from "../roo/index.js";
import type { RovoDoctorReport, RovoInstructionsOptions } from "../rovo/index.js";
import type { TabnineDoctorReport, TabnineInstructionsOptions } from "../tabnine/index.js";
import type { RulerDoctorReport, RulerRuleOptions } from "../ruler/index.js";
import type { TraeDoctorReport, TraeRuleOptions } from "../trae/index.js";
import type { VscodeCopilotDoctorReport } from "../vscode-copilot/index.js";
import type { WarpDoctorReport, WarpInstructionsOptions } from "../warp/index.js";
import type { WindsurfDoctorReport } from "../windsurf/index.js";
import type { ZedDoctorReport } from "../zed/index.js";
import type { ZencoderDoctorReport, ZencoderRuleOptions } from "../zencoder/index.js";

export type HookHealthStatus = "ok" | "warn" | "broken" | "disabled";

export type HookIntegrationDoctorReport = {
  aider: AiderDoctorReport;
  "amazon-q": AmazonQDoctorReport;
  amp: AmpDoctorReport;
  antigravity: AntigravityDoctorReport;
  augment: AugmentDoctorReport;
  avante: AvanteDoctorReport;
  bob: BobDoctorReport;
  builder: BuilderDoctorReport;
  codex: CodexDoctorReport;
  "copilot-agent": CopilotAgentDoctorReport;
  "claude-code": ClaudeCodeDoctorReport;
  cline: ClineDoctorReport;
  codebuff: CodebuffDoctorReport;
  codebuddy: CodeBuddyDoctorReport;
  continue: ContinueDoctorReport;
  crush: CrushDoctorReport;
  cursor: CursorDoctorReport;
  devin: DevinDoctorReport;
  droid: DroidDoctorReport;
  "firebase-studio": FirebaseStudioDoctorReport;
  "gemini-cli": GeminiCliDoctorReport;
  "gitlab-duo": GitLabDuoDoctorReport;
  goose: GooseDoctorReport;
  "grok-build": GrokBuildDoctorReport;
  "grok-cli": GrokCliDoctorReport;
  gptme: GptmeDoctorReport;
  "jetbrains-ai": JetBrainsAiDoctorReport;
  junie: JunieDoctorReport;
  jules: JulesDoctorReport;
  kimi: KimiDoctorReport;
  kiro: KiroDoctorReport;
  kilo: KiloDoctorReport;
  "mistral-vibe": MistralVibeDoctorReport;
  mux: MuxDoctorReport;
  openhands: OpenHandsDoctorReport;
  "open-interpreter": OpenInterpreterDoctorReport;
  openwebui: OpenWebUIDoctorReport;
  pi: PiDoctorReport;
  plandex: PlandexDoctorReport;
  qoder: QoderDoctorReport;
  "qwen-code": QwenCodeDoctorReport;
  replit: ReplitDoctorReport;
  roo: RooDoctorReport;
  rovo: RovoDoctorReport;
  ruler: RulerDoctorReport;
  tabnine: TabnineDoctorReport;
  trae: TraeDoctorReport;
  "vscode-copilot": VscodeCopilotDoctorReport;
  warp: WarpDoctorReport;
  windsurf: WindsurfDoctorReport;
  zed: ZedDoctorReport;
  zencoder: ZencoderDoctorReport;
  "copilot-cli": CopilotCliDoctorReport;
};

export type HookDoctorReport = {
  status: HookHealthStatus;
  integrations: HookIntegrationDoctorReport;
};

export type HookDoctorCommandOptions = AmazonQRuleOptions & AmpInstructionsOptions & AntigravityRuleOptions & AugmentRuleOptions & BobInstructionsOptions & BuilderRuleOptions & CodebuffInstructionsOptions & CodexHookCommandOptions & ClaudeCodeHookCommandOptions & CodeBuddyHookCommandOptions & CopilotAgentHookCommandOptions & CrushSkillOptions & DevinHookCommandOptions & DroidHookCommandOptions & FirebaseStudioRuleOptions & GitLabDuoRuleOptions & GooseHintsOptions & GrokBuildInstructionsOptions & GrokCliHookCommandOptions & GptmeInstructionsOptions & JetBrainsAiRuleOptions & JulesInstructionsOptions & KimiHookCommandOptions & MistralVibeInstructionsOptions & MuxHookCommandOptions & OpenInterpreterInstructionsOptions & OpenWebUIToolOptions & PlandexConventionOptions & QoderInstructionsOptions & QwenCodeHookCommandOptions & ReplitInstructionsOptions & RovoInstructionsOptions & RulerRuleOptions & TabnineInstructionsOptions & TraeRuleOptions & WarpInstructionsOptions & ZencoderRuleOptions;
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
  "amazon-q": (options) => doctorAmazonQRule(undefined, getHookCommandOptions(options)),
  amp: (options) => doctorAmpInstructions(undefined, { ...getHookCommandOptions(options), scanProjectTree: false }),
  antigravity: (options) => doctorAntigravityRule(undefined, getHookCommandOptions(options)),
  augment: (options) => doctorAugmentRule(undefined, getHookCommandOptions(options)),
  avante: () => doctorAvanteInstructions(),
  bob: (options) => doctorBobInstructions(undefined, getHookCommandOptions(options)),
  builder: (options) => doctorBuilderRule(undefined, getHookCommandOptions(options)),
  codex: (options) => doctorCodexHook(undefined, options),
  "claude-code": (options) => doctorClaudeCodeHook(undefined, getHookCommandOptions(options)),
  cline: (options) => doctorClineHook(undefined, getHookCommandOptions(options)),
  codebuff: (options) => doctorCodebuffInstructions(undefined, getHookCommandOptions(options)),
  codebuddy: (options) => doctorCodeBuddyHook(undefined, getHookCommandOptions(options)),
  continue: () => doctorContinueRule(),
  "copilot-agent": (options) => doctorCopilotAgentHook(undefined, getHookCommandOptions(options)),
  crush: (options) => doctorCrushSkill(undefined, getHookCommandOptions(options)),
  cursor: (options) => doctorCursorHook(undefined, getHookCommandOptions(options)),
  devin: (options) => doctorDevinHook(undefined, getHookCommandOptions(options)),
  droid: (options) => doctorDroidHook(undefined, getHookCommandOptions(options)),
  "firebase-studio": (options) => doctorFirebaseStudioRule(undefined, getHookCommandOptions(options)),
  "gemini-cli": (options) => doctorGeminiCliHook(undefined, getHookCommandOptions(options)),
  "gitlab-duo": (options) => doctorGitLabDuoRule(undefined, getHookCommandOptions(options)),
  goose: (options) => doctorGooseHints(undefined, { ...getHookCommandOptions(options), scanProjectTree: false }),
  "grok-build": (options) => doctorGrokBuildInstructions(undefined, getHookCommandOptions(options)),
  "grok-cli": (options) => doctorGrokCliHook(undefined, getHookCommandOptions(options)),
  gptme: (options) => doctorGptmeInstructions(undefined, getHookCommandOptions(options)),
  "jetbrains-ai": (options) => doctorJetBrainsAiRule(undefined, getHookCommandOptions(options)),
  junie: () => doctorJunieInstructions(),
  jules: (options) => doctorJulesInstructions(undefined, getHookCommandOptions(options)),
  kimi: (options) => doctorKimiHook(undefined, getHookCommandOptions(options)),
  kiro: () => doctorKiroSteering(),
  kilo: () => doctorKiloRule(),
  "mistral-vibe": (options) => doctorMistralVibeInstructions(undefined, getHookCommandOptions(options)),
  mux: (options) => doctorMuxHook(undefined, getHookCommandOptions(options)),
  openhands: (options) => doctorOpenHandsHook(undefined, getHookCommandOptions(options)),
  "open-interpreter": (options) => doctorOpenInterpreterInstructions(undefined, { ...getHookCommandOptions(options), scanProjectTree: false }),
  openwebui: (options) => doctorOpenWebUITool(undefined, getHookCommandOptions(options)),
  pi: () => doctorPiExtension(),
  plandex: (options) => doctorPlandexConvention(undefined, getHookCommandOptions(options)),
  qoder: (options) => doctorQoderInstructions(undefined, getHookCommandOptions(options)),
  "qwen-code": (options) => doctorQwenCodeHook(undefined, options),
  replit: (options) => doctorReplitInstructions(undefined, getHookCommandOptions(options)),
  roo: () => doctorRooInstructions(),
  rovo: (options) => doctorRovoInstructions(undefined, getHookCommandOptions(options)),
  ruler: (options) => doctorRulerRule(undefined, getHookCommandOptions(options)),
  tabnine: (options) => doctorTabnineInstructions(undefined, getHookCommandOptions(options)),
  trae: (options) => doctorTraeRule(undefined, getHookCommandOptions(options)),
  "vscode-copilot": (options) => doctorVscodeCopilotHook(undefined, getHookCommandOptions(options)),
  warp: (options) => doctorWarpInstructions(undefined, getHookCommandOptions(options)),
  windsurf: () => doctorWindsurfRule(),
  zed: () => doctorZedInstructions(),
  zencoder: (options) => doctorZencoderRule(undefined, getHookCommandOptions(options)),
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
    ...(typeof options.projectDir === "string" ? { projectDir: options.projectDir } : {}),
    ...(typeof options.scanProjectTree === "boolean" ? { scanProjectTree: options.scanProjectTree } : {}),
    ...(typeof options.configDir === "string" ? { configDir: options.configDir } : {}),
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
  if ("hasTokenjuiceMarker" in report && report.hasTokenjuiceMarker === true) {
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
