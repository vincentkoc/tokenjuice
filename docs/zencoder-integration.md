# Zencoder integration

Zencoder support is beta.

`tokenjuice install zencoder` writes an always-applied Zen Rule to
`.zencoder/rules/tokenjuice.md` in the current workspace. Zencoder documents Zen
Rules as project-specific Markdown files under `.zencoder/rules/*.md`, with
`alwaysApply: true` for rules included in every request.

```bash
tokenjuice install zencoder
tokenjuice doctor zencoder
tokenjuice uninstall zencoder
```

By default tokenjuice resolves the nearest git root and writes the project rule
there. Set `ZENCODER_PROJECT_DIR=/path/to/repo` to target a specific repository
in scripts or tests.

If the target rule file already exists, tokenjuice backs it up before replacing
it. `tokenjuice uninstall zencoder` only removes tokenjuice-managed Zen Rules;
when a pre-tokenjuice backup exists, uninstall restores that backup.

The installed rule tells Zencoder to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. Zencoder still owns agent behavior, command execution,
and rule loading; tokenjuice does not intercept or rewrite Zencoder tool output.

`doctor zencoder` reports `ok` when the Zen Rule exists, contains
`description` and `alwaysApply: true` frontmatter, contains the tokenjuice ownership marker and
`tokenjuice wrap` guidance, and does not advertise the older `--full` escape
hatch.
