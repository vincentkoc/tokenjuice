# Elyra integration

Elyra support is beta.

`tokenjuice install elyra` writes a reusable workspace skill to
`.elyra/skills/tokenjuice/SKILL.md` at the current git/project root. Elyra
discovers skills from `.elyra/skills/` and exposes them through available-skill
context and `/skill:tokenjuice`, so tokenjuice uses that native skill surface
instead of a shell hook.

## Install

```bash
tokenjuice install elyra
tokenjuice doctor elyra
tokenjuice uninstall elyra
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.elyra/skills/tokenjuice/SKILL.md`. Set
`ELYRA_PROJECT_DIR=/path/to/project` to target a specific project
directory during tests or scripted installs.

## Behavior

- The skill frontmatter uses `name: tokenjuice`, matching the skill directory.
- The skill tells Elyra to prefer `tokenjuice wrap -- <command>` for
  `bash` tool calls likely to produce long output.
- The skill tells Elyra to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing Elyra skill content is backed up without clobbering older backups;
  uninstall restores that exact pre-existing file when possible.

## Current beta caveat

Elyra workspace skills are prompt/tool guidance, not command hooks. This
integration does not register MCP tools, change Elyra config, or rewrite
shell output; it gives Elyra a discoverable workspace skill for deciding
when to invoke tokenjuice around noisy terminal commands.
