# Token Glace integration catalog

Token Glace is a fork of [vincentkoc/tokenjuice](https://github.com/vincentkoc/tokenjuice). The `token-glace` and `tokenjuice` launchers shipped by this fork run the same CLI. Claude Code uses [PostToolUse result replacement by default](claude-code-integration.md).

The [harness and framework catalog](#harness-and-framework-catalog) below lists every client in one table, with setup commands, configuration locations, and integration modes.
It includes CLI and editor harnesses, desktop clients, guidance formats, external plugins, and framework adapters.

Each table entry links to its setup guide. For more detail, use:

- [Documentation index](README.md) — all integration guides and reference pages.
- [Framework integrations](framework-integrations.md) — Hermes, Copilot SDK, LangChain, Mastra, and FastMCP setup.
- [Adapter support and verification](adapter-support-matrix.md) — native test versions and remaining acceptance work.
- [Complete verification inventory](verification-inventory.md) — every installer target and alias, with its evidence level.

Guidance files ask an agent to call `tokenjuice wrap`; they do not compact every command automatically.
Manual imports need host-side setup. Retired additive hooks remain explicit-wrapping routes, and a passing doctor check does not prove that a host loaded an integration.

## Harness and framework catalog

| Logo | Harness / client / framework | Integration | Setup | Configuration / limits |
| --- | --- | --- | --- | --- |
| <img width="48" height="48" src="logos/adal.png" alt="AdaL CLI" /> | [AdaL CLI](adal-integration.md) | Guidance | `tokenjuice install adal` | `AGENTS.md` |
| <img width="48" height="48" src="logos/aether.png" alt="Aether" /> | [Aether](aether-integration.md) | Guidance | `tokenjuice install aether` | `.aether/tokenjuice.md` / `.aether/settings.json` |
| <img width="48" height="48" src="logos/agent-layer.png" alt="Agent Layer" /> | [Agent Layer](agent-layer-integration.md) | Guidance | `tokenjuice install agent-layer` | `.agent-layer/instructions/tokenjuice.md`; run `al sync` after install or uninstall |
| — | [AgentInit](agentinit-integration.md) | Guidance | `tokenjuice install agentinit` | `AGENTS.md`; run `agentinit sync` after install or uninstall |
| <img width="48" height="48" src="logos/agentlink.png" alt="Agentlink" /> | [Agentlink](agentlink-integration.md) | Guidance | `tokenjuice install agentlink` | `AGENTS.md`; run `agentlink sync` after install or uninstall |
| <img width="48" height="48" src="logos/agentloom.png" alt="Agentloom" /> | [Agentloom](agentloom-integration.md) | Guidance | `tokenjuice install agentloom` | `.agents/rules/tokenjuice-agentloom.md`; run `agentloom sync` after install or uninstall |
| <img width="48" height="48" src="logos/agents-cli.png" alt="agents-cli" /> | [agents-cli](agents-cli-integration.md) | Guidance | `tokenjuice install agents-cli` | `~/.agents/memory/AGENTS.md`; run `agents sync` after install or uninstall |
| <img width="48" height="48" src="logos/agentsge.png" alt="agents.ge" /> | [agents.ge](agentsge-integration.md) | Guidance | `tokenjuice install agentsge` | `.agents/rules/tokenjuice-agentsge.md` |
| <img width="48" height="48" src="logos/agents-md.png" alt="AGENTS.md" /> | [AGENTS.md](agents-md-integration.md) | Guidance | `tokenjuice install agents-md` | `AGENTS.md` |
| <img width="48" height="48" src="logos/agentsmesh.png" alt="AgentsMesh" /> | [AgentsMesh](agentsmesh-integration.md) | Guidance | `tokenjuice install agentsmesh` | `.agentsmesh/rules/tokenjuice.md`; run `agentsmesh generate` after install or uninstall |
| — | [AI Memory Protocol](ai-memory-protocol-integration.md) | Guidance | `tokenjuice install ai-memory-protocol` | `.memories/memory/preferences.rst` |
| <img width="48" height="48" src="logos/aictl.png" alt="aictl" /> | [aictl](aictl-integration.md) | Guidance | `tokenjuice install aictl` | `AICTL.md` |
| <img width="48" height="48" src="logos/aider.png" alt="Aider" /> | [Aider](aider-integration.md) | Guidance | `tokenjuice install aider` | `CONVENTIONS.tokenjuice.md` |
| <img width="48" height="48" src="logos/amazon-q.png" alt="Amazon Q Developer CLI / Kiro compatibility" /> | [Amazon Q Developer CLI / Kiro compatibility](amazon-q-integration.md) | Guidance | `tokenjuice install amazon-q` | `.amazonq/rules/tokenjuice.md` |
| <img width="48" height="48" src="logos/amp.png" alt="Amp" /> | [Amp](amp-integration.md) | Guidance | `tokenjuice install amp` | `AGENTS.md` / `AGENT.md` / `CLAUDE.md` |
| <img width="48" height="48" src="logos/ante.png" alt="Antigma Ante" /> | [Antigma Ante](ante-integration.md) | Guidance | `tokenjuice install ante` | project `AGENTS.md` or `CLAUDE.md` |
| <img width="48" height="48" src="logos/anywhere-agents.png" alt="anywhere-agents" /> | [anywhere-agents](anywhere-agents-integration.md) | Guidance | `tokenjuice install anywhere-agents` | `AGENTS.local.md`; run `anywhere-agents` after install or uninstall |
| <img width="48" height="48" src="logos/augment.png" alt="Augment" /> | [Augment](augment-integration.md) | Guidance | `tokenjuice install augment` | `.augment/rules/tokenjuice.md` |
| <img width="48" height="48" src="logos/autoclaw.png" alt="AutoClaw" /> | [AutoClaw](autoclaw-integration.md) | Manual skill setup | Create a custom skill using the [workflow](../packaging/skills/autoclaw/tokenjuice-instructions.md) | Select the skill in a fresh conversation; execution unqualified |
| <img width="48" height="48" src="logos/avante.png" alt="Avante.nvim" /> | [Avante.nvim](avante-integration.md) | Guidance | `tokenjuice install avante` | `avante.md` |
| <img width="48" height="48" src="logos/baz.png" alt="Baz" /> | [Baz](baz-integration.md) | Guidance | `tokenjuice install baz` | `.baz/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/bito.png" alt="Bito" /> | [Bito](bito-integration.md) | Guidance | `tokenjuice install bito` | `.bito.yaml` / `.bito/tokenjuice.md` |
| <img width="48" height="48" src="logos/blackbox.png" alt="Blackbox CLI" /> | [Blackbox CLI](blackbox-integration.md) | Guidance | `tokenjuice install blackbox` | `.blackbox/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/blocks.png" alt="Blocks" /> | [Blocks](blocks-integration.md) | Guidance | `tokenjuice install blocks` | `.agents/skills/tokenjuice-blocks/SKILL.md` |
| <img width="48" height="48" src="logos/builder.png" alt="Builder" /> | [Builder](builder-integration.md) | Guidance | `tokenjuice install builder` | `.builder/rules/tokenjuice.mdc` |
| <img width="48" height="48" src="logos/charlie.png" alt="Charlie" /> | [Charlie](charlie-integration.md) | Guidance | `tokenjuice install charlie` | `AGENTS.md` |
| <img width="48" height="48" src="logos/claude-code.png" alt="Claude Code" /> | [Claude Code](claude-code-integration.md) | Result replacement by default, opt-in pre-tool wrapping | `tokenjuice install claude-code` | `$CLAUDE_CONFIG_DIR/settings.json` or `~/.claude/settings.json` |
| <img width="48" height="48" src="logos/clawdbot.png" alt="Clawdbot" /> | [Clawdbot](clawdbot-integration.md) | Guidance | `tokenjuice install clawdbot` | `skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/cline.png" alt="Cline" /> | [Cline](cline-integration.md) | Pre-tool wrapping | `tokenjuice install cline` | `~/.cline/hooks/PreToolUse`; native CLI 3.0.74 input wrapping |
| <img width="48" height="48" src="logos/codeant.png" alt="CodeAnt" /> | [CodeAnt](codeant-integration.md) | Guidance | `tokenjuice install codeant` | `.codeant/instructions.json` |
| <img width="48" height="48" src="logos/codebuddy.png" alt="CodeBuddy" /> | [CodeBuddy](codebuddy-integration.md) | Pre-tool wrapping | `tokenjuice install codebuddy` | `~/.codebuddy/settings.json` |
| <img width="48" height="48" src="logos/codebuff.png" alt="Codebuff" /> | [Codebuff](codebuff-integration.md) | Guidance | `tokenjuice install codebuff` | `AGENTS.md` |
| <img width="48" height="48" src="logos/codegen.png" alt="Codegen" /> | [Codegen](codegen-integration.md) | Guidance | `tokenjuice install codegen` | `AGENTS.md` |
| <img width="48" height="48" src="logos/coder-agents.png" alt="Coder Agents" /> | [Coder Agents](coder-agents-integration.md) | Guidance | `tokenjuice install coder-agents` | `.agents/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/coderabbit.png" alt="CodeRabbit" /> | [CodeRabbit](coderabbit-integration.md) | Guidance | `tokenjuice install coderabbit` | `.coderabbit.yaml` |
| <img width="48" height="48" src="logos/codex-cli.png" alt="Codex CLI" /> | [Codex CLI](codex-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | Native 0.166.0 hooks lack exit status; automatic compaction stays off |
| <img width="48" height="48" src="logos/command-code.png" alt="Command Code" /> | [Command Code](command-code-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | Additive hook retired; scoped legacy cleanup remains available |
| — | [Community Grok CLI](grok-cli-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | [Automatic hook retired](grok-cli-integration.md) |
| <img width="48" height="48" src="logos/continue.png" alt="Continue" /> | [Continue](continue-integration.md) | Guidance | `tokenjuice install continue` | `.continue/rules/tokenjuice.md` |
| <img width="48" height="48" src="logos/crush.png" alt="Crush" /> | [Crush](crush-integration.md) | Guidance | `tokenjuice install crush` | `.crush/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/cursor.png" alt="Cursor" /> | [Cursor](cursor-integration.md) | Pre-tool wrapping | `tokenjuice install cursor` | `~/.cursor/hooks.json` |
| <img width="48" height="48" src="logos/deepagents.png" alt="Deep Agents Code" /> | [Deep Agents Code](deepagents-integration.md) | Guidance | `tokenjuice install deepagents` | `.deepagents/AGENTS.md` |
| <img width="48" height="48" src="logos/deepseek-harness.png" alt="DeepSeek Harness" /> | [DeepSeek Harness](deepseek-harness-integration.md) | Native plugin | `dsh plugin --profile PROFILE add <bundle>` | Use the packaged `dist/hosts/deepseek-harness/bundle`; PTC requires explicit wrapping |
| <img width="48" height="48" src="logos/devin.png" alt="Devin for Terminal" /> | [Devin for Terminal](devin-integration.md) | Pre-tool wrapping | `tokenjuice install devin` | `.devin/hooks.v1.json` |
| <img width="48" height="48" src="logos/docker-agent.png" alt="Docker Agent" /> | [Docker Agent](docker-agent-integration.md) | Guidance | `tokenjuice install docker-agent` | `.docker-agent/tokenjuice.md` |
| <img width="48" height="48" src="logos/dot-agents.png" alt="dot-agents" /> | [dot-agents](dot-agents-integration.md) | Guidance | `tokenjuice install dot-agents` | `~/.agents/rules/global/rules.mdc`; run `dot-agents sync` after install or uninstall |
| <img width="48" height="48" src="logos/doubao-work.png" alt="Doubao Work" /> | [Doubao Work](doubao-work-integration.md) | Manual skill import | Import the packaged [Doubao Work skill](../packaging/skills/doubao-work/tokenjuice/SKILL.md) | Personal file/folder import; native execution unqualified |
| <img width="48" height="48" src="logos/droid.png" alt="Droid (Factory CLI)" /> | [Droid (Factory CLI)](droid-integration.md) | Pre-tool wrapping | `tokenjuice install droid` | `~/.factory/hooks.json` or legacy settings |
| <img width="48" height="48" src="logos/eca.png" alt="ECA" /> | [ECA](eca-integration.md) | Guidance | `tokenjuice install eca` | `.eca/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/elyra.png" alt="Elyra" /> | [Elyra](elyra-integration.md) | Guidance | `tokenjuice install elyra` | `.elyra/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/fastmcp.png" alt="FastMCP" /> | [FastMCP](framework-integrations.md#fastmcp) | Python middleware | `pip install 'tokenjuice-integrations[fastmcp]'` | Add `TokenjuiceMiddleware` to the server or proxy; routed MCP traffic only |
| <img width="48" height="48" src="logos/firebase-studio.png" alt="Firebase Studio" /> | [Firebase Studio](firebase-studio-integration.md) | Guidance | `tokenjuice install firebase-studio` | `.idx/airules.md` |
| <img width="48" height="48" src="logos/forgecode.png" alt="ForgeCode" /> | [ForgeCode](forgecode-integration.md) | Guidance | `tokenjuice install forgecode` | `AGENTS.md` |
| <img width="48" height="48" src="logos/gemini-cli.png" alt="Gemini CLI" /> | [Gemini CLI](gemini-cli-integration.md) | Pre-tool wrapping | `tokenjuice install gemini-cli` | `~/.gemini/settings.json`; `BeforeTool` command wrapping |
| <img width="48" height="48" src="logos/copilot-cli.png" alt="GitHub Copilot CLI" /> | [GitHub Copilot CLI](copilot-cli-integration.md) | Result replacement | `tokenjuice install copilot-cli` | native Bash replacement; [1.0.105 acceptance](copilot-cli-integration.md) |
| <img width="48" height="48" src="logos/copilot-cli.png" alt="GitHub Copilot coding agent" /> | [GitHub Copilot coding agent](copilot-agent-integration.md) | Result replacement | `tokenjuice install copilot-agent` | `.github/hooks/tokenjuice-agent.json` |
| <img width="48" height="48" src="logos/copilot-cli.png" alt="GitHub Copilot SDK" /> | [GitHub Copilot SDK](framework-integrations.md#github-copilot-sdk) | SDK result hook | `createCopilotSdkHooks()` from `token-glace/copilot-sdk` | Compose with application `onPostToolUse` hooks; successful Bash results only |
| <img width="48" height="48" src="logos/gitlab-duo.png" alt="GitLab Duo Agent Platform" /> | [GitLab Duo Agent Platform](gitlab-duo-integration.md) | Guidance | `tokenjuice install gitlab-duo` | `.gitlab/duo/chat-rules.md` |
| <img width="48" height="48" src="logos/antigravity.png" alt="Google Antigravity" /> | [Google Antigravity](antigravity-integration.md) | Guidance | `tokenjuice install antigravity` | `.agents/rules/tokenjuice.md` |
| <img width="48" height="48" src="logos/goose.png" alt="Goose" /> | [Goose](goose-integration.md) | Guidance | `tokenjuice install goose` | `.goosehints` |
| <img width="48" height="48" src="logos/gptme.png" alt="gptme" /> | [gptme](gptme-integration.md) | Guidance | `tokenjuice install gptme` | `AGENTS.md` |
| <img width="48" height="48" src="logos/greptile.png" alt="Greptile" /> | [Greptile](greptile-integration.md) | Guidance | `tokenjuice install greptile` | `.greptile/rules.md` |
| <img width="48" height="48" src="logos/grok-bot.png" alt="Grok Bot" /> | [Grok Bot](grok-bot-integration.md) | Experimental guidance | `tokenjuice install grok-bot` | experimental local rule; [cloud skill workflow](grok-bot-integration.md) |
| <img width="48" height="48" src="logos/grok-bot.png" alt="Grok Build" /> | [Grok Build](grok-build-integration.md) | Guidance | `tokenjuice install grok-build` | `AGENTS.md` |
| <img width="48" height="48" src="logos/hermes.png" alt="Hermes" /> | [Hermes](framework-integrations.md#hermes) | Native plugin | Copy the packaged bundle, then `hermes plugins enable tokenjuice` | Native user-plugin directory; `transform_terminal_output` |
| <img width="48" height="48" src="logos/bob.png" alt="IBM Bob Shell" /> | [IBM Bob Shell](bob-integration.md) | Guidance | `tokenjuice install bob` | `AGENTS.md` |
| <img width="48" height="48" src="logos/jean2.png" alt="Jean2" /> | [Jean2](jean2-integration.md) | Guidance | `tokenjuice install jean2` | `AGENTS.md` |
| <img width="48" height="48" src="logos/jetbrains-ai.png" alt="JetBrains AI Assistant" /> | [JetBrains AI Assistant](jetbrains-ai-integration.md) | Guidance | `tokenjuice install jetbrains-ai` | `.aiassistant/rules/tokenjuice.md` |
| <img width="48" height="48" src="logos/jules.png" alt="Jules" /> | [Jules](jules-integration.md) | Guidance | `tokenjuice install jules` | `AGENTS.md` |
| <img width="48" height="48" src="logos/junie.png" alt="Junie" /> | [Junie](junie-integration.md) | Guidance | `tokenjuice install junie` | `.junie/AGENTS.md` |
| <img width="48" height="48" src="logos/kilo.png" alt="Kilo Code" /> | [Kilo Code](kilo-integration.md) | Guidance | `tokenjuice install kilo` | `kilo.jsonc` or `.kilo/kilo.jsonc` + `.kilo/rules/tokenjuice.md` |
| <img width="48" height="48" src="logos/kimi-code-cli.png" alt="Kimi Code CLI" /> | [Kimi Code CLI](kimi-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | [Automatic hook retired](kimi-integration.md) |
| <img width="48" height="48" src="logos/kiro.png" alt="Kiro" /> | [Kiro](kiro-integration.md) | Guidance | `tokenjuice install kiro` | `.kiro/steering/tokenjuice.md` |
| <img width="48" height="48" src="logos/knowns.png" alt="Knowns" /> | [Knowns](knowns-integration.md) | Guidance | `tokenjuice install knowns` | `KNOWNS.md` |
| <img width="48" height="48" src="logos/deepagents.png" alt="LangChain" /> | [LangChain](framework-integrations.md#langchain) | Python middleware | `pip install 'tokenjuice-integrations[langchain]'` | Add `TokenjuiceMiddleware` with an explicit shell-result decoder |
| — | [LeanCTL](leanctl-integration.md) | Guidance | `tokenjuice install leanctl` | `.leanctl/instructions.md` |
| <img width="48" height="48" src="logos/localcode.png" alt="LocalCode" /> | [LocalCode](localcode-integration.md) | On-demand tool (beta) | `tokenjuice install localcode` | `~/.localcode/plugins/tokenjuice/` |
| <img width="48" height="48" src="logos/mastra.png" alt="Mastra" /> | [Mastra](framework-integrations.md#mastra) | Output processor | `createMastraProcessor()` from `token-glace/mastra` | Add to `outputProcessors` with application decoder/replacement callbacks |
| <img width="48" height="48" src="logos/mcp-agent.png" alt="mcp-agent" /> | [mcp-agent](mcp-agent-integration.md) | Guidance | `tokenjuice install mcp-agent` | `.mcp-agent/agents/tokenjuice.md` |
| <img width="48" height="48" src="logos/mini-swe-agent.png" alt="mini-SWE-agent" /> | [mini-SWE-agent](mini-swe-agent-integration.md) | Guidance | `tokenjuice install mini-swe-agent` | `.mini-swe-agent/tokenjuice.yaml` |
| <img width="48" height="48" src="logos/mistral-vibe.png" alt="Mistral Vibe" /> | [Mistral Vibe](mistral-vibe-integration.md) | Guidance | `tokenjuice install mistral-vibe` | `AGENTS.md` |
| <img width="48" height="48" src="logos/mux-xum.png" alt="Mux / Xum" /> | [Mux / Xum](mux-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | [Automatic hook retired](mux-integration.md) |
| — | [NovaKit CLI](novakit-integration.md) | Guidance | `tokenjuice install novakit` | `NOVAKIT.md` |
| <img width="48" height="48" src="logos/ona.png" alt="Ona Agent" /> | [Ona Agent](ona-integration.md) | Guidance | `tokenjuice install ona` | `.ona/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/open-interpreter.png" alt="Open Interpreter" /> | [Open Interpreter](open-interpreter-integration.md) | Guidance | `tokenjuice install open-interpreter` | `AGENTS.md` |
| <img width="48" height="48" src="logos/openwebui.png" alt="Open WebUI" /> | [Open WebUI](openwebui-integration.md) | Manual tool import (beta) | `tokenjuice install openwebui` | `.openwebui/tools/tokenjuice_compact.py`; then import in Workspace Tools |
| <img width="48" height="48" src="logos/clawdbot.png" alt="OpenClaw" /> | [OpenClaw](https://docs.openclaw.ai/tools/tokenjuice) | External plugin | `openclaw plugins install @openclaw/tokenjuice` | `~/.openclaw/openclaw.json`; enable plugin and restart Gateway (see below) |
| <img width="48" height="48" src="logos/opencode.png" alt="OpenCode V1" /> | [OpenCode V1](spec.md#install-doctor-and-uninstall) | Result replacement | `tokenjuice install opencode` | `~/.config/opencode/plugins/tokenjuice.js` |
| <img width="48" height="48" src="logos/opencode.png" alt="OpenCode V2" /> | [OpenCode V2](opencode-v2-integration.md) | Result replacement | `tokenjuice install opencode-v2` | foreground `shell` result replacement; native v2.0.18 acceptance |
| <img width="48" height="48" src="logos/openhands.png" alt="OpenHands" /> | [OpenHands](openhands-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | Manual wrapping; [legacy hook cleanup](openhands-integration.md) |
| <img width="48" height="48" src="logos/pi.png" alt="pi" /> | [pi](spec.md#install-doctor-and-uninstall) | Result replacement | `tokenjuice install pi` | `~/.pi/agent/extensions/tokenjuice.js` |
| — | [pi-go](pi-go-integration.md) | Guidance | `tokenjuice install pi-go` | `.pi/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/plandex.png" alt="Plandex" /> | [Plandex](plandex-integration.md) | Guidance | `tokenjuice install plandex` | `PLANDEX.tokenjuice.md` |
| <img width="48" height="48" src="logos/qclaw.png" alt="QClaw" /> | [QClaw](qclaw-migration.md) | Migration only | Follow the WorkBuddy migration guide | No QClaw hook installer; qualify WorkBuddy separately |
| <img width="48" height="48" src="logos/qoder.png" alt="Qoder (guidance)" /> | [Qoder (guidance)](qoder-integration.md) | Guidance | `tokenjuice install qoder` | `AGENTS.md`; use `qoder-cli` for the replacement hook |
| <img width="48" height="48" src="logos/qoder.png" alt="Qoder CLI" /> | [Qoder CLI](qoder-integration.md) | Result replacement | `tokenjuice install qoder-cli` | Native `PostToolUse`; separate from Qoder guidance below |
| <img width="48" height="48" src="logos/qoder.png" alt="QoderWork skills" /> | [QoderWork skills](qoderwork-integration.md) | Guidance | `tokenjuice install qoderwork` | guidance skill at `~/.qoderwork/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/qodo.png" alt="Qodo Code Review" /> | [Qodo Code Review](qodo-integration.md) | Guidance | `tokenjuice install qodo` | `.pr_agent.toml` |
| <img width="48" height="48" src="logos/qwen-code.png" alt="Qwen Code" /> | [Qwen Code](qwen-code-integration.md) | Pre-tool wrapping | `tokenjuice install qwen-code` | `.qwen/settings.json` |
| <img width="48" height="48" src="logos/qwenwork.png" alt="QwenWork" /> | [QwenWork](qwenwork-integration.md) | Guidance | `tokenjuice install qwenwork` | guidance skill at `~/.qwenwork/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/replit.png" alt="Replit Agent" /> | [Replit Agent](replit-integration.md) | Guidance | `tokenjuice install replit` | `replit.md` |
| <img width="48" height="48" src="logos/roo.png" alt="Roo Code" /> | [Roo Code](roo-integration.md) | Guidance | `tokenjuice install roo` | `.roo/rules/tokenjuice.md` |
| <img width="48" height="48" src="logos/rovo.png" alt="Rovo Dev CLI" /> | [Rovo Dev CLI](rovo-integration.md) | Guidance | `tokenjuice install rovo` | `AGENTS.md` |
| — | [Ruler](ruler-integration.md) | Guidance | `tokenjuice install ruler` | `.ruler/tokenjuice.md` |
| <img width="48" height="48" src="logos/stagewise.png" alt="Stagewise" /> | [Stagewise](stagewise-integration.md) | Guidance | `tokenjuice install stagewise` | `.stagewise/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="logos/swe-agent.png" alt="SWE-agent" /> | [SWE-agent](swe-agent-integration.md) | Guidance | `tokenjuice install swe-agent` | `.swe-agent/tokenjuice.yaml` |
| <img width="48" height="48" src="logos/t3-code.png" alt="T3 Code" /> | [T3 Code](t3-code-integration.md) | Provider integration | Configure the selected Codex, Claude Code or OpenCode provider | Install on the machine executing tools; no separate T3 installer |
| <img width="48" height="48" src="logos/tabby.png" alt="Tabby" /> | [Tabby](tabby-integration.md) | Guidance | `tokenjuice install tabby` | `~/.tabby/config.toml` |
| <img width="48" height="48" src="logos/tabnine.png" alt="Tabnine CLI" /> | [Tabnine CLI](tabnine-integration.md) | Guidance | `tokenjuice install tabnine` | `TABNINE.md` |
| <img width="48" height="48" src="logos/trae.png" alt="Trae" /> | [Trae](trae-integration.md) | Guidance | `tokenjuice install trae` | `.trae/rules/project_rules.md` |
| <img width="48" height="48" src="logos/uipath.png" alt="UiPath for Coding Agents" /> | [UiPath for Coding Agents](uipath-integration.md) | Guidance | `tokenjuice install uipath` | `AGENTS.md` |
| <img width="48" height="48" src="logos/copilot-cli.png" alt="VS Code Copilot Chat (Local)" /> | [VS Code Copilot Chat (Local)](vscode-copilot-integration.md) | Pre-tool wrapping | `tokenjuice install vscode-copilot` | `~/.copilot/hooks/tokenjuice-vscode.json` |
| <img width="48" height="48" src="logos/warp.png" alt="Warp" /> | [Warp](warp-integration.md) | Guidance | `tokenjuice install warp` | `AGENTS.md` / `WARP.md` |
| <img width="48" height="48" src="logos/windsurf.png" alt="Windsurf" /> | [Windsurf](windsurf-integration.md) | Guidance | `tokenjuice install windsurf` | `.windsurf/rules/tokenjuice.md` |
| <img width="48" height="48" src="logos/workbuddy.png" alt="WorkBuddy" /> | [WorkBuddy](workbuddy-integration.md) | Manual skill import | Import the packaged [WorkBuddy skill](../packaging/skills/workbuddy/tokenjuice/SKILL.md) | Desktop import and execution unqualified; separate from CodeBuddy CLI |
| <img width="48" height="48" src="logos/zed.png" alt="Zed" /> | [Zed](zed-integration.md) | Guidance | `tokenjuice install zed` | `.rules` |
| <img width="48" height="48" src="logos/zencoder.png" alt="Zencoder" /> | [Zencoder](zencoder-integration.md) | Guidance | `tokenjuice install zencoder` | `.zencoder/rules/tokenjuice.md` |

Logos use locally stored, padded tiles for light and dark themes. A dash means no verified project mark is available; see [logo sources and standards](logos/README.md).

## Installation notes

Claude Code installs a PostToolUse hook that replaces eligible Bash output:

```bash
tokenjuice install claude-code
tokenjuice doctor claude-code
```

Restart the host or start a fresh session as its guide requires.
A successful doctor check confirms managed configuration. It does not prove that the host loaded it or delivered compacted output.
Use `tokenjuice uninstall claude-code` to remove tokenjuice's managed wiring.

OpenClaw uses the external `@openclaw/tokenjuice` plugin:

```bash
openclaw plugins install @openclaw/tokenjuice
openclaw config set plugins.entries.tokenjuice.enabled true
openclaw gateway restart
```

Match the plugin to your OpenClaw version. See the [OpenClaw guide](https://docs.openclaw.ai/tools/tokenjuice) for host compatibility.

The OpenClaw adapter compacts shell results, not Code Mode JavaScript results.
Code Mode inputs carrying `code` pass through unchanged, even when OpenClaw
also supplies that JavaScript in a `command` alias. Genuine shell `command`
inputs still use the normal compaction and inspection-output protections.
