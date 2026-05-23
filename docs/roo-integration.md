# Roo Code integration

Roo Code support is beta.

`tokenjuice install roo` writes a marker-delimited rule block to
`.roo/rules/tokenjuice.md` in the current workspace. Roo Code loads workspace
rules from `.roo/rules/`, so this gives both the VS Code extension and Roo CLI
stable guidance for using tokenjuice when they run terminal commands.

## Install

```bash
tokenjuice install roo
tokenjuice doctor roo
```

## Behavior

- The rule tells Roo to prefer `tokenjuice wrap -- <command>` for noisy
  `execute_command` terminal commands.
- The rule tells Roo to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.roo/rules/tokenjuice.md` content is backed up before install and
  preserved around the tokenjuice block.
- `ROO_PROJECT_DIR` can override the workspace root for tests and scripted
  installs.

## Current beta caveat

Roo workspace rules are prompt guidance, not command hooks. This integration
does not intercept or rewrite shell output; it gives Roo a stable project rule
to follow when it decides how to run terminal commands.
