# Coder Agents integration

Coder Agents support is beta.

`tokenjuice install coder-agents` writes a reusable workspace skill to
`.agents/skills/tokenjuice/SKILL.md` at the current git/project root. Coder
Agents discovers skills from `.agents/skills/` and loads their full instructions
on demand, so tokenjuice uses that native skill surface instead of a shell hook.

## Install

```bash
tokenjuice install coder-agents
tokenjuice doctor coder-agents
tokenjuice uninstall coder-agents
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.agents/skills/tokenjuice/SKILL.md`. Set
`CODER_AGENTS_PROJECT_DIR=/path/to/project` to target a specific project
directory during tests or scripted installs.

## Behavior

- The skill frontmatter uses `name: tokenjuice`, matching the skill directory.
- The skill tells Coder Agents to prefer `tokenjuice wrap -- <command>` for
  terminal commands likely to produce long output.
- The skill tells Coder Agents to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing Coder skill content is backed up without clobbering older backups;
  uninstall restores that exact pre-existing file when possible.

## Current beta caveat

Coder Agents workspace skills are prompt/tool guidance, not command hooks. This
integration does not register MCP tools, change Coder templates, or rewrite
shell output; it gives Coder Agents a discoverable workspace skill for deciding
when to invoke tokenjuice around noisy terminal commands.
