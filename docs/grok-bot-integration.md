# Grok Bot integration

Grok Bot support is experimental and guidance-only.

`tokenjuice install grok-bot` creates a Cursor-format workspace rule with
`alwaysApply: true` metadata at `.cursor/rules/tokenjuice.mdc`. The rule asks
Grok Bot to use tokenjuice for noisy terminal commands. Grok Bot owns terminal
execution and output delivery; tokenjuice does not install an interception hook
or rewrite tool results.

## Cloud skill workflow

Current [Grok Bot documentation](https://docs.x.ai/grok-bot/computer-and-apps)
places command execution on a persistent cloud computer. A rule written by the
local installer does not establish that the cloud runtime can see or load it.

Use the [copyable tokenjuice workflow](../packaging/skills/grok-bot/tokenjuice-instructions.md)
and ask the Bot to save it as a private skill named `tokenjuice`. Invoke it by
name. If needed, enable it for that Bot under **Connect apps → connected count
→ Private skills**. Test one noisy command before relying on it. The workflow
checks tokenjuice inside the cloud shell; local availability is insufficient.
[Official skill workflow](https://docs.x.ai/grok-bot/skills-routines-and-automations).

Private skill creation and live wrapper execution remain unqualified. This
guide does not create a routine or publish a skill to a team.

## Local rule compatibility candidate


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

The historical bundle evidence does not qualify newer Grok Bot builds or its
cloud computer. Verify the rule appears in the Bot's loaded context and a wrapped
command reaches the next model request before relying on this candidate.

The repository suite verifies rule lifecycle, backup restoration, project-root
resolution, path safety, doctor output, and both CLI target names.
`tokenjuice doctor grok-bot` verifies the managed rule only; it does not launch
Grok Bot or claim output interception.
