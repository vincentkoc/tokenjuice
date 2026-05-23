# Devin for Terminal integration

`tokenjuice install devin` installs a project-local Devin hook in
`.devin/hooks.v1.json`. Devin documents this standalone file as the
recommended project hook location and uses Claude-compatible hook events.

```bash
tokenjuice install devin
tokenjuice doctor devin
tokenjuice uninstall devin
```

The hook targets Devin's `exec` tool with `PreToolUse`. Before Devin runs a
shell command, tokenjuice rewrites the command to:

```bash
tokenjuice wrap --source devin -- <shell> -lc '<command>'
```

That keeps Devin's native execution and approval flow in place while routing
long terminal output through tokenjuice compaction. Use:

```bash
tokenjuice wrap --raw -- <command>
```

when exact output bytes are required.

Pure session setup commands are not rewritten. Commands such as `cd`,
`export`, `source .venv/bin/activate`, `nvm use`, and shell option changes
must run in Devin's existing terminal session so their state survives for the
next command.

By default tokenjuice writes to `.devin/hooks.v1.json` in the current
workspace. Set `DEVIN_PROJECT_DIR=/path/to/workspace` to target a specific
workspace from scripts. `tokenjuice install devin --local` points the hook at
the current repo build, which is useful for release verification.

`doctor devin` reports `ok` when the hook is installed, points at the expected
launcher command, and all absolute command paths exist. Stale Homebrew Cellar
paths and missing launchers are reported as repairable issues.
