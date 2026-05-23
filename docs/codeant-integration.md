# CodeAnt integration

CodeAnt support is beta.

`tokenjuice install codeant` writes a CodeAnt review instruction into
`.codeant/instructions.json`.

## Install

```bash
tokenjuice install codeant
tokenjuice doctor codeant
tokenjuice uninstall codeant
```

By default tokenjuice resolves the current git root and writes
`<git-root>/.codeant/instructions.json`. Set
`CODEANT_PROJECT_DIR=/path/to/project` to target a specific project directory
during tests or scripted installs.

## Behavior

- The instruction uses the stable id `tokenjuice-terminal-output-compaction`.
- Existing CodeAnt instructions are preserved.
- Reinstall replaces only the tokenjuice instruction, with a suffixed backup for
  the JSON file.
- Uninstall removes only the tokenjuice-owned instruction and leaves user-owned
  instructions intact.
- The instruction tells CodeAnt review, Claude Code/Cursor integrations, local
  review, and fix workflows to prefer `tokenjuice wrap -- <command>` for noisy
  terminal commands.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.

## Current beta caveat

CodeAnt instructions are review guidance, not command hooks. This integration
does not run CodeAnt, change CodeAnt app settings, intercept PR comments, or
rewrite shell output; it adds a repository instruction that CodeAnt can apply
during IDE and PR review.
