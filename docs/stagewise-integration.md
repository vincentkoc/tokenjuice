# Stagewise integration

`tokenjuice install stagewise` writes a reusable workspace skill to
`.stagewise/skills/tokenjuice/SKILL.md` at the current git/project root.
Stagewise loads skills from `.stagewise/skills/` first, then shared
`.agents/skills/` directories, and each skill is a folder with a required
`SKILL.md` file.

```bash
tokenjuice install stagewise
tokenjuice doctor stagewise
tokenjuice uninstall stagewise
```

The integration is guidance-only. Stagewise still owns shell execution and tool
output delivery; the skill tells Stagewise agents to prefer `tokenjuice wrap --`
for noisy terminal commands and to use `tokenjuice wrap --raw --` only when raw
bytes are needed.

By default, tokenjuice writes
`<git-root>/.stagewise/skills/tokenjuice/SKILL.md`. Set
`STAGEWISE_PROJECT_DIR` to target a specific project directory.

`tokenjuice doctor hooks` includes the Stagewise skill status alongside
hook-based hosts. `tokenjuice uninstall stagewise` removes only the tokenjuice
Stagewise skill.
