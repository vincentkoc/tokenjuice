# Kiro CLI integration

Kiro CLI support uses a native `preToolUse` hook in a workspace custom agent.
The current adapter targets the Kiro CLI 2.x custom-agent hook schema.

`tokenjuice install kiro` writes both:

- `.kiro/agents/tokenjuice.json` — a workspace agent with a native shell
  `preToolUse` guard.
- `.kiro/steering/tokenjuice.md` — always-included guidance that helps the
  model issue a wrapped command on its first attempt.

## Install

```bash
tokenjuice install kiro
tokenjuice doctor kiro
kiro-cli agent validate --path .kiro/agents/tokenjuice.json
```

When validating the current repository build instead of an installed
`tokenjuice` launcher, use:

```bash
pnpm build
node dist/cli/main.js install kiro --local
node dist/cli/main.js doctor kiro --local
```

Existing tokenjuice agent and steering files are backed up before install.
`KIRO_PROJECT_DIR` can override the workspace root for tests and scripted
installs.

## Use

Start Kiro CLI with the installed workspace agent:

```bash
kiro-cli chat --agent tokenjuice
```

The hook applies only while that custom agent is active. Kiro IDE and Web can
still consume the companion steering file, but the native CLI guard is scoped
to the `tokenjuice` custom agent.

## Behavior

1. The steering tells Kiro to route shell commands through
   `tokenjuice wrap -- <command>`.
2. The native `preToolUse` hook inspects the Kiro shell event before execution.
3. A safely wrapped command is allowed to run.
4. An unwrapped command is blocked with exit code 2. The hook returns an exact,
   shell-quoted retry command that runs the complete original command through
   `tokenjuice wrap --source kiro`.
5. Wrapper-external shell operators and command substitutions are rejected to
   prevent a suffix from bypassing compaction. Put compound commands inside the
   wrapped shell instead:

```bash
tokenjuice wrap -- sh -lc 'command-one && command-two'
```

Raw output remains available through the single escape hatch:

```bash
tokenjuice wrap --raw -- <command>
```

## Kiro hook limitation

Kiro CLI 2.x `preToolUse` hooks can allow or block a tool call, but cannot
rewrite `tool_input.command` in place. Its `postToolUse` hooks also cannot
replace the tool output returned to the model. The adapter therefore combines
first-attempt steering with a fail-closed native guard: normally the model
issues a wrapped command immediately; if it does not, Kiro blocks the command
and the model retries with the exact wrapped command from the hook error.

This is a Kiro agent guardrail, not an operating-system sandbox. Other agents,
manual terminal commands, and command-capable MCP tools are outside the built-in
`shell` hook's scope.

Kiro CLI 3 uses a different standalone `.kiro/hooks/*.json` schema. This 2.x
adapter intentionally does not emit that incompatible format.
