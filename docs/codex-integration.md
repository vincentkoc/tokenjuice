# Codex CLI integration

`tokenjuice install codex` adds a `PostToolUse` hook for Bash results to
`~/.codex/hooks.json`. Outputs that produce a worthwhile reduction are replaced
with compacted context; small, low-savings, and protected inspection results are
left unchanged.

## Expected replacement status

With the currently tested Codex CLI, a PostToolUse hook must return
`decision:"block"` to suppress the original tool result across both native Bash
calls and Bash calls nested inside Code Mode. A successful Tokenjuice
rewrite has been observed as:

```text
PostToolUse hook (blocked)
  hook context: <compacted output>
  feedback: Tokenjuice compacted this Bash output successfully. Use the compacted context provided separately.
```

Interpret this status as a successful replacement only when both the Tokenjuice
success feedback and compacted hook context are present. In that case,
`blocked` describes the hook suppressing the original result; it is not the Bash
exit status. The authenticated regression verifies that the agent can produce
a later assistant response after the replacement.

`continue:false` suppresses native `function_call_output`, but does not reject a
Code Mode tool promise. In that path, the outer `custom_tool_call_output` keeps
the full original result alongside the compacted summary. `decision:"block"`
uses Codex's shared PostToolUse replacement path and avoids that leak. Until
Codex exposes a clean "replace output" primitive, the `blocked` label is an
expected UI tradeoff for real output replacement.

Use `tokenjuice wrap --raw -- <command>` when the full command output is
required. This escape hatch reruns the command; review side effects before using
it with commands that mutate files or external systems.

For the deferred authenticated validation across local Codex profiles, follow
[the real-environment acceptance TODO](todo-codex-profile-real-environment-acceptance.md).

## Local verification

To point the real Codex home at the current checkout:

```bash
pnpm build
node dist/cli/main.js install codex --local
node dist/cli/main.js doctor codex --local
```

`doctor` should report `status: ok`. Use it first when the hook is disabled,
stale, or missing.

Run the authenticated live regression separately:

```bash
pnpm e2e:codex-live
```

The E2E builds and installs into an isolated temporary `CODEX_HOME`; it does not
require the real-home local install above. It consumes Codex quota and requires
an existing login at `$CODEX_HOME/auth.json` (or `~/.codex/auth.json`). Set
`TOKENJUICE_CODEX_LIVE_SOURCE_HOME` to select a different authenticated home.
It verifies that the compacted context and success feedback are model-visible,
a later assistant response is present, and the original marker is absent from
the compacted context and function-call output.
