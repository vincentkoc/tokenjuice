# cursor integration design

## why cursor uses pre-tool-use wrapping

tokenjuice supports hosts with different hook capabilities.

- codex / claude-code / pi integrations compact output after tool execution.
- cursor integration compacts by rewriting shell input before execution.

for cursor, tokenjuice installs a `preToolUse` shell hook and rewrites:

```text
<original shell command>
```

to:

```text
tokenjuice wrap -- <host-shell> -lc '<original shell command>'
```

this is deliberate:

- `wrap` makes compacted output the actual shell result returned to the agent.
- host-shell `-lc` preserves shell semantics for complex command strings (quotes, pipes, redirects, `&&`, variables, etc.).
- tokenjuice resolves host shell in this order: `tool_input.shell`, `TOKENJUICE_CURSOR_SHELL`, `SHELL`, then `sh`.
- if no usable shell is found, tokenjuice leaves the command unchanged (no pre-tool rewrite).

## tradeoff and mitigation

wrapping with `<host-shell> -lc` means raw command shape becomes launcher-like (`<shell>`, `-lc`, `<cmd>`), which can reduce reducer matching quality if classification only sees outer argv.

tokenjuice mitigates this by normalizing wrapped input before classification:

- unwrap `bash|sh|zsh|fish -c/-lc '<cmd>'` to the nested command
- classify against the nested command/argv
- keep compound command safety behavior unchanged

this preserves reducer quality for cursor while keeping command execution semantics stable.

## launcher behavior

cursor hooks store a `--wrap-launcher` value. when that launcher points to a `.js` entrypoint, tokenjuice executes it via node:

```text
node <launcher>.js wrap -- ...
```

this avoids linux/mac permission issues from trying to execute a `.js` file directly.

## trace and diagnostics

for debugging classifier decisions, use `--trace` with json output:

```bash
node dist/cli/main.js wrap --format json --trace -- "$SHELL" -lc "git status --short"
```

inspect:

- `result.trace.normalizedCommand`
- `result.trace.normalizedArgv`
- `result.trace.matchedReducer`
- `result.trace.family`

## expected verification flow

```bash
pnpm build
node dist/cli/main.js install cursor
node dist/cli/main.js doctor cursor
node dist/cli/main.js wrap --format json --trace -- "$SHELL" -lc "git status --short"
node dist/cli/main.js wrap --format json --trace -- pnpm --help
node dist/cli/main.js wrap --format json --trace --raw -- pnpm --help
```

expected:

- `doctor cursor` reports `health: ok`
- wrapped shell commands show nested normalized command/argv in trace
- `--raw` keeps `ratio = 1`
- non-raw wraps usually produce `ratio < 1`

## platform boundary

- supported: linux/macos, and cursor inside wsl
- not supported yet: native windows shell interception (`process.platform === "win32"`)

on native windows, the cursor pre-tool hook intentionally returns a deny response with a message that asks users to run cursor in wsl.
