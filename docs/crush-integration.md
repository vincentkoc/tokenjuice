# Crush integration

Crush support is beta.

`tokenjuice install crush` writes a project-local Agent Skill:

```text
.crush/skills/tokenjuice/SKILL.md
```

The skill tells Crush how to use `tokenjuice wrap -- <command>` for noisy
terminal commands and `tokenjuice wrap --raw -- <command>` as the raw-output
escape hatch.

## Install

```bash
tokenjuice install crush
tokenjuice doctor crush
```

## Behavior

- This is guidance-only. It does not install Crush hooks and does not rewrite
  shell commands before execution.
- Crush remains responsible for command approval, shell state, and any existing
  project or global hook policy.
- The skill explicitly tells Crush not to wrap commands that intentionally
  change shell state, such as `cd`, `export`, `source`, shell option changes,
  or activation scripts.
- Existing `SKILL.md` content at the tokenjuice skill path is backed up before
  replacement.

## Why this is not a hook

Crush `PreToolUse` hooks can return `updated_input`, but hook composition and
config merge behavior make a project-local command-rewrite hook risky: it can
compete with other input rewriters, mask parent or global hook arrays, and break
stateful shell commands by moving side effects into a child shell. The
tokenjuice integration therefore uses an Agent Skill instead of intercepting
command execution.

## Uninstall

```bash
tokenjuice uninstall crush
```
