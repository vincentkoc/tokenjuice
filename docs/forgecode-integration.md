# ForgeCode integration

ForgeCode support is beta.

`tokenjuice install forgecode` inserts a marker-delimited instruction block into
`AGENTS.md` at the current git/project root. ForgeCode owns command execution
and output delivery, so tokenjuice uses project instructions instead of a hook.

## Install

```bash
tokenjuice install forgecode
tokenjuice doctor forgecode
tokenjuice uninstall forgecode
```

By default tokenjuice resolves the current git root and updates
`<git-root>/AGENTS.md`. Set `FORGECODE_PROJECT_DIR=/path/to/project` to target a
specific project directory during tests or scripted installs.

## Behavior

- The instruction block tells ForgeCode to prefer `tokenjuice wrap -- <command>`
  for terminal commands likely to produce long output.
- The instruction block tells ForgeCode to treat compacted output as
  authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `AGENTS.md` content is backed up before install and preserved around
  the tokenjuice block.

The managed markers are host-specific:

```markdown
<!-- tokenjuice:forgecode begin -->
...
<!-- tokenjuice:forgecode end -->
```

That lets ForgeCode share `AGENTS.md` with other agent instruction blocks without
one install replacing another host's tokenjuice guidance.

## Current beta caveat

ForgeCode AGENTS.md rules are prompt guidance, not command hooks. This
integration does not intercept or rewrite shell output; it gives ForgeCode a
stable project instruction to follow when it decides how to run terminal
commands.
