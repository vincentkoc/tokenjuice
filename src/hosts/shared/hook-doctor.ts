import { doctorOpenCodeV2Extension } from "../opencode/v2/index.js";
import { doctorQoderHook } from "../qoder/hook-install.js";
import { doctorQwenWorkSkill } from "../qwenwork/index.js";
import { doctorQoderWorkSkill } from "../qoderwork/index.js";
import { doctorAdalInstructions, type AdalDoctorReport, type AdalInstructionsOptions } from "../adal/index.js";
import { doctorAetherPrompt, type AetherDoctorReport, type AetherPromptOptions } from "../aether/index.js";
import { doctorAiderConvention, type AiderDoctorReport } from "../aider/index.js";
import { doctorAictlInstructions, type AictlDoctorReport, type AictlInstructionsOptions } from "../aictl/index.js";
import { doctorAiMemoryProtocolMemory, type AiMemoryProtocolDoctorReport, type AiMemoryProtocolOptions } from "../ai-memory-protocol/index.js";
import { doctorAgentLayerInstructions, type AgentLayerDoctorReport, type AgentLayerInstructionsOptions } from "../agent-layer/index.js";
import { doctorAgentInitInstructions, type AgentInitDoctorReport, type AgentInitInstructionsOptions } from "../agentinit/index.js";
import { doctorAgentlinkInstructions, type AgentlinkDoctorReport, type AgentlinkInstructionsOptions } from "../agentlink/index.js";
import { doctorAgentloomRule, type AgentloomDoctorReport, type AgentloomRuleOptions } from "../agentloom/index.js";
import { doctorAgentsCliMemory, type AgentsCliDoctorReport, type AgentsCliMemoryOptions } from "../agents-cli/index.js";
import { doctorAgentsMdInstructions, type AgentsMdDoctorReport, type AgentsMdInstructionsOptions } from "../agents-md/index.js";
import { doctorAgentsGeRule, type AgentsGeDoctorReport, type AgentsGeRuleOptions } from "../agentsge/index.js";
import { doctorAgentsMeshRule, type AgentsMeshDoctorReport, type AgentsMeshRuleOptions } from "../agentsmesh/index.js";
import { doctorAmazonQRule, type AmazonQDoctorReport, type AmazonQRuleOptions } from "../amazon-q/index.js";
import { doctorAmpInstructions, type AmpDoctorReport, type AmpInstructionsOptions } from "../amp/index.js";
import { doctorAntigravityRule, type AntigravityDoctorReport, type AntigravityRuleOptions } from "../antigravity/index.js";
import { doctorAnywhereAgentsInstructions, type AnywhereAgentsDoctorReport, type AnywhereAgentsInstructionsOptions } from "../anywhere-agents/index.js";
import { doctorAugmentRule, type AugmentDoctorReport, type AugmentRuleOptions } from "../augment/index.js";
import { doctorAvanteInstructions, type AvanteDoctorReport } from "../avante/index.js";
import { doctorBazSkill, type BazDoctorReport, type BazSkillOptions } from "../baz/index.js";
import { doctorBitoGuidelines, type BitoDoctorReport, type BitoGuidelinesOptions } from "../bito/index.js";
import { doctorBlackboxSkill, type BlackboxDoctorReport, type BlackboxSkillOptions } from "../blackbox/index.js";
import { doctorBlocksSkill, type BlocksDoctorReport, type BlocksSkillOptions } from "../blocks/index.js";
import { doctorClawdbotSkill, type ClawdbotDoctorReport, type ClawdbotSkillOptions } from "../clawdbot/index.js";
import { doctorBobInstructions, type BobDoctorReport, type BobInstructionsOptions } from "../bob/index.js";
import { doctorBuilderRule, type BuilderDoctorReport, type BuilderRuleOptions } from "../builder/index.js";
import { doctorCharlieInstructions, type CharlieDoctorReport, type CharlieInstructionsOptions } from "../charlie/index.js";
import { doctorClaudeCodeHook, type ClaudeCodeDoctorReport, type ClaudeCodeHookCommandOptions } from "../claude-code/index.js";
import { doctorClineHook, type ClineDoctorReport } from "../cline/index.js";
import { doctorCodeAntInstructions, type CodeAntDoctorReport, type CodeAntInstructionsOptions } from "../codeant/index.js";
import { doctorCodebuffInstructions, type CodebuffDoctorReport, type CodebuffInstructionsOptions } from "../codebuff/index.js";
import { doctorCodegenInstructions, type CodegenDoctorReport, type CodegenInstructionsOptions } from "../codegen/index.js";
import { doctorCoderAgentsSkill, type CoderAgentsDoctorReport, type CoderAgentsSkillOptions } from "../coder-agents/index.js";
import { doctorCodeRabbitConfig, type CodeRabbitConfigOptions, type CodeRabbitDoctorReport } from "../coderabbit/index.js";
import { doctorCodeBuddyHook, type CodeBuddyDoctorReport, type CodeBuddyHookCommandOptions } from "../codebuddy/index.js";
import { doctorCommandCodeHook, type CommandCodeDoctorReport, type CommandCodeHookCommandOptions } from "../command-code/index.js";
import { doctorContinueRule, type ContinueDoctorReport } from "../continue/index.js";
import { doctorCodexHook, type CodexDoctorReport, type CodexHookCommandOptions } from "../codex/index.js";
import { doctorCopilotAgentHook, type CopilotAgentDoctorReport, type CopilotAgentHookCommandOptions } from "../copilot-agent/index.js";
import { doctorCopilotCliHook, type CopilotCliDoctorReport } from "../copilot-cli/index.js";
import { doctorCrushSkill, type CrushDoctorReport, type CrushSkillOptions } from "../crush/index.js";
import { doctorCursorHook, type CursorDoctorReport } from "../cursor/index.js";
import { doctorDeepAgentsInstructions, type DeepAgentsDoctorReport, type DeepAgentsInstructionsOptions } from "../deepagents/index.js";
import { doctorDevinHook, type DevinDoctorReport, type DevinHookCommandOptions } from "../devin/index.js";
import { doctorDotAgentsRule, type DotAgentsDoctorReport, type DotAgentsRuleOptions } from "../dot-agents/index.js";
import { doctorDockerAgentPrompt, type DockerAgentDoctorReport, type DockerAgentPromptOptions } from "../docker-agent/index.js";
import { doctorDroidHook, type DroidDoctorReport, type DroidHookCommandOptions } from "../droid/index.js";
import { doctorEcaSkill, type EcaDoctorReport, type EcaSkillOptions } from "../eca/index.js";
import { doctorElyraSkill, type ElyraDoctorReport, type ElyraSkillOptions } from "../elyra/index.js";
import { doctorFirebaseStudioRule, type FirebaseStudioDoctorReport, type FirebaseStudioRuleOptions } from "../firebase-studio/index.js";
import { doctorForgeCodeInstructions, type ForgeCodeDoctorReport, type ForgeCodeInstructionsOptions } from "../forgecode/index.js";
import { doctorGeminiCliHook, type GeminiCliDoctorReport } from "../gemini-cli/index.js";
import { doctorGitLabDuoRule, type GitLabDuoDoctorReport, type GitLabDuoRuleOptions } from "../gitlab-duo/index.js";
import { doctorGooseHints, type GooseDoctorReport, type GooseHintsOptions } from "../goose/index.js";
import { doctorGreptileRule, type GreptileDoctorReport, type GreptileRuleOptions } from "../greptile/index.js";
import { doctorGrokBuildInstructions, type GrokBuildDoctorReport, type GrokBuildInstructionsOptions } from "../grok-build/index.js";
import { doctorGrokBotRule, type GrokBotDoctorReport, type GrokBotRuleOptions } from "../grok-bot/index.js";
import { doctorGrokCliHook, type GrokCliDoctorReport, type GrokCliHookCommandOptions } from "../grok-cli/index.js";
import { doctorGptmeInstructions, type GptmeDoctorReport, type GptmeInstructionsOptions } from "../gptme/index.js";
import { doctorJean2Instructions, type Jean2DoctorReport, type Jean2InstructionsOptions } from "../jean2/index.js";
import { doctorJetBrainsAiRule, type JetBrainsAiDoctorReport, type JetBrainsAiRuleOptions } from "../jetbrains-ai/index.js";
import { doctorJunieInstructions, type JunieDoctorReport } from "../junie/index.js";
import { doctorJulesInstructions, type JulesDoctorReport, type JulesInstructionsOptions } from "../jules/index.js";
import { doctorLeanCtlInstructions, type LeanCtlDoctorReport, type LeanCtlInstructionsOptions } from "../leanctl/index.js";
import { doctorKimiHook, type KimiDoctorReport, type KimiHookCommandOptions } from "../kimi/index.js";
import { doctorKiroSteering, type KiroDoctorReport } from "../kiro/index.js";
import { doctorKiloRule, type KiloDoctorReport } from "../kilo/index.js";
import { doctorKnownsInstructions, type KnownsDoctorReport, type KnownsInstructionsOptions } from "../knowns/index.js";
import { doctorLocalCodePlugin, type LocalCodeDoctorReport, type LocalCodePluginOptions } from "../localcode/index.js";
import { doctorMcpAgentDefinition, type McpAgentDefinitionOptions, type McpAgentDoctorReport } from "../mcp-agent/index.js";
import { doctorMiniSweAgentConfig, type MiniSweAgentConfigOptions, type MiniSweAgentDoctorReport } from "../mini-swe-agent/index.js";
import { doctorSweAgentConfig, type SweAgentConfigOptions, type SweAgentDoctorReport } from "../swe-agent/index.js";
import { doctorStagewiseSkill, type StagewiseDoctorReport, type StagewiseSkillOptions } from "../stagewise/index.js";
import { doctorMistralVibeInstructions, type MistralVibeDoctorReport, type MistralVibeInstructionsOptions } from "../mistral-vibe/index.js";
import { doctorMuxHook, type MuxDoctorReport, type MuxHookCommandOptions } from "../mux/index.js";
import { doctorNovaKitInstructions, type NovaKitDoctorReport, type NovaKitInstructionsOptions } from "../novakit/index.js";
import { doctorOnaSkill, type OnaDoctorReport, type OnaSkillOptions } from "../ona/index.js";
import { doctorOpenHandsHook, type OpenHandsDoctorReport } from "../openhands/index.js";
import { doctorOpenInterpreterInstructions, type OpenInterpreterDoctorReport, type OpenInterpreterInstructionsOptions } from "../open-interpreter/index.js";
import { doctorOpenWebUITool, type OpenWebUIDoctorReport, type OpenWebUIToolOptions } from "../openwebui/index.js";
import { doctorPiExtension, type PiDoctorReport } from "../pi/index.js";
import { doctorPiGoSkill, type PiGoDoctorReport, type PiGoSkillOptions } from "../pi-go/index.js";
import { doctorPlandexConvention, type PlandexConventionOptions, type PlandexDoctorReport } from "../plandex/index.js";
import { doctorQodoReviewConfig, type QodoDoctorReport, type QodoReviewConfigOptions } from "../qodo/index.js";
import { doctorQoderInstructions, type QoderDoctorReport, type QoderInstructionsOptions } from "../qoder/index.js";
import { doctorAnteInstructions, type AnteDoctorReport, type AnteInstructionsOptions } from "../ante/index.js";
import { doctorQwenCodeHook, type QwenCodeDoctorReport, type QwenCodeHookCommandOptions } from "../qwen-code/index.js";
import { doctorReplitInstructions, type ReplitDoctorReport, type ReplitInstructionsOptions } from "../replit/index.js";
import { doctorRooInstructions, type RooDoctorReport } from "../roo/index.js";
import { doctorRovoInstructions, type RovoDoctorReport, type RovoInstructionsOptions } from "../rovo/index.js";
import { doctorRulerRule, type RulerDoctorReport, type RulerRuleOptions } from "../ruler/index.js";
import { doctorTabbySystemPrompt, type TabbyDoctorReport, type TabbySystemPromptOptions } from "../tabby/index.js";
import { doctorTabnineInstructions, type TabnineDoctorReport, type TabnineInstructionsOptions } from "../tabnine/index.js";
import { doctorTraeRule, type TraeDoctorReport, type TraeRuleOptions } from "../trae/index.js";
import { doctorUiPathInstructions, type UiPathDoctorReport, type UiPathInstructionsOptions } from "../uipath/index.js";
import { doctorVscodeCopilotHook, type VscodeCopilotDoctorReport } from "../vscode-copilot/index.js";
import { doctorWarpInstructions, type WarpDoctorReport, type WarpInstructionsOptions } from "../warp/index.js";
import { doctorWindsurfRule, type WindsurfDoctorReport } from "../windsurf/index.js";
import { doctorZedInstructions, type ZedDoctorReport } from "../zed/index.js";
import { doctorZencoderRule, type ZencoderDoctorReport, type ZencoderRuleOptions } from "../zencoder/index.js";


type HookHealthStatus = "ok" | "warn" | "broken" | "disabled";

export type HookIntegrationDoctorReport = {
  adal: AdalDoctorReport;
  aether: AetherDoctorReport;
  aictl: AictlDoctorReport;
  "ai-memory-protocol": AiMemoryProtocolDoctorReport;
  aider: AiderDoctorReport;
  "agent-layer": AgentLayerDoctorReport;
  agentinit: AgentInitDoctorReport;
  agentlink: AgentlinkDoctorReport;
  agentloom: AgentloomDoctorReport;
  "agents-cli": AgentsCliDoctorReport;
  "agents-md": AgentsMdDoctorReport;
  agentsge: AgentsGeDoctorReport;
  agentsmesh: AgentsMeshDoctorReport;
  "amazon-q": AmazonQDoctorReport;
  amp: AmpDoctorReport;
  antigravity: AntigravityDoctorReport;
  "anywhere-agents": AnywhereAgentsDoctorReport;
  augment: AugmentDoctorReport;
  avante: AvanteDoctorReport;
  baz: BazDoctorReport;
  bito: BitoDoctorReport;
  blackbox: BlackboxDoctorReport;
  blocks: BlocksDoctorReport;
  clawdbot: ClawdbotDoctorReport;
  bob: BobDoctorReport;
  builder: BuilderDoctorReport;
  charlie: CharlieDoctorReport;
  codex: CodexDoctorReport;
  "copilot-agent": CopilotAgentDoctorReport;
  "claude-code": ClaudeCodeDoctorReport;
  cline: ClineDoctorReport;
  codeant: CodeAntDoctorReport;
  codebuff: CodebuffDoctorReport;
  codegen: CodegenDoctorReport;
  "coder-agents": CoderAgentsDoctorReport;
  coderabbit: CodeRabbitDoctorReport;
  codebuddy: CodeBuddyDoctorReport;
  "command-code": CommandCodeDoctorReport;
  continue: ContinueDoctorReport;
  crush: CrushDoctorReport;
  cursor: CursorDoctorReport;
  deepagents: DeepAgentsDoctorReport;
  devin: DevinDoctorReport;
  "dot-agents": DotAgentsDoctorReport;
  "docker-agent": DockerAgentDoctorReport;
  droid: DroidDoctorReport;
  eca: EcaDoctorReport;
  elyra: ElyraDoctorReport;
  "firebase-studio": FirebaseStudioDoctorReport;
  forgecode: ForgeCodeDoctorReport;
  "gemini-cli": GeminiCliDoctorReport;
  "gitlab-duo": GitLabDuoDoctorReport;
  goose: GooseDoctorReport;
  greptile: GreptileDoctorReport;
  "grok-build": GrokBuildDoctorReport;
  "grok-bot": GrokBotDoctorReport;
  "grok-cli": GrokCliDoctorReport;
  gptme: GptmeDoctorReport;
  jean2: Jean2DoctorReport;
  "jetbrains-ai": JetBrainsAiDoctorReport;
  junie: JunieDoctorReport;
  jules: JulesDoctorReport;
  leanctl: LeanCtlDoctorReport;
  kimi: KimiDoctorReport;
  kiro: KiroDoctorReport;
  kilo: KiloDoctorReport;
  knowns: KnownsDoctorReport;
  localcode: LocalCodeDoctorReport;
  "mcp-agent": McpAgentDoctorReport;
  "mini-swe-agent": MiniSweAgentDoctorReport;
  "swe-agent": SweAgentDoctorReport;
  stagewise: StagewiseDoctorReport;
  "mistral-vibe": MistralVibeDoctorReport;
  mux: MuxDoctorReport;
  novakit: NovaKitDoctorReport;
  ona: OnaDoctorReport;
  openhands: OpenHandsDoctorReport;
  "open-interpreter": OpenInterpreterDoctorReport;
  openwebui: OpenWebUIDoctorReport;
  "opencode-v2": Awaited<ReturnType<typeof doctorOpenCodeV2Extension>>;
  pi: PiDoctorReport;
  "pi-go": PiGoDoctorReport;
  plandex: PlandexDoctorReport;
  qodo: QodoDoctorReport;
  ante: AnteDoctorReport;
  qoder: QoderDoctorReport;
  "qoder-cli": Awaited<ReturnType<typeof doctorQoderHook>>;
  qoderwork: Awaited<ReturnType<typeof doctorQoderWorkSkill>>;
  "qwen-code": QwenCodeDoctorReport;
  qwenwork: Awaited<ReturnType<typeof doctorQwenWorkSkill>>;
  replit: ReplitDoctorReport;
  roo: RooDoctorReport;
  rovo: RovoDoctorReport;
  ruler: RulerDoctorReport;
  tabby: TabbyDoctorReport;
  tabnine: TabnineDoctorReport;
  trae: TraeDoctorReport;
  uipath: UiPathDoctorReport;
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

export type HookDoctorCommandOptions = AdalInstructionsOptions & AetherPromptOptions & AictlInstructionsOptions & AiMemoryProtocolOptions & AgentLayerInstructionsOptions & AgentInitInstructionsOptions & AgentlinkInstructionsOptions & AgentloomRuleOptions & AgentsCliMemoryOptions & AgentsMdInstructionsOptions & AgentsGeRuleOptions & AgentsMeshRuleOptions & AmazonQRuleOptions & AmpInstructionsOptions & AntigravityRuleOptions & AnywhereAgentsInstructionsOptions & AugmentRuleOptions & BazSkillOptions & BitoGuidelinesOptions & BlackboxSkillOptions & BlocksSkillOptions & ClawdbotSkillOptions & BobInstructionsOptions & BuilderRuleOptions & CharlieInstructionsOptions & CodeAntInstructionsOptions & CodebuffInstructionsOptions & CodegenInstructionsOptions & CommandCodeHookCommandOptions & CoderAgentsSkillOptions & CodeRabbitConfigOptions & DeepAgentsInstructionsOptions & DockerAgentPromptOptions & DotAgentsRuleOptions & EcaSkillOptions & ElyraSkillOptions & LocalCodePluginOptions & MiniSweAgentConfigOptions & SweAgentConfigOptions & StagewiseSkillOptions & PiGoSkillOptions & CodexHookCommandOptions & ClaudeCodeHookCommandOptions & CodeBuddyHookCommandOptions & CopilotAgentHookCommandOptions & CrushSkillOptions & DevinHookCommandOptions & DroidHookCommandOptions & FirebaseStudioRuleOptions & ForgeCodeInstructionsOptions & GitLabDuoRuleOptions & GooseHintsOptions & GreptileRuleOptions & GrokBuildInstructionsOptions & GrokBotRuleOptions & GrokCliHookCommandOptions & GptmeInstructionsOptions & Jean2InstructionsOptions & JetBrainsAiRuleOptions & JulesInstructionsOptions & KimiHookCommandOptions & KnownsInstructionsOptions & LeanCtlInstructionsOptions & McpAgentDefinitionOptions & MistralVibeInstructionsOptions & MuxHookCommandOptions & NovaKitInstructionsOptions & OnaSkillOptions & OpenInterpreterInstructionsOptions & OpenWebUIToolOptions & PlandexConventionOptions & QodoReviewConfigOptions & AnteInstructionsOptions & QoderInstructionsOptions & QwenCodeHookCommandOptions & ReplitInstructionsOptions & RovoInstructionsOptions & RulerRuleOptions & TabbySystemPromptOptions & TabnineInstructionsOptions & TraeRuleOptions & UiPathInstructionsOptions & WarpInstructionsOptions & ZencoderRuleOptions;
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
  adal: (options) => doctorAdalInstructions(undefined, getHookCommandOptions(options)),
  aether: (options) => doctorAetherPrompt(undefined, getHookCommandOptions(options)),
  aictl: (options) => doctorAictlInstructions(undefined, getHookCommandOptions(options)),
  "ai-memory-protocol": (options) => doctorAiMemoryProtocolMemory(undefined, getHookCommandOptions(options)),
  aider: () => doctorAiderConvention(),
  "agent-layer": (options) => doctorAgentLayerInstructions(undefined, getHookCommandOptions(options)),
  agentinit: (options) => doctorAgentInitInstructions(undefined, getHookCommandOptions(options)),
  agentlink: (options) => doctorAgentlinkInstructions(undefined, getHookCommandOptions(options)),
  agentloom: (options) => doctorAgentloomRule(undefined, getHookCommandOptions(options)),
  "agents-cli": (options) => doctorAgentsCliMemory(undefined, getHookCommandOptions(options)),
  "agents-md": (options) => doctorAgentsMdInstructions(undefined, getHookCommandOptions(options)),
  agentsge: (options) => doctorAgentsGeRule(undefined, getHookCommandOptions(options)),
  agentsmesh: (options) => doctorAgentsMeshRule(undefined, getHookCommandOptions(options)),
  "amazon-q": (options) => doctorAmazonQRule(undefined, getHookCommandOptions(options)),
  amp: (options) => doctorAmpInstructions(undefined, { ...getHookCommandOptions(options), scanProjectTree: false }),
  ante: (options) => doctorAnteInstructions(undefined, getHookCommandOptions(options)),
  antigravity: (options) => doctorAntigravityRule(undefined, getHookCommandOptions(options)),
  "anywhere-agents": (options) => doctorAnywhereAgentsInstructions(undefined, getHookCommandOptions(options)),
  augment: (options) => doctorAugmentRule(undefined, getHookCommandOptions(options)),
  avante: () => doctorAvanteInstructions(),
  baz: (options) => doctorBazSkill(undefined, getHookCommandOptions(options)),
  bito: (options) => doctorBitoGuidelines(getHookCommandOptions(options)),
  blackbox: (options) => doctorBlackboxSkill(undefined, getHookCommandOptions(options)),
  blocks: (options) => doctorBlocksSkill(undefined, getHookCommandOptions(options)),
  clawdbot: (options) => doctorClawdbotSkill(undefined, getHookCommandOptions(options)),
  bob: (options) => doctorBobInstructions(undefined, getHookCommandOptions(options)),
  builder: (options) => doctorBuilderRule(undefined, getHookCommandOptions(options)),
  charlie: (options) => doctorCharlieInstructions(undefined, getHookCommandOptions(options)),
  codex: (options) => doctorCodexHook(undefined, options),
  "claude-code": (options) => doctorClaudeCodeHook(undefined, getHookCommandOptions(options)),
  cline: (options) => doctorClineHook(undefined, getHookCommandOptions(options)),
  codeant: (options) => doctorCodeAntInstructions(undefined, getHookCommandOptions(options)),
  codebuff: (options) => doctorCodebuffInstructions(undefined, getHookCommandOptions(options)),
  codegen: (options) => doctorCodegenInstructions(undefined, getHookCommandOptions(options)),
  "coder-agents": (options) => doctorCoderAgentsSkill(undefined, getHookCommandOptions(options)),
  coderabbit: (options) => doctorCodeRabbitConfig(undefined, getHookCommandOptions(options)),
  codebuddy: (options) => doctorCodeBuddyHook(undefined, getHookCommandOptions(options)),
  "command-code": (options) => doctorCommandCodeHook(undefined, getHookCommandOptions(options)),
  continue: () => doctorContinueRule(),
  "copilot-agent": (options) => doctorCopilotAgentHook(undefined, getHookCommandOptions(options)),
  crush: (options) => doctorCrushSkill(undefined, getHookCommandOptions(options)),
  cursor: (options) => doctorCursorHook(undefined, getHookCommandOptions(options)),
  deepagents: (options) => doctorDeepAgentsInstructions(undefined, getHookCommandOptions(options)),
  devin: (options) => doctorDevinHook(undefined, getHookCommandOptions(options)),
  "dot-agents": (options) => doctorDotAgentsRule(undefined, getHookCommandOptions(options)),
  "docker-agent": (options) => doctorDockerAgentPrompt(undefined, getHookCommandOptions(options)),
  droid: (options) => doctorDroidHook(undefined, getHookCommandOptions(options)),
  eca: (options) => doctorEcaSkill(undefined, getHookCommandOptions(options)),
  elyra: (options) => doctorElyraSkill(undefined, getHookCommandOptions(options)),
  "firebase-studio": (options) => doctorFirebaseStudioRule(undefined, getHookCommandOptions(options)),
  forgecode: (options) => doctorForgeCodeInstructions(undefined, getHookCommandOptions(options)),
  "gemini-cli": (options) => doctorGeminiCliHook(undefined, getHookCommandOptions(options)),
  "gitlab-duo": (options) => doctorGitLabDuoRule(undefined, getHookCommandOptions(options)),
  goose: (options) => doctorGooseHints(undefined, { ...getHookCommandOptions(options), scanProjectTree: false }),
  greptile: (options) => doctorGreptileRule(undefined, getHookCommandOptions(options)),
  "grok-build": (options) => doctorGrokBuildInstructions(undefined, getHookCommandOptions(options)),
  "grok-bot": (options) => doctorGrokBotRule(undefined, getHookCommandOptions(options)),
  "grok-cli": (options) => doctorGrokCliHook(undefined, getHookCommandOptions(options)),
  gptme: (options) => doctorGptmeInstructions(undefined, getHookCommandOptions(options)),
  jean2: (options) => doctorJean2Instructions(undefined, getHookCommandOptions(options)),
  "jetbrains-ai": (options) => doctorJetBrainsAiRule(undefined, getHookCommandOptions(options)),
  junie: () => doctorJunieInstructions(),
  jules: (options) => doctorJulesInstructions(undefined, getHookCommandOptions(options)),
  leanctl: (options) => doctorLeanCtlInstructions(undefined, getHookCommandOptions(options)),
  kimi: (options) => doctorKimiHook(undefined, getHookCommandOptions(options)),
  kiro: () => doctorKiroSteering(),
  kilo: () => doctorKiloRule(),
  knowns: (options) => doctorKnownsInstructions(undefined, getHookCommandOptions(options)),
  localcode: (options) => doctorLocalCodePlugin(getHookCommandOptions(options)),
  "mcp-agent": (options) => doctorMcpAgentDefinition(undefined, getHookCommandOptions(options)),
  "mini-swe-agent": (options) => doctorMiniSweAgentConfig(undefined, getHookCommandOptions(options)),
  "swe-agent": (options) => doctorSweAgentConfig(undefined, getHookCommandOptions(options)),
  stagewise: (options) => doctorStagewiseSkill(undefined, getHookCommandOptions(options)),
  "mistral-vibe": (options) => doctorMistralVibeInstructions(undefined, getHookCommandOptions(options)),
  mux: (options) => doctorMuxHook(undefined, getHookCommandOptions(options)),
  novakit: (options) => doctorNovaKitInstructions(undefined, getHookCommandOptions(options)),
  ona: (options) => doctorOnaSkill(undefined, getHookCommandOptions(options)),
  openhands: (options) => doctorOpenHandsHook(undefined, getHookCommandOptions(options)),
  "open-interpreter": (options) => doctorOpenInterpreterInstructions(undefined, { ...getHookCommandOptions(options), scanProjectTree: false }),
  openwebui: (options) => doctorOpenWebUITool(undefined, getHookCommandOptions(options)),
  "opencode-v2": (options) => doctorOpenCodeV2Extension(getHookCommandOptions(options)),
  pi: () => doctorPiExtension(),
  "pi-go": (options) => doctorPiGoSkill(undefined, getHookCommandOptions(options)),
  plandex: (options) => doctorPlandexConvention(undefined, getHookCommandOptions(options)),
  qodo: (options) => doctorQodoReviewConfig(undefined, getHookCommandOptions(options)),
  qoder: (options) => doctorQoderInstructions(undefined, getHookCommandOptions(options)),
  "qoder-cli": (options) => doctorQoderHook(undefined, getHookCommandOptions(options)),
  qoderwork: () => doctorQoderWorkSkill(),
  "qwen-code": (options) => doctorQwenCodeHook(undefined, options),
  qwenwork: () => doctorQwenWorkSkill(),
  replit: (options) => doctorReplitInstructions(undefined, getHookCommandOptions(options)),
  roo: () => doctorRooInstructions(),
  rovo: (options) => doctorRovoInstructions(undefined, getHookCommandOptions(options)),
  ruler: (options) => doctorRulerRule(undefined, getHookCommandOptions(options)),
  tabby: (options) => doctorTabbySystemPrompt(undefined, getHookCommandOptions(options)),
  tabnine: (options) => doctorTabnineInstructions(undefined, getHookCommandOptions(options)),
  trae: (options) => doctorTraeRule(undefined, getHookCommandOptions(options)),
  uipath: (options) => doctorUiPathInstructions(undefined, getHookCommandOptions(options)),
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
    ...(typeof options.memoryDir === "string" ? { memoryDir: options.memoryDir } : {}),
    ...(typeof options.projectDir === "string" ? { projectDir: options.projectDir } : {}),
    ...(typeof options.scanProjectTree === "boolean" ? { scanProjectTree: options.scanProjectTree } : {}),
    ...(typeof options.configDir === "string" ? { configDir: options.configDir } : {}),
    ...(typeof options.homeDir === "string" ? { homeDir: options.homeDir } : {}),
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
  if ("hasUnsafePathIssue" in report && report.hasUnsafePathIssue === true && report.status === "broken") {
    return true;
  }
  if ("hasTokenjuiceMarker" in report) {
    // Marker-aware instruction hosts may share paths with user-owned files.
    // Without the marker, aggregate doctor should not treat the file as a tokenjuice install.
    return report.hasTokenjuiceMarker === true;
  }
  // Command-backed hosts can warn about missing config even when tokenjuice is
  // not installed. Instruction/extension hosts have no expected command, so a
  // non-disabled status means their tokenjuice artifact exists.
  return report.status !== "disabled" && !("expectedCommand" in report);
}

export function getInstalledHookIntegrations(report: HookDoctorReport): HookIntegrationDoctorEntry[] {
  return (Object.entries(report.integrations) as HookIntegrationDoctorEntry[])
    .filter(([name, integrationReport]) => {
      if (name === "charlie" && "hasTokenjuiceMarker" in integrationReport && integrationReport.hasTokenjuiceMarker === false) {
        // Charlie shares AGENTS.md with other tools, so unsafe unmarked files are not tokenjuice installs.
        return false;
      }
      return isInstalledHookIntegration(integrationReport);
    });
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
