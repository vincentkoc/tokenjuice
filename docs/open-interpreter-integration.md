# Open Interpreter integration

`tokenjuice install open-interpreter` inserts a marker-delimited instruction block
into `AGENTS.md` at the current git/project root.

Open Interpreter reads project `AGENTS.md` files as team norms before sessions, so
tokenjuice uses that native guidance surface instead of trying to intercept the
terminal. This is intentionally beta and instruction-based: Open Interpreter
still owns command execution, approvals, and output delivery.

## Commands

```bash
tokenjuice install open-interpreter
tokenjuice doctor open-interpreter
tokenjuice uninstall open-interpreter
```

By default tokenjuice resolves the current git root and updates
`<git-root>/AGENTS.md`. Set `OPEN_INTERPRETER_PROJECT_DIR=/path/to/project` to
target a specific project directory during tests or scripted installs.

## Installed guidance

The managed block tells Open Interpreter to:

- use `tokenjuice wrap -- <command>` for noisy terminal commands,
- treat compacted tokenjuice output as authoritative,
- use `tokenjuice wrap --raw -- <command>` only when raw bytes are required.

The managed markers are host-specific:

```markdown
<!-- tokenjuice:open-interpreter begin -->
...
<!-- tokenjuice:open-interpreter end -->
```

That lets Open Interpreter share `AGENTS.md` with other agent instruction blocks
without one install replacing another host's tokenjuice guidance.

## Scope

`tokenjuice install open-interpreter` manages only project-local `AGENTS.md`
files inside the current git/project root. Global Open Interpreter instructions
such as `~/.openinterpreter/AGENTS.md` remain user-managed.
