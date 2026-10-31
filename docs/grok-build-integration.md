# Grok Build integration

Grok Build support is beta.

`tokenjuice install grok-build` inserts a marker-delimited instruction block into
`AGENTS.md` at the current git/project root. Grok Build owns command execution
and output delivery, so tokenjuice uses project instructions instead of a hook.

## Install

```bash
tokenjuice install grok-build
tokenjuice doctor grok-build
tokenjuice uninstall grok-build
```

By default tokenjuice resolves the current git root and updates
`<git-root>/AGENTS.md`. Set `GROK_BUILD_PROJECT_DIR=/path/to/project` to target a
specific project directory during tests or scripted installs.

## Behavior

- The instruction block tells Grok Build to prefer `tokenjuice wrap -- <command>`
  for terminal commands likely to produce long output.
- The instruction block tells Grok Build to treat compacted output as
  authoritative.
- The only documented escape hatch is `tokenjuice wrap --raw -- <command>`.
- Existing `AGENTS.md` content is backed up before install and preserved around
  the tokenjuice block.

The managed markers are host-specific:

```markdown
<!-- tokenjuice:grok-build begin -->
...
<!-- tokenjuice:grok-build end -->
```

That lets Grok Build share `AGENTS.md` with other agent instruction blocks
without one install replacing another host's tokenjuice guidance.

## Current beta caveat

Grok Build instructions are prompt guidance, not command hooks. This integration
does not intercept or rewrite shell output; it gives Grok Build a stable project
instruction to follow when it decides how to run terminal commands.

## Current hook and loading boundaries

Grok Build's official hooks use `.grok/hooks/*.json` at user/project scopes.
Its passive post-tool events ignore stdout, so they do not provide a tool-result
replacement route for tokenjuice. The community Grok CLI adapter uses a different
settings/payload contract; do not install it as a Grok Build hook.
[Official hooks](https://docs.x.ai/build/features/hooks).

Grok Build loads project rules from its working directory hierarchy. Files
ignored by `.gitignore` are skipped. Keep the managed `AGENTS.md` visible to the
host and verify loaded instructions in a fresh session. Doctor validates the
file only; live command adherence remains unqualified.
[Project rule loading](https://docs.x.ai/build/features/project-rules).
