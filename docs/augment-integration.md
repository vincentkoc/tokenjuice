# Augment integration

Augment support is beta.

`tokenjuice install augment` writes an always-applied workspace rule to
`.augment/rules/tokenjuice.md` in the current git/project root. Auggie and the
Augment IDE extensions load workspace rules from `.augment/rules/*.md`, and
`type: always_apply` rules are included in every prompt.

## Install

```bash
tokenjuice install augment
tokenjuice doctor augment
```

## Behavior

- The rule tells Augment and Auggie to prefer `tokenjuice wrap -- <command>` for
  noisy terminal commands.
- The rule tells Augment to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.augment/rules/tokenjuice.md` content is backed up before install.
- `AUGMENT_PROJECT_DIR` can override the project root for tests and scripted
  installs.

## Current beta caveat

Augment workspace rules are prompt guidance, not command hooks. This integration
does not intercept or rewrite shell output; it gives Augment a stable project
rule to follow when it decides how to run terminal commands.
