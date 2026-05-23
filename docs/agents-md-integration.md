# AGENTS.md integration

Generic AGENTS.md support is beta.

`tokenjuice install agents-md` inserts a marker-delimited block into `AGENTS.md`
in the current git/project root. The block gives any agent that reads AGENTS.md
the same terminal-output guidance tokenjuice installs for host-specific
instruction integrations.

## commands

```bash
tokenjuice install agents-md
tokenjuice doctor agents-md
tokenjuice uninstall agents-md
```

## behavior

- The block keeps agent command execution unchanged.
- It is guidance-only; the active coding agent still owns tools, approvals, and output handling.
- The block tells agents to use `tokenjuice wrap -- <command>` for noisy terminal commands.
- `tokenjuice wrap --raw -- <command>` remains the escape hatch when exact bytes are required.
- The block intentionally does not suggest `tokenjuice wrap --full`.
- Host-specific tokenjuice AGENTS.md blocks can coexist with the generic block because each integration uses distinct markers.

## path override

Set `AGENTS_MD_PROJECT_DIR` to install or inspect AGENTS.md guidance for another
workspace:

```bash
AGENTS_MD_PROJECT_DIR=/path/to/repo tokenjuice install agents-md
```
