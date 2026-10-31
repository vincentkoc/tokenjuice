# Changelog

## Unreleased

### Fixes

- Preserve failed-command stdout/stderr in automatic pre-tool wrappers and validate complete 80-line failures through native Claude Code, CodeBuddy, Droid, Gemini CLI and Qwen Code model requests.
- Silence obsolete Droid and Qwen Code post-tool handlers, removing duplicate additive summaries, diagnostics and artifact writes; retain reinstall migration to pre-tool wrapping.

- Require proven shell exit 0 before Copilot coding-agent compaction, share the CLI result compactor, preserve completion metadata and validate the repository hook through real local CLI sessions without claiming cloud acceptance.
- Retire OpenHands additive hook compaction, preserve scoped cleanup for both supported configuration formats, and keep stale hooks silent.

- Replace the undiscovered Cline additive hook with native pre-tool batch wrapping, preserve complete failed-command streams with opt-in `--keep-failures`, migrate owned legacy scripts, and validate real CLI 3.0.74 sessions.
- Retire Command Code additive hook compaction, preserve scoped legacy cleanup and custom hooks, and document the native 1.88.2 authentication blocker without claiming host E2E coverage.

- Match native Copilot CLI Bash hooks, require proven shell exit 0 before compaction, and preserve completion metadata outside output summaries; verify real 1.0.105 model requests and remove obsolete synthetic fixtures.
- Retire additive Mux/Xum automatic compaction, keep legacy hook cleanup and silent handlers, and qualify explicit wrapping against the published Xum CLI.

- Retire community Grok CLI additive hook compaction, retain scoped legacy cleanup, and validate explicit wrapping against the actual packaged standalone runtime.
- Validate OpenCode V2 plugin discovery and model-visible shell-result replacement with native v2.0.18 baseline/installed sessions, including exact reads, raw bypass and complete failure metadata.

- Retire Kimi automatic compaction because current observation-only hooks cannot replace model output; preserve legacy cleanup and validate explicit wrapping with native Kimi Code CLI 2.4.1.
- Preserve original Codex Bash results when hook payloads omit exit status, avoiding duplicate summaries and lost failure metadata; replace eligible status-bearing results through supported hook feedback and add native 0.166.0 acceptance coverage.

- Route Gemini CLI shell commands through pre-tool wrapping so compacted successes retain native status; migrate legacy result-blocking hooks and honor `GEMINI_CLI_HOME`.
- Keep Qwen Code shell wrapping on native Bash instead of the login `SHELL`, preserving Bash commands for fish and other non-Bash login shells.

- Document Droid 1.1.0's High autonomy requirement for headless pre-tool command rewrites, verified through native sessions.
- Route Qwen Code shell commands through pre-tool wrapping so compacted output reaches the model; migrate legacy context-only hooks on reinstall and verify native sessions in CI.

- Send CodeBuddy pre-tool command rewrites through the runtime-supported `updatedInput` field so installed hooks compact Bash output.
- Add QoderWork terminal guidance skill installation, diagnostics and owned-file removal at its documented user skill path.
- Add explicit OpenCode V2 plugin directory installation, diagnostics and owned-file removal without changing the V1 target.

- Document the external OpenClaw plugin installation step before enabling it, replacing the outdated bundled-plugin instructions.
- Add a Qoder CLI native-hook lifecycle API with synchronous Bash replacement, scoped removal and configuration diagnostics.

- Enforce input byte limits while reading CLI files, Mux hook JSON, and Pi/OpenCode full output, including files that grow during a read.
- Keep source normalization, shell flag matching, and hook configuration parsing responsive on long or malformed input.
- Parse guarded setup commands from hook input without regular-expression backtracking.
- Add Antigma Ante project instruction installation, doctor and uninstall, preserving the active CLAUDE.md fallback where applicable.

- Export an OpenCode plugin initializer accepted by the host loader, restoring shell-output compaction; warn when an older plugin needs reinstalling.
- Honor explicit `tokenjuice wrap --raw` / `--full` bypasses in shared post-tool compaction.
- Droid install, doctor and uninstall respect existing standalone hook files and their unwrapped event-map format.
- Add the Qoder synchronous post-tool runtime entrypoint for compacting successful foreground Bash output while preserving its response envelope.

- Preserve exact file-read output through pre-tool hook wrapping without appending an extra newline.
- Route Droid Execute commands through pre-tool wrapping so compacted output replaces noisy terminal output; migrate legacy tokenjuice post-tool entries on reinstall.
- Publish Mux hook updates atomically from checked file snapshots, preserve executable permissions, and reserve backups without overwriting concurrent files.

- Keep the community Grok CLI hook fail-open when its JSON input is null, an array or a primitive.

- Warn when the visible Goose context filename configuration excludes installed `.goosehints`, and document its Developer extension prerequisite.

- Expose native Qoder CLI hook installation, doctor and uninstall as `qoder-cli`, retaining the existing `qoder` instruction target.
- Add a DeepSeek Harness native Bash post-execute plugin that compacts model-facing content while preserving canonical values and downstream policy decisions.
- Package the DeepSeek Harness runtime as a self-contained, version-pinned Cordis bundle with native profile activation guidance.
- Add a separate OpenCode V2 shell-result runtime with coherent structured/content replacement and failure-preserving guards.
- Add QwenWork guidance skill installation, diagnostics and owned-file uninstall at its documented user skill path.

### Maintenance

- Publish adapter support modes, automated evidence and remaining host-acceptance steps; distinguish OpenCode V1/V2 setup in T3 guidance.

- Pin third-party GitHub Actions to verified commit SHAs so mutable tags cannot replace CI or release code.
- Document T3 Code provider configuration boundaries and verification requirements.

- Audit dependencies weekly and on pull requests, validate Node.js 22/24/26, and patch the development-tool minimatch denial-of-service advisory.
- Scan JavaScript, TypeScript, and GitHub Actions workflows with CodeQL on pull requests, main pushes, and a weekly schedule.

- Document QClaw migration to WorkBuddy and the boundary between account migration and tokenjuice host support.

- Provide a portable WorkBuddy desktop guidance skill with localized metadata and explicit manual-import/runtime verification steps.
- Provide a portable Doubao Work terminal guidance skill and document personal import, archive layout and execution verification.
- Provide an AutoClaw skill-creation workflow with explicit command capability and runtime dependency checks.
- Distinguish Grok Bot cloud skills, Grok Build passive hooks and the community Grok CLI; provide a copyable cloud terminal workflow.

### Breaking changes

- Require Node.js 22 or newer (`engines.node` is now `>=22`). Node.js 20 reached end of life in April 2026.

## 0.8.5 - 2026-09-15

### Fixes

- Preserve symlinked Claude Code, CodeBuddy, and Droid settings targets and file permissions when installing or removing hooks. (#232)

## 0.8.4 - 2026-09-13

### Fixes

- Honor the statistics opt-out for Droid hook diagnostics and keep diagnostic write failures from failing hooks or duplicating their responses. (#230)
- Bound metadata and Codex hook telemetry with retained, size-capped JSONL segments; support paged stats reads and a complete statistics opt-out without migrating or deleting legacy sidecars. (#228)
- Preserve JSON, instruction files, database schemas, non-zero failures, combined stdout/stderr, and JSON-string exit status in the Codex hook contract. (#228)
- Register Codex hooks through the shared `codex-hooks` renderer when available, preserve unrelated commands in standalone matcher groups, and reject mixed-group renderer migration before mutation. (#228)

### Maintenance

- Update Vitest from 4.1.9 to 4.1.11. (#229)

## 0.8.3 - 2026-09-04

### Features

- Add a beta Grok Bot project-guidance integration through a Cursor-format `.cursor/rules/tokenjuice.mdc` rule with `alwaysApply: true` metadata. (#222)

### Fixes

- Sync the canonical Homebrew tap from the published Tokenjuice release. (#225)
- Generate strict-audit-compatible Homebrew formulas with verified local checksums, support explicit published-tarball recovery, and leave tap publication to the target repository workflow. (#226)

## 0.8.2 - 2026-09-04

### Fixes

- Let Codex hooks fail open without adding context when tool responses or hook input exceed safety limits. (#211)
- Pin Codex JavaScript launchers to a verified Node runtime and report duplicate, missing, non-executable, runtime-skewed, and package-skewed hook commands. (#213)
- Clarify CodeBuddy hook activation after external settings changes and keep doctor claims limited to persisted configuration. (#208)
- Rank per-source stats by observed cost and clarify missing source metadata. (#223)
- Preserve quoted commands and Windows paths when wrapping POSIX shell payloads. (#219)
- Keep installed Codex hooks omission-policy neutral while honoring runtime environment policy. (#218)
- Keep Codex compaction feedback inert and omit recovery references for non-authoritative rewrites. (#214)
- Keep raw and full command output available when optional telemetry storage is unavailable. (#216)
- Collapse oversized repeated-emoji banners in generic fallback summaries while preserving raw and no-omission output. (#220)
- Render successful generic error and warning counters as neutral mentions. (#221)

### Maintenance

- Isolate the test suite from local environment state. (#217)

## 0.8.1 - 2026-06-18

### Fixes

- Harden ownership detection, restoration, and malformed marker handling for beta host integrations.
- Build release artifacts from explicit tags and validate Homebrew tap release-tag input.
- Make `pnpm build` portable across supported Node platforms.

## 0.8.0 - 2026-05-25

### Features

- Add a beta Agent Layer source-instruction integration.
- Add a beta AdaL CLI instruction integration.
- Add a beta Aether prompt-source integration.
- Add a beta aictl project-prompt integration.
- Add a beta AI Memory Protocol RST-memory integration.
- Add a beta AgentInit source-instruction integration.
- Add a beta Agentlink source-instruction integration.
- Add a beta anywhere-agents source-instruction integration.
- Add a beta Amazon Q Developer CLI workspace-rule integration.
- Add a beta Agentloom source-rule integration.
- Add a beta agents-cli shared-memory integration.
- Add a beta AGENTS.md instruction integration.
- Add a beta agents.ge source-rule integration.
- Add a beta AgentsMesh source-rule integration.
- Add a beta Baz workspace-skill integration.
- Add a beta Bito custom-guidelines integration.
- Add a beta Blackbox CLI workspace-skill integration.
- Add a beta Blocks repo-skill integration.
- Add a beta Clawdbot workspace-skill integration.
- Add a beta IBM Bob Shell context-file integration.
- Add a beta Builder Projects rule integration.
- Add a beta Charlie AGENTS.md instruction integration.
- Add a beta CodeAnt review-instructions integration.
- Add a beta Codebuff instruction integration.
- Add a beta Codegen instruction integration.
- Add a beta Coder Agents workspace-skill integration.
- Add a beta CodeRabbit path-instruction integration.
- Add a beta Command Code PostToolUse hook integration.
- Add a beta Deep Agents Code instruction integration.
- Add a beta Devin for Terminal PreToolUse hook integration.
- Add a beta dot-agents global-rule integration.
- Add a beta Docker Agent prompt-file integration.
- Add a beta ECA workspace-skill integration.
- Add a beta Elyra workspace-skill integration.
- Add a beta Firebase Studio AI-rules integration.
- Add a beta ForgeCode AGENTS.md instruction integration.
- Add a beta GitLab Duo custom-rules integration.
- Add a beta Greptile rules integration.
- Add a beta gptme instruction integration.
- Add a beta Jean2 instruction integration.
- Add a beta JetBrains AI Assistant project-rule integration.
- Add a beta Jules instruction integration.
- Add a beta LeanCTL project-instruction integration.
- Add a beta Kimi Code CLI PostToolUse hook integration.
- Add a beta LocalCode plugin integration.
- Add a beta mcp-agent agent-definition integration.
- Add a beta mini-SWE-agent config-fragment integration.
- Add a beta SWE-agent config-fragment integration.
- Add a beta Stagewise workspace-skill integration.
- Add a beta Mistral Vibe instruction integration.
- Add a beta Mux tool_post hook integration.
- Add a beta NovaKit context-file integration.
- Add a beta Knowns guidance-file integration.
- Add a beta Ona Agent workspace-skill integration.
- Add a beta pi-go workspace-skill integration.
- Add a beta Qodo review-guideline integration.
- Add a beta Replit Agent instruction integration.
- Add a beta Rovo Dev CLI project-memory integration.
- Add a beta Tabby system-prompt integration.
- Add a beta Tabnine CLI project-context integration.
- Add a beta Trae project-rule integration.
- Add a beta UiPath for Coding Agents instruction integration.
- Add a beta Warp project-rules integration.
- Add a beta Zencoder Zen Rules integration.

### Fixes

- Preserve existing instruction-file `.bak` backups instead of overwriting them during install.
- Preserve existing JetBrains AI Assistant `.bak` rule backups when installing over a custom rule.
- Normalize stored artifact sources for Copilot, Droid, and VS Code Copilot hook adapters.
- Add missing uninstall coverage for Claude Code, CodeBuddy, Cursor, and pi integrations.

## 0.7.1 - 2026-05-17

### Fixes

- Route `node scripts/run-vitest.mjs` output through the Vitest reducer so Rolldown plugin timing warnings do not drown out passing test summaries.
- Match wrapped Bash commands after harmless terminal setup preludes such as `tt title` or `tmux select-pane -T`.
- Route Claude Code through a `PreToolUse` Bash wrapper so Tokenjuice compacts the actual command result without duplicate `PostToolUse` context or approval-flow bypasses.
- Preserve CodeBuddy's native Bash approval flow when wrapping `PreToolUse` commands.
- Keep the Codex hook compatible with current Codex hook and approval surfaces, including `hooks`, `PermissionRequest`, Windows commands, async hooks, and approval/sandbox doctor reporting.
- Compact whole JSON fallback output without dropping non-zero exit status.
- Add timeout safety caps to Tokenjuice-installed Codex, Claude Code, and Copilot CLI hooks, with doctor warnings for stale entries.

### Maintenance

- Add `--help`/`-h` output to the Codex log analysis script.
- Update CI to the Node 24-ready pnpm setup action and remove the stale Release Drafter input warning.
