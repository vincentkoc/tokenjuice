# Changelog

## Unreleased

### Features

- Add a beta Amazon Q Developer CLI workspace-rule integration.
- Add a beta IBM Bob Shell context-file integration.
- Add a beta Builder Projects rule integration.
- Add a beta Codebuff instruction integration.
- Add a beta Devin for Terminal PreToolUse hook integration.
- Add a beta Firebase Studio AI-rules integration.
- Add a beta gptme instruction integration.
- Add a beta JetBrains AI Assistant project-rule integration.
- Add a beta Jules instruction integration.
- Add a beta Kimi Code CLI PostToolUse hook integration.
- Add a beta Mistral Vibe instruction integration.
- Add a beta Replit Agent instruction integration.
- Add a beta Rovo Dev CLI project-memory integration.
- Add a beta Tabnine CLI project-context integration.
- Add a beta Trae project-rule integration.
- Add a beta Warp project-rules integration.

### Fixes

- Normalize stored artifact sources for Copilot, Droid, and VS Code Copilot hook adapters.

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
