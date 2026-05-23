# Windsurf integration

Windsurf support is beta.

`tokenjuice install windsurf` writes an always-on workspace rule to
`.windsurf/rules/tokenjuice.md` in the current workspace. Windsurf Cascade
discovers workspace rules from `.windsurf/rules/*.md`, so this gives Cascade
stable guidance for using tokenjuice when it runs terminal commands.

## Install

```bash
tokenjuice install windsurf
tokenjuice doctor windsurf
```

## Behavior

- The rule tells Cascade to prefer `tokenjuice wrap -- <command>` for noisy
  terminal commands.
- The rule tells Cascade to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.windsurf/rules/tokenjuice.md` content is backed up before install.
- `WINDSURF_PROJECT_DIR` can override the workspace root for tests and scripted
  installs.

## Current beta caveat

Windsurf workspace rules are prompt guidance, not command hooks. Cascade Hooks
can run before or after terminal commands, but the documented terminal-command
events are for blocking, logging, and workflow automation rather than replacing
the command output returned to Cascade.
