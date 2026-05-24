# LeanCTL integration

LeanCTL support is beta.

`tokenjuice install leanctl` writes `.leanctl/instructions.md` at the current
git/project root. LeanCTL owns command execution and output delivery, so
tokenjuice uses project instructions instead of a hook.

## Install

```bash
tokenjuice install leanctl
tokenjuice doctor leanctl
tokenjuice uninstall leanctl
```

By default tokenjuice resolves the current git root and updates
`<git-root>/.leanctl/instructions.md`. Set
`LEANCTL_PROJECT_DIR=/path/to/project` to target a specific project directory
during tests or scripted installs.

## Behavior

- The instruction file tells LeanCTL to prefer `tokenjuice wrap -- <command>`
  for terminal commands likely to produce long output.
- The instruction file tells LeanCTL to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `.leanctl/instructions.md` content is backed up before install.

## Current beta caveat

LeanCTL project instructions are prompt guidance, not command hooks. This
integration does not intercept or rewrite shell output; it gives LeanCTL a
stable project instruction to follow when it decides how to run terminal
commands.
