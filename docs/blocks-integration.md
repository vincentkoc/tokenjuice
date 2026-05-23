# Blocks integration

`tokenjuice install blocks` writes a reusable repo skill to
`.agents/skills/tokenjuice-blocks/SKILL.md` at the current git/project root.
Blocks loads repo skills from `.claude/skills/`, `.codex/skills/`, and
`.agents/skills/`, and the skill folder name becomes the slash command.

```bash
tokenjuice install blocks
tokenjuice doctor blocks
tokenjuice uninstall blocks
```

The integration is guidance-only. Blocks still owns shell execution and tool
output delivery; the skill tells Blocks agents to prefer `tokenjuice wrap --`
for noisy terminal commands and to use `tokenjuice wrap --raw --` only when raw
bytes are needed.

By default, tokenjuice writes
`<git-root>/.agents/skills/tokenjuice-blocks/SKILL.md`. Set
`BLOCKS_PROJECT_DIR` to target a specific project directory.

`tokenjuice doctor hooks` includes the Blocks skill status alongside hook-based
hosts. `tokenjuice uninstall blocks` removes only the tokenjuice Blocks skill.
