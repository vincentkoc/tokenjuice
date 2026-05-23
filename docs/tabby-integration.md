# Tabby integration

`tokenjuice install tabby` adds Tokenjuice guidance to Tabby's `~/.tabby/config.toml` `[answer].system_prompt`.

Tabby uses this system prompt for Answer Engine, chat, and inline chat behavior. The integration is guidance-only: Tabby still owns command execution, and Tokenjuice does not intercept tool output. The prompt tells Tabby to use `tokenjuice wrap -- <command>` for noisy terminal commands and `tokenjuice wrap --raw -- <command>` only when raw bytes are required.

The installer creates `~/.tabby/config.toml` when it is missing. If the config already has an `[answer]` table without `system_prompt`, Tokenjuice inserts its marked prompt into that table. If `[answer].system_prompt` already exists outside the Tokenjuice marker block, installation stops instead of overwriting user-owned instructions.

```bash
tokenjuice install tabby
tokenjuice doctor tabby
```

Use `TABBY_ROOT` to follow Tabby's non-default config root, or `TABBY_CONFIG_DIR` / `TABBY_HOME` to point Tokenjuice at an explicit config directory.

```bash
TABBY_ROOT=/tmp/tabby tokenjuice install tabby
TABBY_ROOT=/tmp/tabby tokenjuice doctor tabby
```

Uninstall removes only the marked Tokenjuice block:

```bash
tokenjuice uninstall tabby
```
