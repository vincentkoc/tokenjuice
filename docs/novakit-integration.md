# NovaKit integration

NovaKit support is beta.

`tokenjuice install novakit` inserts a marker-delimited instruction block into
`NOVAKIT.md` at the current git/project root. NovaKit owns command execution and
output delivery, so tokenjuice uses project context instead of a hook.

## Install

```bash
tokenjuice install novakit
tokenjuice doctor novakit
tokenjuice uninstall novakit
```

By default tokenjuice resolves the current git root and updates
`<git-root>/NOVAKIT.md`. Set `NOVAKIT_PROJECT_DIR=/path/to/project` to target a
specific project directory during tests or scripted installs.

## Behavior

- The instruction block tells NovaKit to prefer `tokenjuice wrap -- <command>`
  for terminal commands likely to produce long output.
- The instruction block tells NovaKit to treat compacted output as
  authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `NOVAKIT.md` content is backed up before install and preserved around
  the tokenjuice block.

The managed markers are host-specific:

```markdown
<!-- tokenjuice:novakit begin -->
...
<!-- tokenjuice:novakit end -->
```

## Current beta caveat

NovaKit context files are prompt guidance, not command hooks. This integration
does not intercept or rewrite shell output; it gives NovaKit a stable project
instruction to follow when it decides how to run terminal commands.
