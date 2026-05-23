# Firebase Studio integration

`tokenjuice install firebase-studio` inserts a marker-delimited AI rules block
into `.idx/airules.md` at the current git/project root. Firebase documents this
as the rules file Gemini in Firebase chat prioritizes inside a Firebase Studio
workspace.

```bash
tokenjuice install firebase-studio
tokenjuice doctor firebase-studio
tokenjuice uninstall firebase-studio
```

By default tokenjuice resolves the nearest git root and writes
`.idx/airules.md`. Set `FIREBASE_STUDIO_PROJECT_DIR=/path/to/workspace` to
target a specific workspace in scripts or tests.

The installed block tells Gemini in Firebase to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. Firebase Studio still owns command execution and
approval; tokenjuice does not intercept or rewrite Gemini in Firebase tool
output.

`doctor firebase-studio` reports `ok` when `.idx/airules.md` contains the
tokenjuice block, includes `tokenjuice wrap` guidance, and does not advertise
the older `--full` escape hatch. Malformed tokenjuice markers are reported as
`broken` so workspace rules are not rewritten unsafely.
