# TODO: Codex profile real-environment acceptance

Run this acceptance after the `custom_tool_call_output` fix from upstream PR
[#212](https://github.com/vincentkoc/tokenjuice/pull/212) is available in the
installed Tokenjuice build. This checklist intentionally uses real Codex model
turns; the automated Code Mode E2E uses a fake Responses server and does not
replace this final validation.

## Local profile map

| Entry point | Expected `CODEX_HOME` | Notes |
| --- | --- | --- |
| `codex` | `/root/.codexl` | Login-shell wrapper around the standard Codex binary |
| `codexl` | `/root/.codexl` | ITFS wrapper; shares the local profile with `codex` |
| `codexd` | `/root/.codexl` | Uses the `deepseek-v4-flash-0731` profile; under Herdr it uses `/root/.codex` |
| `codexp` | `/root/.codex-profiles/personal` | Login-shell function for the personal profile |

Also retain `/root/.codex-internal` as a configured profile even though it has
no dedicated entry point in the current login shell.

## Preconditions

- Start from a fresh login shell and confirm `TOKENJUICE_NO_OMISSION` is unset.
- Confirm every entry point reports the intended Codex version.
- Run `CODEX_HOME=<profile-home> tokenjuice doctor codex` for every distinct
  profile home and require `health: ok`.
- Confirm each configured PostToolUse command uses an absolute Node path and the
  intended installed Tokenjuice executable, with no `--no-omit` argument.
- Record the Tokenjuice package provenance or tarball checksum used for the run.

## Real-session matrix

For each entry point, run one short authenticated turn that produces a safely
repeatable, compactable Bash result. Use a unique marker per entry point. Run a
second turn with Code Mode enabled and explicitly require the outer `exec` tool
to call `tools.exec_command` exactly once. Do not reuse an old session.

At minimum, cover:

- native Bash output through `codex`;
- Code Mode `custom_tool_call_output` through `codex`;
- the shared ITFS path through `codexl`;
- the DeepSeek profile through `codexd`;
- the personal home through `codexp`;
- Herdr's `/root/.codex` path when a Herdr environment is available.

If a provider cannot use Code Mode, record that as a provider capability result
and still complete its native Bash case. Do not count another profile's Code
Mode result as coverage for it.

## Evidence required per case

- The latest `tokenjuice-hook.last.json` reports `rewrote: true` and meaningful
  `rawChars` / `reducedChars` values.
- The saved session contains the compacted developer context.
- The model-visible `function_call_output` or `custom_tool_call_output` contains
  only the short Tokenjuice replacement reason, not the unique raw marker.
- A later assistant message exists, proving the turn continued after the
  PostToolUse block decision.
- For Code Mode, inspect the outer custom output itself; checking only the inner
  Bash Hook payload is insufficient.
- Capture the entry point, resolved `CODEX_HOME`, Codex version, Tokenjuice
  version/provenance, session ID, and transcript path in the acceptance report.

## Completion

Close this TODO only when every available matrix row has transcript-backed
evidence. File separate defects for provider limitations, wrapper/profile drift,
or any raw marker that remains model-visible.
