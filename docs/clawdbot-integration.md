# Clawdbot integration

Clawdbot support is beta.

`tokenjuice install clawdbot` writes a reusable workspace skill to
`skills/tokenjuice/SKILL.md` at the current git/project root. Clawdbot loads
workspace skills from `<workspace>/skills`, with workspace skills taking
precedence over user and bundled skills, so tokenjuice uses that native skill
surface instead of a shell hook.

## Install

```bash
tokenjuice install clawdbot
tokenjuice doctor clawdbot
tokenjuice uninstall clawdbot
```

By default tokenjuice resolves the current git root and writes
`<git-root>/skills/tokenjuice/SKILL.md`. Set
`CLAWDBOT_PROJECT_DIR=/path/to/project` to target a specific project directory
during tests or scripted installs.

## Behavior

- The skill frontmatter uses `name: tokenjuice`, matching the skill directory,
  and `user-invocable: false`, so the guidance skill does not expose a slash
  command.
- The skill tells Clawdbot to prefer `tokenjuice wrap -- <command>` for terminal
  commands likely to produce long output.
- The skill tells Clawdbot to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing tokenjuice skill content is backed up before install.

## Current beta caveat

Clawdbot workspace skills are prompt/tool guidance, not command hooks. This
integration does not register tools, change Clawdbot config, or rewrite shell
output; it gives Clawdbot a discoverable workspace skill for deciding when to
invoke tokenjuice around noisy terminal commands.
