# Complete verification inventory

This inventory covers every entry in the CLI installer registry. Aliases share
a row because they call the same handler. The current registry has 105 handlers
and 123 accepted names. External plugins and manual products appear separately.

The [integration catalog](integrations.md) describes setup. The
[support matrix](adapter-support-matrix.md) records detailed acceptance limits.
A native fixture qualifies only its pinned executable, configuration and
permission mode. It does not qualify another model, a desktop session, a cloud
worker, or a composed provider such as T3.

## Evidence levels

- **Native** links a real host fixture that observes follow-up model requests.
  Read that fixture and its guide for supported behavior: some hosts require
  explicit wrapping, and Codex additive context does not establish replacement.
- **Hook contract** executes an installed hook as a child process. It establishes
  the wire contract, not native host loading or final model-visible bytes.
- **File contract** covers installer, doctor and removal behavior. Native
  instruction/skill loading, command adherence or review behavior is unqualified.

All installer names also have isolated Linux CLI characterization coverage in
[host-commands.test.ts](../test/cli/host-commands.test.ts). These snapshots protect
CLI compatibility; they are not E2E evidence.

## Installer targets

| Target and aliases | Recorded evidence | Native acceptance |
| --- | --- | --- |
| [`adal`](adal-integration.md) | [File contract](../test/hosts/adal.test.ts) | Unqualified; see guide. |
| [`aether`](aether-integration.md) | [File contract](../test/hosts/aether.test.ts) | Unqualified; see guide. |
| [`aider`](aider-integration.md) | [File contract](../test/hosts/aider.test.ts) | Unqualified; see guide. |
| [`aictl`](aictl-integration.md) | [File contract](../test/hosts/aictl.test.ts) | Unqualified; see guide. |
| [`ai-memory-protocol`](ai-memory-protocol-integration.md), `aimemoryprotocol` | [File contract](../test/hosts/ai-memory-protocol.test.ts) | Unqualified; see guide. |
| [`agent-layer`](agent-layer-integration.md) | [File contract](../test/hosts/agent-layer.test.ts) | Unqualified; see guide. |
| [`agentinit`](agentinit-integration.md), `agent-init` | [File contract](../test/hosts/agentinit.test.ts) | Unqualified; see guide. |
| [`agentlink`](agentlink-integration.md) | [File contract](../test/hosts/agentlink.test.ts) | Unqualified; see guide. |
| [`agentloom`](agentloom-integration.md) | [File contract](../test/hosts/agentloom.test.ts) | Unqualified; see guide. |
| [`agents-cli`](agents-cli-integration.md) | [File contract](../test/hosts/agents-cli.test.ts) | Unqualified; see guide. |
| [`agents-md`](agents-md-integration.md), `agentsmd` | [File contract](../test/hosts/agents-md.test.ts) | Unqualified; see guide. |
| [`agentsge`](agentsge-integration.md) | [File contract](../test/hosts/agentsge.test.ts) | Unqualified; see guide. |
| [`agentsmesh`](agentsmesh-integration.md) | [File contract](../test/hosts/agentsmesh.test.ts) | Unqualified; see guide. |
| [`amazon-q`](amazon-q-integration.md) | [File contract](../test/hosts/amazon-q.test.ts) | Unqualified; see guide. |
| [`amp`](amp-integration.md) | [File contract](../test/hosts/amp.test.ts) | Unqualified; see guide. |
| [`antigravity`](antigravity-integration.md) | [File contract](../test/hosts/antigravity.test.ts) | Unqualified; see guide. |
| [`anywhere-agents`](anywhere-agents-integration.md) | [File contract](../test/hosts/anywhere-agents.test.ts) | Unqualified; see guide. |
| [`augment`](augment-integration.md) | [File contract](../test/hosts/augment.test.ts) | Unqualified; see guide. |
| [`avante`](avante-integration.md) | [File contract](../test/hosts/avante.test.ts) | Unqualified; see guide. |
| [`baz`](baz-integration.md) | [File contract](../test/hosts/baz.test.ts) | Unqualified; see guide. |
| [`bito`](bito-integration.md) | [File contract](../test/hosts/bito.test.ts) | Unqualified; see guide. |
| [`blackbox`](blackbox-integration.md) | [File contract](../test/hosts/blackbox.test.ts) | Unqualified; see guide. |
| [`blocks`](blocks-integration.md) | [File contract](../test/hosts/blocks.test.ts) | Unqualified; see guide. |
| [`clawdbot`](clawdbot-integration.md) | [File contract](../test/hosts/clawdbot.test.ts) | Unqualified; see guide. |
| [`bob`](bob-integration.md) | [File contract](../test/hosts/bob.test.ts) | Unqualified; see guide. |
| [`builder`](builder-integration.md) | [File contract](../test/hosts/builder.test.ts) | Unqualified; see guide. |
| [`charlie`](charlie-integration.md) | [File contract](../test/hosts/charlie.test.ts) | Unqualified; see guide. |
| [`codex`](codex-integration.md) | [Native fixture](../scripts/codex-e2e.mjs) | Explicit wrapping qualified; native hook lacks exit status and stays off. |
| [`claude-code`](spec.md) | [Native fixture](../scripts/claude-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`cline`](cline-integration.md) | [Native fixture](../scripts/cline-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`codeant`](codeant-integration.md) | [File contract](../test/hosts/codeant.test.ts) | Unqualified; see guide. |
| [`codebuff`](codebuff-integration.md) | [File contract](../test/hosts/codebuff.test.ts) | Unqualified; see guide. |
| [`codegen`](codegen-integration.md) | [File contract](../test/hosts/codegen.test.ts) | Unqualified; see guide. |
| [`coder-agents`](coder-agents-integration.md), `coderagents` | [File contract](../test/hosts/coder-agents.test.ts) | Unqualified; see guide. |
| [`codebuddy`](codebuddy-integration.md) | [Native fixture](../scripts/codebuddy-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`command-code`](command-code-integration.md), `commandcode` | [File contract](../test/hosts/command-code.test.ts) | Authentication blocks native tool execution; additive hook retired. |
| [`continue`](continue-integration.md) | [File contract](../test/hosts/continue.test.ts) | Unqualified; see guide. |
| [`copilot-agent`](copilot-agent-integration.md) | [Native fixture](../scripts/copilot-cli-e2e.mjs) | Local Copilot CLI repository hook only; cloud job unqualified. |
| [`crush`](crush-integration.md) | [Native fixture](../scripts/crush-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`cursor`](cursor-integration.md) | [Hook contract](../scripts/hook-contracts.mjs) | Native loading/model delivery unqualified; see guide. |
| [`deepagents`](deepagents-integration.md) | [File contract](../test/hosts/deepagents.test.ts) | Unqualified; see guide. |
| [`devin`](devin-integration.md) | [File contract](../test/hosts/devin.test.ts) | Hook lifecycle only; selected native/cloud environment unqualified. |
| [`dot-agents`](dot-agents-integration.md) | [File contract](../test/hosts/dot-agents.test.ts) | Unqualified; see guide. |
| [`docker-agent`](docker-agent-integration.md), `dockeragent`, `cagent` | [File contract](../test/hosts/docker-agent.test.ts) | Unqualified; see guide. |
| [`eca`](eca-integration.md) | [File contract](../test/hosts/eca.test.ts) | Unqualified; see guide. |
| [`elyra`](elyra-integration.md) | [File contract](../test/hosts/elyra.test.ts) | Unqualified; see guide. |
| [`firebase-studio`](firebase-studio-integration.md) | [File contract](../test/hosts/firebase-studio.test.ts) | Unqualified; see guide. |
| [`forgecode`](forgecode-integration.md), `forge-code` | [File contract](../test/hosts/forgecode.test.ts) | Unqualified; see guide. |
| [`gemini-cli`](gemini-cli-integration.md) | [Native fixture](../scripts/gemini-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`gitlab-duo`](gitlab-duo-integration.md) | [File contract](../test/hosts/gitlab-duo.test.ts) | Unqualified; see guide. |
| [`grok-cli`](grok-cli-integration.md) | [Native fixture](../scripts/grok-cli-e2e.mjs) | Explicit wrapping qualified; automatic additive hook retired. |
| [`gptme`](gptme-integration.md) | [File contract](../test/hosts/gptme.test.ts) | Unqualified; see guide. |
| [`jean2`](jean2-integration.md) | [File contract](../test/hosts/jean2.test.ts) | Unqualified; see guide. |
| [`grok-build`](grok-build-integration.md) | [File contract](../test/hosts/grok-build.test.ts) | Unqualified; see guide. |
| [`grok-bot`](grok-bot-integration.md), `grokbot` | [File contract](../test/hosts/grok-bot.test.ts) | Account sign-in required; local rule and cloud skill unqualified. |
| [`goose`](goose-integration.md) | [Native fixture](../scripts/goose-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`greptile`](greptile-integration.md) | [File contract](../test/hosts/greptile.test.ts) | Unqualified; see guide. |
| [`qodo`](qodo-integration.md) | [File contract](../test/hosts/qodo.test.ts) | Unqualified; see guide. |
| [`coderabbit`](coderabbit-integration.md) | [File contract](../test/hosts/coderabbit.test.ts) | Unqualified; see guide. |
| [`jetbrains-ai`](jetbrains-ai-integration.md) | [File contract](../test/hosts/jetbrains-ai.test.ts) | Unqualified; see guide. |
| [`junie`](junie-integration.md) | [File contract](../test/hosts/junie.test.ts) | Unqualified; see guide. |
| [`jules`](jules-integration.md) | [File contract](../test/hosts/jules.test.ts) | Unqualified; see guide. |
| [`leanctl`](leanctl-integration.md) | [File contract](../test/hosts/leanctl.test.ts) | Unqualified; see guide. |
| [`kimi`](kimi-integration.md) | [Native fixture](../scripts/kimi-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`localcode`](localcode-integration.md), `local-code` | [File contract](../test/hosts/localcode.test.ts) | Unqualified; see guide. |
| [`kiro`](kiro-integration.md) | [File contract](../test/hosts/kiro.test.ts) | Unqualified; see guide. |
| [`kilo`](kilo-integration.md) | [File contract](../test/hosts/kilo.test.ts) | Unqualified; see guide. |
| [`mcp-agent`](mcp-agent-integration.md), `mcpagent` | [File contract](../test/hosts/mcp-agent.test.ts) | Unqualified; see guide. |
| [`mistral-vibe`](mistral-vibe-integration.md), `mistralvibe` | [File contract](../test/hosts/mistral-vibe.test.ts) | Unqualified; see guide. |
| [`mini-swe-agent`](mini-swe-agent-integration.md), `mini-sweagent` | [File contract](../test/hosts/mini-swe-agent.test.ts) | Unqualified; see guide. |
| [`swe-agent`](swe-agent-integration.md), `sweagent` | [File contract](../test/hosts/swe-agent.test.ts) | Unqualified; see guide. |
| [`stagewise`](stagewise-integration.md) | [File contract](../test/hosts/stagewise.test.ts) | Unqualified; see guide. |
| [`mux`](mux-integration.md) | [Native fixture](../scripts/mux-e2e.mjs) | Explicit wrapping qualified; automatic additive hook retired. |
| [`novakit`](novakit-integration.md) | [File contract](../test/hosts/novakit.test.ts) | Unqualified; see guide. |
| [`knowns`](knowns-integration.md) | [File contract](../test/hosts/knowns.test.ts) | Unqualified; see guide. |
| [`ona`](ona-integration.md) | [File contract](../test/hosts/ona.test.ts) | Unqualified; see guide. |
| [`warp`](warp-integration.md) | [File contract](../test/hosts/warp.test.ts) | Unqualified; see guide. |
| [`openhands`](openhands-integration.md) | [File contract](../test/hosts/openhands.test.ts) | Canvas runtime unavailable; explicit wrapping remains unqualified. |
| [`open-interpreter`](open-interpreter-integration.md), `openinterpreter` | [File contract](../test/hosts/open-interpreter.test.ts) | Unqualified; see guide. |
| [`openwebui`](openwebui-integration.md) | [File contract](../test/hosts/openwebui.test.ts) | Unqualified; see guide. |
| [`plandex`](plandex-integration.md) | [File contract](../test/hosts/plandex.test.ts) | Unqualified; see guide. |
| [`ante`](ante-integration.md) | [Native fixture](../scripts/ante-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`qoder`](qoder-integration.md) | [File contract](../test/hosts/qoder.test.ts) | Unqualified; see guide. |
| [`qoder-cli`](qoder-integration.md) | [Hook contract](../scripts/hook-contracts.mjs) | Native loading/model delivery unqualified; see guide. |
| [`replit`](replit-integration.md), `replit-agent` | [File contract](../test/hosts/replit.test.ts) | Unqualified; see guide. |
| [`qwen-code`](qwen-code-integration.md) | [Native fixture](../scripts/qwen-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`qwenwork`](qwenwork-integration.md) | [File contract](../test/hosts/qwenwork.test.ts) | Unqualified; see guide. |
| [`qoderwork`](qoderwork-integration.md) | [File contract](../test/hosts/qoderwork.test.ts) | Unqualified; see guide. |
| [`pi`](spec.md) | [Native fixture](../scripts/pi-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`pi-go`](pi-go-integration.md), `pigo` | [File contract](../test/hosts/pi-go.test.ts) | Unqualified; see guide. |
| [`opencode`](spec.md) | [Native fixture](../scripts/opencode-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`opencode-v2`](opencode-v2-integration.md) | [Native fixture](../scripts/opencode-v2-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`roo`](roo-integration.md) | [File contract](../test/hosts/roo.test.ts) | Unqualified; see guide. |
| [`rovo`](rovo-integration.md), `rovo-dev` | [File contract](../test/hosts/rovo.test.ts) | Unqualified; see guide. |
| [`ruler`](ruler-integration.md) | [File contract](../test/hosts/ruler.test.ts) | Unqualified; see guide. |
| [`tabnine`](tabnine-integration.md) | [File contract](../test/hosts/tabnine.test.ts) | Unqualified; see guide. |
| [`tabby`](tabby-integration.md) | [File contract](../test/hosts/tabby.test.ts) | Unqualified; see guide. |
| [`trae`](trae-integration.md) | [File contract](../test/hosts/trae.test.ts) | Unqualified; see guide. |
| [`uipath`](uipath-integration.md) | [File contract](../test/hosts/uipath.test.ts) | Unqualified; see guide. |
| [`vscode-copilot`](vscode-copilot-integration.md) | [Hook contract](../scripts/hook-contracts.mjs) | Native loading/model delivery unqualified; see guide. |
| [`windsurf`](windsurf-integration.md) | [File contract](../test/hosts/windsurf.test.ts) | Unqualified; see guide. |
| [`copilot-cli`](copilot-cli-integration.md) | [Native fixture](../scripts/copilot-cli-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`droid`](droid-integration.md) | [Native fixture](../scripts/droid-e2e.mjs) | Pinned CLI only; see the fixture and guide. |
| [`zed`](zed-integration.md) | [File contract](../test/hosts/zed.test.ts) | Unqualified; see guide. |
| [`zencoder`](zencoder-integration.md) | [File contract](../test/hosts/zencoder.test.ts) | Unqualified; see guide. |

## Products outside the installer registry

| Product | Evidence and acceptance boundary |
| --- | --- |
| [DeepSeek Harness](deepseek-harness-integration.md) | [Native fixture](../scripts/deepseek-e2e.mjs) covers its pinned CLI/profile. The native plugin activation route is separate from `tokenjuice install`. Other versions and PTC sessions require separate acceptance. |
| [OpenClaw](spec.md) | Plugin adapter tests cover result handling. Native installation/loading and model delivery are unqualified; a package install or doctor is insufficient. |
| [T3 Code](t3-code-integration.md) | [Custom Codex fixture](../scripts/t3-codex-e2e.mjs) qualifies explicit wrapping through T3 `0.1.6` and Codex `0.166.0`. [Custom Claude fixture](../scripts/t3-claude-e2e.mjs) qualifies automatic hook loading/removal and native model-visible results with Claude Code `2.1.316`. Shadow homes, OpenCode/other providers and remote/desktop routes remain unqualified. |
| [WorkBuddy](workbuddy-integration.md) | Packaged skill metadata only; desktop import, enablement and actual model-visible tool output unqualified. |
| [Doubao Work](doubao-work-integration.md) | Packaged skill metadata only; personal importer and tool execution unqualified. |
| [AutoClaw](autoclaw-integration.md) | Copyable workflow only; custom-skill creation/loading and runtime execution unqualified. |
| [QClaw](qclaw-migration.md) | Migration guidance only; account migration does not qualify WorkBuddy. |

## Finish native acceptance

For an unqualified target, record a version, execution environment and selected
configuration before starting a disposable session. Confirm the host loads the
owned file/hook/skill, then inspect the authoritative tool result or next model
request. Exercise noisy output, an exact read, raw bypass and a failing command.
For review-only products, verify the documented review guidance instead of
inventing shell execution. Confirm removal preserves unrelated configuration.

Credentials, desktop imports, runtime availability and cloud execution are
host-specific dependencies. File tests must not substitute for these checks.
Use the [acceptance record](adapter-support-matrix.md#acceptance-record) when
adding evidence, and update this inventory when installer handlers or aliases
change. Keep safety/path/lifecycle regressions even after adding native proof.
