# Kimi integration

Use explicit wrapping with Kimi Code CLI:

```bash
tokenjuice wrap -- find src -type f
```

Automatic Kimi compaction is retired. Kimi Code CLI 2.4.1 uses the `Bash` tool
and `~/.kimi-code/config.toml` (`KIMI_CODE_HOME` overrides the directory).
Its [`PostToolUse` hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html)
are observation-only: they cannot replace model-visible tool output. The native
fixture confirms that their stdout is ignored. The previous integration targeted
legacy `~/.kimi/config.toml` and `Shell` events and could not reduce current Kimi
model input.

`tokenjuice install kimi` now fails with an explicit-wrap recommendation without
changing configuration. Existing `kimi-post-tool-use` commands remain silent and
successful until removed. No automatic input rewrite or token saving is claimed.

## Remove an old installation

```bash
tokenjuice doctor kimi
tokenjuice uninstall kimi
```

Doctor reports a remaining tokenjuice block as retired and broken. Uninstall
removes only complete tokenjuice marker blocks, preserves other configuration,
and refuses malformed markers. Without an override, cleanup looks for marked
config in `~/.kimi-code` first, then legacy `~/.kimi`. If both contain old blocks,
run uninstall again to remove the second one.

`KIMI_CODE_HOME` takes precedence over the legacy `KIMI_SHARE_DIR` and `KIMI_HOME`
overrides. Set the relevant variable to clean a specific custom directory.

## Native validation

```bash
pnpm build
node scripts/kimi-e2e.mjs /path/to/kimi
```

CI pins `@moonshot-ai/kimi-code@2.4.1`. The fixture runs real Kimi sessions with
manual permission mode and a Bash allow rule in a disposable project. A loopback
Chat Completions endpoint supplies fixed tool calls and captures the next model
request. No user configuration, login, or real provider credential is used.

Baseline and observation-hook sessions must preserve all 80 listing entries,
exact CRLF and trailing bytes, raw bypass output, and a large failed result with
stderr and exit 7. Explicit wrapping must produce a shorter inventory. Hook
receipts prove that the real host invoked the retired handler successfully;
a separate stdout marker proves observation-hook output never enters model
context. This qualifies local provider protocol and tool delivery, rather than
remote provider availability or interactive approval flows.
