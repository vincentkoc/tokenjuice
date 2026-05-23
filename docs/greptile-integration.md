# Greptile integration

Greptile support is beta.

`tokenjuice install greptile` inserts a marker-delimited reviewer rule block into
`.greptile/rules.md` at the current git/project root. Greptile treats
`.greptile/rules.md` as plain Markdown review context scoped to the directory
containing the `.greptile/` folder, so tokenjuice uses that native rules surface
instead of editing `greptile.json`.

## Install

```bash
tokenjuice install greptile
tokenjuice doctor greptile
tokenjuice uninstall greptile
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.greptile/rules.md`. Set
`GREPTILE_PROJECT_DIR=/path/to/project` to target a specific project directory
during tests or scripted installs.

## Behavior

- The tokenjuice block is wrapped in `<!-- tokenjuice:greptile begin -->` and
  `<!-- tokenjuice:greptile end -->` comments.
- Existing Greptile rules in `.greptile/rules.md` are preserved.
- Reinstall replaces only the tokenjuice block and keeps suffixed backups.
- The rule tells Greptile to prefer `tokenjuice wrap -- <command>` when review,
  runtime-inspection, or fix workflows run noisy terminal commands.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.

## Current beta caveat

Greptile rules are review guidance, not command hooks. This integration does not
change Greptile app settings, intercept PR comments, or rewrite shell output; it
adds scoped reviewer guidance for when Greptile workflows invoke terminal
commands.
