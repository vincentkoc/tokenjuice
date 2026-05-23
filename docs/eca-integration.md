# ECA integration

ECA support is beta.

`tokenjuice install eca` writes a reusable workspace skill to
`.eca/skills/tokenjuice/SKILL.md` at the current git/project root. ECA
discovers skills from `.eca/skills/` and exposes them through the `eca__skill`
tool and matching slash commands, so tokenjuice uses that native skill surface
instead of a shell hook.

## Install

```bash
tokenjuice install eca
tokenjuice doctor eca
tokenjuice uninstall eca
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.eca/skills/tokenjuice/SKILL.md`. Set
`ECA_PROJECT_DIR=/path/to/project` to target a specific project
directory during tests or scripted installs.

## Behavior

- The skill frontmatter uses `name: tokenjuice`, matching the skill directory.
- The skill tells ECA to prefer `tokenjuice wrap -- <command>` for
  `eca__shell_command` calls likely to produce long output.
- The skill tells ECA to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing ECA skill content is backed up without clobbering older backups;
  uninstall restores that exact pre-existing file when possible.

## Current beta caveat

ECA workspace skills are prompt/tool guidance, not command hooks. This
integration does not register MCP tools, change ECA config, or rewrite
shell output; it gives ECA a discoverable workspace skill for deciding
when to invoke tokenjuice around noisy terminal commands.
