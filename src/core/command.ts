export {
  hasSequentialShellCommands,
  isCompoundShellCommand,
  splitTopLevelCommandChain,
  stripLeadingCdPrefix,
  tokenizeCommand,
} from "./command-shell.js";

export type { CommandMatchCandidate } from "./command-match.js";
export {
  deriveCommandMatchCandidates,
  getEffectiveCommandArgv,
  isSetupWrapperSegment,
  resolveEffectiveCommand,
  stripLeadingEnvAssignments,
  unwrapShellRunner,
} from "./command-match.js";

export {
  getCommandName,
  getGitSubcommand,
  isFileContentInspectionCommand,
  isRepositoryInspectionCommand,
  normalizeCommandSignature,
  normalizeEffectiveCommandSignature,
} from "./command-identity.js";

export { normalizeExecutionInput } from "./execution-input.js";
