# Magpie agent coverage

This audit covers the 38 agents in the supplied [Magpie website](https://usemagpie.ai/)
list, checked on 2026-11-14 against tokenjuice
`2157b4360af27b4e70ad98e51608cd40d10ad266`. The upstream
[Magpie repository](https://github.com/yetone/magpie) has a larger, changing list.
Magpie configures model providers; that does not establish that an agent can
rewrite a command or replace a tool result.

At this baseline, 17 agents have a tokenjuice route and 21 have no dedicated
integration. Existing coverage includes guidance and explicit wrapping; it does
not mean automatic compaction or native session acceptance. See the
[support matrix](adapter-support-matrix.md) for the evidence behind existing
routes. Proposed routes below are implementation candidates, not installed or
verified support.

## Existing routes

| Agent | Baseline route | Native gap or limit |
| --- | --- | --- |
| [Claude Code](spec.md) | Pre-tool wrapping | Native fixture qualifies its pinned CLI. |
| [Codex](codex-integration.md) | Explicit wrapping | Hook payload lacks structured shell exit status; automatic compaction stays off. |
| [Gemini CLI](gemini-cli-integration.md) | Pre-tool wrapping | Native fixture qualifies its pinned CLI. |
| [OpenCode](opencode-v2-integration.md) | Separate V1 and V2 result plugins | Major versions have different loaders and tool schemas. |
| Pi | Native result extension | See the [support matrix](adapter-support-matrix.md) for the pinned native fixture. |
| [Goose](goose-integration.md) | Instruction guidance | Native post-hooks observe calls; they do not replace results. |
| [Cursor CLI](cursor-integration.md) | Pre-tool wrapping | Installed-hook contracts; native model-request acceptance remains unqualified. |
| [Copilot CLI](copilot-cli-integration.md) | Result replacement | Pinned native fixture; preserve completion and failure metadata. |
| [VS Code](vscode-copilot-integration.md) | Legacy Local Copilot pre-tool wrapping | Newer harness and native session acceptance remain unqualified. |
| [Crush](crush-integration.md) | Native skill guidance | New result-replacement hook lacks structured Bash exit/completion metadata. |
| [DeepSeek Harness](deepseek-harness-integration.md) | Native Cordis plugin | PTC canonical values are separate; explicit wrapping there. |
| [Command Code](command-code-integration.md) | Explicit wrapping | Legacy additive hook retired; native ModApi lacks structured shell exit/completion status. |
| [Devin](devin-integration.md) | Pre-tool wrapping | Native session acceptance remains unqualified. |
| [Hermes Agent](framework-integrations.md#hermes) | Native output-transform plugin | Existing source/bundle lifecycle and native fixture; no duplicate adapter needed. |
| [Kimi Code](kimi-integration.md) | Explicit wrapping | External hooks cannot rewrite input or replace results. |
| [Droid](droid-integration.md) | Pre-tool wrapping | Pinned native fixture; host autonomy rules still apply. |
| [Grok Build](grok-build-integration.md) | Project instructions | Passive hook stdout cannot replace a tool result. |

## Missing integrations

Native skill discovery provides guidance, not an automatic tool hook. A file
contract test cannot establish that the agent loads a skill or follows it.
Keep native acceptance unqualified until a real host session verifies loading,
compaction, exact reads, raw bypass, failures and removal.

| Agent and primary source | Proposed route | Contract to preserve |
| --- | --- | --- |
| [MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code) | Native file hook | Mutable `tool.execute.after`; require explicit successful Bash status and no unresolved truncation. Its loader differs from OpenCode. |
| [DevEco Code](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/ide-deveco-code-common-configure/) | Native skill guidance | Documented `.deveco/skills` discovery. OpenCode ancestry does not qualify its changed Bash/result contract. |
| [fx](https://github.com/vercel-labs/fx) | Instruction or skill guidance | Internal hooks are not a documented CLI user-hook loader; SDK observer hooks do not establish replacement. |
| [omp](https://github.com/can1357/oh-my-pi/blob/main/docs/extension-loading.md) | Native extension | Use omp's own loader and event schema; preserve failure flags and structured details. |
| [OmO](https://github.com/code-yeongyu/oh-my-openagent) | Native Senpi extension | Resolve OmO's agent directory; a content replacement must not leave stale `structuredContent`. |
| [Mister Morph](https://github.com/quailyquaily/mistermorph/blob/main/docs/skills.md) | Native skill guidance | Resolve `file_state_dir/skills`; shell enablement and explicit skill activation remain host-owned. |
| [Muse Code](https://dev.meta.ai/docs/muse-code/extending) | Native skill guidance | Published hook docs do not establish a result-replacement wire contract. |
| [Empryo](https://github.com/proxysoul/Empryo) | SoulForge pre-tool wrapping | Current engine consumes `PreToolUse.updatedInput`; use current SoulForge config paths, not an old provider-config location. |
| [nanobot](https://github.com/HKUDS/nanobot/blob/main/nanobot/agent/skills.py) | Workspace skill | `after_execute_tool` return values are ignored; Python hooks require application registration. |
| [miniQ](https://github.com/LeadingThink/miniQ/blob/main/crates/miniq-skills/src/store.rs) | Workspace/user skill | Existing pre-hooks can block and post-hooks append feedback; neither establishes replacement. |
| [Paimon](https://github.com/aisk/paimon#skills) | Native skill guidance | Use its documented skill roots; a custom Python toolset is a different integration contract. |
| [MiniMax Code](https://github.com/MiniMax-AI/minimax-code) | Native plugin with pre-tool wrapping | Verify parser behavior, not only interface declarations; native and Claude hook formats differ. |
| [Craft Agents](https://thecraftagents.com/docs/skills/overview/) | Explicit-workspace skill | Select the workspace; its isolated Pi backend does not load arbitrary global Pi extensions. |
| [Tuanjie Cowork / Codely](https://codely-docs.tuanjie.cn/en/features-introduction/Hooks/) | Codely pre-tool wrapping | Use `BeforeTool` and its CLI settings; Cowork desktop discovery requires separate acceptance. |
| [ZCode](https://zcode.z.ai/en/docs/hooks) | Native pre-tool wrapping | Return full `updatedInput`; preserve all Bash fields and downstream permission checks. |
| [OpenHanako](https://github.com/liliMozi/openhanako/blob/main/PLUGIN_SDK.md) | Native full-access extension plugin | Main shell is `exec_command`; compact only completed non-TTY successes and preserve `details.execCommand`. |
| [AtomCode](https://atomcode.atomgit.com/docs/en/plugins.html) | Documented guidance or skill | Plugin compatibility does not prove the unverified pre-tool stdout schema; plugin trust remains user-owned. |
| [Snow CLI](https://github.com/MayDay-wpf/snow-cli/blob/main/docs/usage/en/07.Hooks%20Configuration.md) | Native result hook | `afterToolCall` exit 1 replaces content; preserve the serialized terminal result, stderr and exit status. |
| [QwenPaw](https://github.com/agentscope-ai/QwenPaw/blob/main/website/public/docs/skills.en.md) | Explicit-workspace skill | Dispatch/response message hooks are not per-tool hooks; legacy middleware needs separate native proof. |
| [Alma](https://alma.now/docs/plugins/hooks-events) | Native pre-tool plugin | Compose `output.args ?? input.args`, rewrite only known Bash commands and dispose subscriptions. |
| [Shelley](https://github.com/boldsoftware/shelley/blob/main/skills/skills.go) | Native skill guidance | User skill root has no extra `skills/` component; published hooks lack a tool-result transform. |

## Upstream native gaps

| Host | Required upstream change | Submission boundary |
| --- | --- | --- |
| [Codex](https://github.com/openai/codex/issues/24175) | Expose structured shell exit/completion metadata to `PostToolUse` without changing existing string responses. | Existing issue; inspect current contribution rules before a narrow PR. |
| [Crush](https://github.com/charmbracelet/crush/blob/main/internal/agent/hooked_tool.go) | Forward structured Bash exit/completion metadata to result hooks. Nonzero exits can currently return ordinary text responses. | Preserve event/error semantics; do not infer shell success from the event name. |
| [Kimi Code](https://github.com/MoonshotAI/kimi-code/issues/345) | Bridge external `PreToolUse.updatedInput` into the existing input-rewrite engine. | [Contribution policy](https://github.com/MoonshotAI/kimi-code/blob/main/CONTRIBUTING.md) requires a maintainer invitation for external features; no invitation was present in the issue at audit time. |
| [Command Code](https://commandcode.ai/docs/mods) | Expose structured exit/completion/abort status to `afterToolCall` mods. In published `1.89.1`, failed, timed-out and aborted shell commands can return non-error text results. | Runtime source is not public; the public registry cannot implement this API change. Keep explicit wrapping until the native contract supplies trustworthy status. |

Do not remove working guidance because automatic replacement is unavailable.
Do not advertise an unverified API, use provider configuration as hook evidence,
or infer shared integration support from a fork's ancestry.
