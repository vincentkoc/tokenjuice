# aictl integration

aictl support is beta.

`tokenjuice install aictl` inserts a marker-delimited instruction block into
`AICTL.md` in the current working directory. aictl loads `AICTL.md` from the
working directory as a project prompt and appends it to the system prompt, so
tokenjuice uses prompt guidance instead of a hook.

## Install

```bash
tokenjuice install aictl
tokenjuice doctor aictl
tokenjuice uninstall aictl
```

By default tokenjuice updates `<current-working-directory>/AICTL.md`, matching
aictl's prompt lookup. If `AICTL_PROMPT_FILE` is set, tokenjuice uses that
project-local filename instead. Set `AICTL_PROJECT_DIR=/path/to/project` to
target a specific project directory during tests or scripted installs.

## Behavior

- The instruction block tells aictl to prefer `tokenjuice wrap -- <command>` for
  `exec_shell` commands likely to produce long output.
- The instruction block tells aictl to treat compacted output as authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `AICTL.md` content is backed up before install and preserved around
  the tokenjuice block.

The managed markers are host-specific:

```markdown
<!-- tokenjuice:aictl begin -->
...
<!-- tokenjuice:aictl end -->
```

## Current beta caveat

AICTL.md is prompt guidance, not a command hook. aictl also has plugin and hook
surfaces, but this integration does not install those or rewrite shell output;
it gives aictl a stable project prompt for deciding when to invoke tokenjuice
around noisy terminal commands.
