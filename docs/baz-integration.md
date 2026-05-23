# Baz integration

Baz support is beta.

`tokenjuice install baz` writes a reusable workspace skill to
`.baz/skills/tokenjuice/SKILL.md` at the current git/project root. Baz discovers
instruction files and Skill folders containing `SKILL.md`, then converts them
into AI Coding Guidelines for review agents, so tokenjuice uses a dedicated
skill file instead of modifying root `AGENTS.md`.

## Install

```bash
tokenjuice install baz
tokenjuice doctor baz
tokenjuice uninstall baz
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.baz/skills/tokenjuice/SKILL.md`. Set
`BAZ_PROJECT_DIR=/path/to/project` to target a specific project directory during
tests or scripted installs.

## Behavior

- The skill frontmatter uses `name: tokenjuice`, matching the skill directory.
- The skill tells Baz agents to prefer `tokenjuice wrap -- <command>` when
  review, fixer, or runtime-inspection workflows run noisy terminal commands.
- The skill tells Baz agents to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing tokenjuice skill content is backed up before install.

## Current beta caveat

Baz skills are AI Coding Guidelines input, not command hooks. This integration
does not change Baz reviewer configuration, intercept PR comments, or rewrite
shell output; it gives Baz a discoverable workspace skill for deciding when to
invoke tokenjuice around noisy terminal commands.
