# gptme integration

gptme support is beta.

`tokenjuice install gptme` inserts a marker-delimited instruction block into
`AGENTS.md` at the current git/project root. gptme discovers agent instruction
files from the home directory down to the workspace, including `AGENTS.md`,
`CLAUDE.md`, `COPILOT.md`, `GEMINI.md`, `.github/copilot-instructions.md`,
`.cursorrules`, and `.windsurfrules`.

```bash
tokenjuice install gptme
tokenjuice doctor gptme
tokenjuice uninstall gptme
```

By default tokenjuice resolves the nearest git root and writes `AGENTS.md`.
Set `GPTME_PROJECT_DIR=/path/to/repo` to target a specific repository in
scripts or tests.

The installed block tells gptme to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. gptme still owns command execution, permissions,
and prompt loading; tokenjuice does not intercept or rewrite gptme tool output.

`doctor gptme` reports `ok` when the root `AGENTS.md` block exists, contains the
`tokenjuice wrap` guidance, and does not advertise the older `--full` escape
hatch. Malformed tokenjuice markers are reported as `broken` so project memory
is not rewritten unsafely.
