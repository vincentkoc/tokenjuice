# Ona integration

Ona support is beta.

`tokenjuice install ona` writes a repository skill at
`.ona/skills/tokenjuice/SKILL.md`. Ona discovers repository skills by
frontmatter description and loads the skill when it matches the task, so
tokenjuice uses that reusable workflow surface instead of always-loaded
`AGENTS.md` context.

```bash
tokenjuice install ona
tokenjuice doctor ona
tokenjuice uninstall ona
```

By default, tokenjuice resolves the nearest git root before writing the skill.
Set `ONA_PROJECT_DIR=/path/to/workspace` to override the target workspace
explicitly.

The installed skill tells Ona Agent to use `tokenjuice wrap -- <command>` for
terminal commands likely to produce long output, and to use
`tokenjuice wrap --raw -- <command>` only when raw bytes are required.

Existing `.ona/skills/tokenjuice/SKILL.md` content is backed up before install.
Uninstall removes only the tokenjuice skill file.

`doctor ona` reports `ok` when the skill exists, has `name` and `description`
frontmatter, includes tokenjuice wrap guidance, includes the raw escape hatch,
mentions the `.ona/skills/tokenjuice/SKILL.md` discovery path, and does not
suggest the full-output escape hatch.

This integration is guidance-only. Ona can read the skill, but the skill does
not replace terminal command output.
