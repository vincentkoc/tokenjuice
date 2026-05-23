# JetBrains AI Assistant integration

JetBrains AI Assistant support is beta.

`tokenjuice install jetbrains-ai` writes a project rule to
`.aiassistant/rules/tokenjuice.md` in the current workspace. JetBrains documents
AI Assistant project rules as Markdown files under `.aiassistant/rules` that are
used by AI Assistant chat.

```bash
tokenjuice install jetbrains-ai
tokenjuice doctor jetbrains-ai
tokenjuice uninstall jetbrains-ai
```

By default tokenjuice resolves the nearest git root and writes the project rule
there. Set `JETBRAINS_AI_PROJECT_DIR=/path/to/repo` to target a specific
repository in scripts or tests.

If the target rule file already exists, tokenjuice backs it up before replacing
it. `tokenjuice uninstall jetbrains-ai` only removes tokenjuice-managed rule
files; when a pre-tokenjuice backup exists, uninstall restores that backup.

The installed rule tells JetBrains AI Assistant to use:

```bash
tokenjuice wrap -- <command>
```

for noisy terminal commands, and to reserve:

```bash
tokenjuice wrap --raw -- <command>
```

for commands where exact output bytes are required.

This is guidance-only. JetBrains AI Assistant still owns chat behavior, command
execution, and rule loading; tokenjuice does not intercept or rewrite AI
Assistant tool output. JetBrains also owns project rule type/activation settings
inside the IDE.

`doctor jetbrains-ai` reports `ok` when the project rule exists, contains the
tokenjuice ownership marker and `tokenjuice wrap` guidance, and does not
advertise the older `--full` escape hatch.
