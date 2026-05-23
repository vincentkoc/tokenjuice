# Kilo Code integration

Kilo Code support is beta.

`tokenjuice install kilo` writes a workspace rule to
`.kilo/rules/tokenjuice.md` in the current workspace and registers that file in
the project's `kilo.jsonc` `instructions` array. If `.kilo/kilo.jsonc` already
exists, tokenjuice updates that higher-priority project config instead of the
root `kilo.jsonc`. Kilo Code loads project rules from its project config, so
this gives both the VS Code extension and CLI stable guidance for using
tokenjuice when they run terminal commands.

## Install

```bash
tokenjuice install kilo
tokenjuice doctor kilo
```

## Behavior

- The rule tells Kilo Code to prefer `tokenjuice wrap -- <command>` for noisy
  terminal commands.
- The rule tells Kilo Code to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.kilo/rules/tokenjuice.md`, `kilo.jsonc`, and `.kilo/kilo.jsonc`
  content is backed up before install when tokenjuice needs to rewrite it.
- `KILO_PROJECT_DIR` can override the workspace root for tests and scripted
  installs.

## Current beta caveat

Kilo Code workspace rules are prompt guidance, not command hooks. This
integration does not intercept or rewrite shell output; it gives Kilo Code a
stable project rule to follow when it decides how to run terminal commands.
