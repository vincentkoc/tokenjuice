# AgentInit integration

AgentInit support is beta.

`tokenjuice install agentinit` inserts a marker-delimited block into
`AGENTS.md` in the current workspace. AgentInit treats `AGENTS.md` as the source
of truth for generated provider files, so this keeps tokenjuice guidance in the
canonical source before AgentInit syncs downstream files.

## commands

```bash
tokenjuice install agentinit
tokenjuice doctor agentinit
tokenjuice uninstall agentinit
```

## behavior

- The source instructions keep command execution unchanged.
- They tell synced AI coding tool configs to use `tokenjuice wrap -- <command>` for noisy terminal commands.
- `tokenjuice wrap --raw -- <command>` remains the escape hatch when exact bytes are required.
- The block intentionally does not suggest `tokenjuice wrap --full`.
- Existing `AGENTS.md` content is backed up before install.
- Reinstalling a current tokenjuice block is idempotent and does not create a backup.
- Uninstall removes only the tokenjuice marker-delimited block and leaves other `AGENTS.md` content intact.

## sync

After installing or updating the block, run:

```bash
agentinit sync
```

Set `AGENTINIT_PROJECT_DIR` to install or inspect the source instructions for
another workspace.
