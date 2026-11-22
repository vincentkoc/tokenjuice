# Grok CLI integration

This target is the community [superagent-ai/grok-cli](https://github.com/superagent-ai/grok-cli),
separate from xAI Grok Build and Grok Bot. Use explicit wrapping:

```bash
tokenjuice wrap -- find src -type f
```

Automatic compaction is retired. The upstream
[hook output type](https://github.com/superagent-ai/grok-cli/blob/main/src/hooks/types.ts)
exposes additive context rather than tool-result replacement. Adding a shorter
summary alongside the original output does not reduce model input.

`tokenjuice install grok-cli` now fails before changing settings. Existing
`grok-cli-post-tool-use` commands return an empty JSON object until removed.
Doctor reports remaining tokenjuice hooks as retired and broken:

```bash
tokenjuice doctor grok-cli
tokenjuice uninstall grok-cli
```

Uninstall removes tokenjuice post-tool commands from `~/.grok/user-settings.json`
and preserves unrelated settings and hooks, including mixed hook groups.

## Native acceptance and version boundary

The published `grok-dev@1.1.7` npm archive contains a macOS arm64 standalone
executable at `dist/grok-standalone` that reports version **1.1.4**. That executable
does not load `PostToolUse` hooks. The fixture verifies settings discovery using
a fixture-only key in user settings, then confirms a configured hook never runs.
These results do not qualify the package's separate JavaScript entrypoint or
other platforms. CI records the actual standalone runtime version.

```bash
pnpm build
node scripts/grok-cli-e2e.mjs /path/to/grok-standalone
```

The native fixture runs baseline and configured-hook sessions in a disposable
home and project. A loopback Chat Completions endpoint supplies fixed bash calls
and captures the next model request. It checks all 80 listing entries, the
host's trimmed exact-read result, explicit wrapping, raw bypass, and complete
failed output with stderr and the native failure flag. The command exits 7,
but this host omits numeric exit status from its model-facing result. The
fixture preserves that native result without claiming exact status delivery.

Explicit wrapping must shorten the listing. Installing the retired integration
must fail without changing the real host settings. No real provider credentials
or user configuration are used. Remote availability, interactive permissions,
and microVM sandbox execution remain outside this fixture.
