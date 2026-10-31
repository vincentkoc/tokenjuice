# Droid integration

`tokenjuice install droid` installs a `PreToolUse` hook for Factory's `Execute`
tool. It rewrites the command to run through `tokenjuice wrap`, so the tool
returns compacted terminal output. Other tool input fields and Droid's permission
decisions are preserved. Linux, macOS and WSL use a POSIX shell; native Windows
wrapping is not supported.

```bash
tokenjuice install droid
tokenjuice doctor droid
tokenjuice uninstall droid
```

Reinstall to migrate an older tokenjuice `PostToolUse` hook. Migration removes
only tokenjuice entries, including entries inside shared matcher groups.
The old runtime entrypoint remains available for existing installations.
Factory's `additionalContext` adds context beside the original tool result;
`suppressOutput` hides hook output in the UI. Neither replaces terminal output.

The wrapper uses `TOKENJUICE_DROID_SHELL`, then `SHELL`, then `bash` or `sh`.
Commands already using `tokenjuice wrap` are left alone, including the explicit
escape hatch `tokenjuice wrap --raw -- <command>`.

Install, doctor and uninstall select an existing `~/.factory/hooks.json`, then
the legacy `~/.factory/hooks/hooks.json`, otherwise the `hooks` key in
`~/.factory/settings.json`. Standalone files use an event map without an outer
`hooks` key. `FACTORY_HOME` overrides `~/.factory`.

Only the selected file is changed. A hook in a shadowed settings file is not
reported as active. If you later remove a standalone file, inspect the fallback
settings for older hooks. Restart Droid or review external changes in `/hooks`
before relying on the updated configuration.

Contract: [Factory hooks](https://docs.factory.com/harness/hooks).
