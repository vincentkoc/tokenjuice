# pi-go integration

pi-go support is beta.

`tokenjuice install pi-go` writes a reusable workspace skill to
`.pi/skills/tokenjuice/SKILL.md` at the current git/project root. pi-go
discovers project skills from `.pi/skills/` and `.agents/skills/`, audits them
for hidden Unicode threats, and loads their full instructions, so tokenjuice
uses the pi-specific project skill surface instead of a shell hook.

## Install

```bash
tokenjuice install pi-go
tokenjuice doctor pi-go
tokenjuice uninstall pi-go
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.pi/skills/tokenjuice/SKILL.md`. Set
`PI_GO_PROJECT_DIR=/path/to/project` to target a specific project
directory during tests or scripted installs.

## Behavior

- The skill frontmatter uses `name: tokenjuice`, matching the skill directory.
- The skill tells pi-go to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The skill tells pi-go to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing pi-go skill content is backed up without clobbering older backups;
  uninstall restores that exact pre-existing file when possible.

## Current beta caveat

pi-go workspace skills are prompt/tool guidance, not command hooks. This
integration does not register MCP tools, change pi-go config, or rewrite
shell output; it gives pi-go a discoverable workspace skill for deciding
when to invoke tokenjuice around noisy terminal commands.
