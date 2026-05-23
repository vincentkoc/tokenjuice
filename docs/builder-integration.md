# Builder integration

Builder support is beta.

`tokenjuice install builder` writes an always-applied Builder Projects rule file to
`.builder/rules/tokenjuice.mdc` in the current workspace. Builder documents
`.builder/rules/*.mdc` files as scoped AI instruction files with metadata that
Builder processes during code generation.

## Install

```bash
tokenjuice install builder
tokenjuice doctor builder
tokenjuice uninstall builder
```

## Behavior

- The rule tells Builder Projects and Fusion to prefer `tokenjuice wrap -- <command>` for
  noisy terminal commands.
- The rule includes Builder `.mdc` metadata with `alwaysApply: true`.
- The rule includes a tokenjuice ownership marker so uninstall does not remove
  unrelated Builder rules.
- The rule tells Builder to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.builder/rules/tokenjuice.mdc` content is backed up before install
  and restored on uninstall when it is not tokenjuice-managed.
- `BUILDER_PROJECT_DIR` can override the workspace root for tests and scripted
  installs.

## Current beta caveat

Builder configuration files are prompt guidance, not command hooks. This
integration does not intercept or rewrite shell output; it gives Builder a
stable project rule to follow when it decides how to run terminal commands.
