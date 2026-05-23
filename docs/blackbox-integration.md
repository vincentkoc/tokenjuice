# Blackbox integration

Blackbox support is beta.

`tokenjuice install blackbox` writes a reusable workspace skill to
`.blackbox/skills/tokenjuice/SKILL.md` at the current git/project root. Blackbox
CLI discovers skills from `.blackbox/skills/` and loads their instructions when
relevant, so tokenjuice uses that native skill surface instead of a shell hook.

## Install

```bash
tokenjuice install blackbox
tokenjuice doctor blackbox
tokenjuice uninstall blackbox
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.blackbox/skills/tokenjuice/SKILL.md`. Set
`BLACKBOX_PROJECT_DIR=/path/to/project` to target a specific project directory
during tests or scripted installs.

## Behavior

- The skill frontmatter uses `name: tokenjuice`, matching the skill directory.
- The skill tells Blackbox CLI to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The skill tells Blackbox CLI to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing tokenjuice skill content is backed up before install.

## Current beta caveat

Blackbox workspace skills are prompt/tool guidance, not command hooks. This
integration does not register MCP tools, change Blackbox sessions, or rewrite
shell output; it gives Blackbox CLI a discoverable workspace skill for deciding
when to invoke tokenjuice around noisy terminal commands.
