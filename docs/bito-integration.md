# Bito integration

Bito support is beta.

`tokenjuice install bito` writes a Bito custom guidelines file at
`.bito/tokenjuice.md` and inserts a marker-delimited `custom_guidelines`
reference into `.bito.yaml`.

## Install

```bash
tokenjuice install bito
tokenjuice doctor bito
tokenjuice uninstall bito
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.bito.yaml` plus `<git-root>/.bito/tokenjuice.md`. Set
`BITO_PROJECT_DIR=/path/to/project` to target a specific project directory
during tests or scripted installs.

## Behavior

- The `.bito.yaml` block is wrapped in `# tokenjuice:bito begin` and
  `# tokenjuice:bito end` comments.
- Existing Bito config without `custom_guidelines` is preserved. Adding
  repository custom guidelines can replace Bito agent-level guidelines for that
  repository, so install is intentionally conservative.
- Install refuses user-owned `custom_guidelines` instead of duplicating that
  root key or consuming one of Bito's guideline slots unexpectedly.
- Reinstall replaces only the tokenjuice config block and guideline file, with
  suffixed backups for both files.
- The guideline tells Bito review, chat, and tool workflows to prefer
  `tokenjuice wrap -- <command>` for noisy terminal commands.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.

## Current beta caveat

Bito custom guidelines are review guidance, not command hooks. This integration
does not change Bito app settings, intercept PR comments, or rewrite shell
output; it adds a repository guideline file that Bito can apply during review.
