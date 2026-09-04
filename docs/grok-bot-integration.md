# Grok Bot integration

Grok Bot support is beta and guidance-only.

`tokenjuice install grok-bot` creates a Cursor-format workspace rule with
`alwaysApply: true` metadata at `.cursor/rules/tokenjuice.mdc`. The rule asks
Grok Bot to use tokenjuice for noisy terminal commands. Grok Bot owns terminal
execution and output delivery; tokenjuice does not install an interception hook
or rewrite tool results.

## Install

```bash
tokenjuice install grok-bot
tokenjuice doctor grok-bot
tokenjuice uninstall grok-bot
```

The `grokbot` target is accepted as an alias. The generic `grok` target is not
claimed because it is ambiguous with other Grok products.

By default tokenjuice resolves the current git root and writes
`<git-root>/.cursor/rules/tokenjuice.mdc`. Set
`GROK_BOT_PROJECT_DIR=/path/to/project` to target a specific project directory
during tests or scripted installs.

## Behavior

- The rule uses Cursor-compatible `.mdc` frontmatter with `alwaysApply: true`.
- The rule recommends `tokenjuice wrap -- <command>` for noisy commands.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing content at the owned rule path is backed up and restored on
  uninstall.
- Install, doctor, and uninstall reject paths outside the project as well as
  symlinked, hard-linked, and non-regular rule files.
- Shared `AGENTS.md` content is not modified.

## Contract evidence

The signed Grok Bot 0.39.0 macOS application is an Anysphere build. Its shipped
local execution bundle reserves `.cursor/rules` and `.cursor/rules/**` as
workspace rule paths. Static bundle inspection does not prove that Grok Bot
loads or applies those rules. Live acceptance remains pending because the
installed application did not complete startup during verification. The same
bundle contains no `AGENTS.md` or `CLAUDE.md` reference, so this integration
uses the Cursor-rule surface instead of assuming another instruction-file
contract.

The repository suite verifies rule lifecycle, backup restoration, project-root
resolution, path safety, doctor output, and both CLI target names.
`tokenjuice doctor grok-bot` verifies the managed rule only; it does not launch
Grok Bot or claim output interception.
