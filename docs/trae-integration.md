# Trae integration

`tokenjuice install trae` inserts a marker-delimited rule block into the
current git/project root `.trae/rules/project_rules.md`. Trae documents project
rules as Markdown loaded from `.trae/rules/project_rules.md`, so this gives Trae
terminal-output guidance without claiming a runtime output hook.

```bash
tokenjuice install trae
tokenjuice doctor trae
tokenjuice uninstall trae
```

By default, tokenjuice resolves the nearest git root before writing
`.trae/rules/project_rules.md`. Set `TRAE_PROJECT_DIR=/path/to/workspace` to
override the target workspace explicitly.

The installed block tells Trae to use `tokenjuice wrap -- <command>` for
terminal commands likely to produce long output, and to use
`tokenjuice wrap --raw -- <command>` only when raw bytes are required.

`doctor trae` reports `ok` when the `.trae/rules/project_rules.md` block exists,
includes tokenjuice wrap guidance, includes the raw escape hatch, and does not
suggest the full-output escape hatch.

This integration is guidance-only. Trae has documented MCP and `.rules`
surfaces, but no documented terminal output replacement hook. A hook-backed
adapter should only be added if Trae documents or exposes that contract.
