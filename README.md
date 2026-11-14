<img src="docs/tokenjuice.jpg" alt="tokenjuice banner"/>

# tokenjuice 🧃

lean output compaction for terminal-heavy agent workflows.

tokenjuice runs noisy commands and returns smaller, deterministic output to your agent.
JSON rules summarize listings, test output, build logs, and other terminal output.
The same core powers the CLI and host integrations.

## install

Requires **Node.js 22 or newer**.

```bash
npm install -g tokenjuice
tokenjuice --version
tokenjuice wrap -- git status
```

Other package managers:

```bash
pnpm add -g tokenjuice
yarn global add tokenjuice
```

For Homebrew:

```bash
brew tap vincentkoc/tap
brew install tokenjuice
```

See [distribution](docs/distribution.md) for release artifacts and Linux packages.

## host integrations

The catalog below covers CLI and editor harnesses, desktop clients, instruction formats, and framework adapters.
Each name links to its setup guide. **Pre-tool wrapping** rewrites commands before execution; **result replacement** compacts captured output; **guidance** asks the agent to call `tokenjuice wrap` and is not automatic.
Manual imports, retired hooks, and experimental routes are marked separately.

Support varies by host and version. The [support matrix](docs/adapter-support-matrix.md) records native acceptance and remaining gaps; the [verification inventory](docs/verification-inventory.md) covers every installer target and alias.
A passing doctor check confirms managed configuration, not host loading or model-visible output.

### harness and framework catalog

| Logo | Harness / client / framework | Integration | Setup | Configuration / limits |
| --- | --- | --- | --- | --- |
| <img width="48" height="48" src="docs/logos/adal.png" alt="AdaL CLI" /> | [AdaL CLI](docs/adal-integration.md) | Guidance | `tokenjuice install adal` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/aether.png" alt="Aether" /> | [Aether](docs/aether-integration.md) | Guidance | `tokenjuice install aether` | `.aether/tokenjuice.md` / `.aether/settings.json` |
| <img width="48" height="48" src="docs/logos/agent-layer.png" alt="Agent Layer" /> | [Agent Layer](docs/agent-layer-integration.md) | Guidance | `tokenjuice install agent-layer` | `.agent-layer/instructions/tokenjuice.md`; run `al sync` after install or uninstall |
| — | [AgentInit](docs/agentinit-integration.md) | Guidance | `tokenjuice install agentinit` | `AGENTS.md`; run `agentinit sync` after install or uninstall |
| <img width="48" height="48" src="docs/logos/agentlink.png" alt="Agentlink" /> | [Agentlink](docs/agentlink-integration.md) | Guidance | `tokenjuice install agentlink` | `AGENTS.md`; run `agentlink sync` after install or uninstall |
| <img width="48" height="48" src="docs/logos/agentloom.png" alt="Agentloom" /> | [Agentloom](docs/agentloom-integration.md) | Guidance | `tokenjuice install agentloom` | `.agents/rules/tokenjuice-agentloom.md`; run `agentloom sync` after install or uninstall |
| <img width="48" height="48" src="docs/logos/agents-cli.png" alt="agents-cli" /> | [agents-cli](docs/agents-cli-integration.md) | Guidance | `tokenjuice install agents-cli` | `~/.agents/memory/AGENTS.md`; run `agents sync` after install or uninstall |
| <img width="48" height="48" src="docs/logos/agentsge.png" alt="agents.ge" /> | [agents.ge](docs/agentsge-integration.md) | Guidance | `tokenjuice install agentsge` | `.agents/rules/tokenjuice-agentsge.md` |
| <img width="48" height="48" src="docs/logos/agents-md.png" alt="AGENTS.md" /> | [AGENTS.md](docs/agents-md-integration.md) | Guidance | `tokenjuice install agents-md` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/agentsmesh.png" alt="AgentsMesh" /> | [AgentsMesh](docs/agentsmesh-integration.md) | Guidance | `tokenjuice install agentsmesh` | `.agentsmesh/rules/tokenjuice.md`; run `agentsmesh generate` after install or uninstall |
| — | [AI Memory Protocol](docs/ai-memory-protocol-integration.md) | Guidance | `tokenjuice install ai-memory-protocol` | `.memories/memory/preferences.rst` |
| <img width="48" height="48" src="docs/logos/aictl.png" alt="aictl" /> | [aictl](docs/aictl-integration.md) | Guidance | `tokenjuice install aictl` | `AICTL.md` |
| <img width="48" height="48" src="docs/logos/aider.png" alt="Aider" /> | [Aider](docs/aider-integration.md) | Guidance | `tokenjuice install aider` | `CONVENTIONS.tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/amazon-q.png" alt="Amazon Q Developer CLI / Kiro compatibility" /> | [Amazon Q Developer CLI / Kiro compatibility](docs/amazon-q-integration.md) | Guidance | `tokenjuice install amazon-q` | `.amazonq/rules/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/amp.png" alt="Amp" /> | [Amp](docs/amp-integration.md) | Guidance | `tokenjuice install amp` | `AGENTS.md` / `AGENT.md` / `CLAUDE.md` |
| <img width="48" height="48" src="docs/logos/ante.png" alt="Antigma Ante" /> | [Antigma Ante](docs/ante-integration.md) | Guidance | `tokenjuice install ante` | project `AGENTS.md` or `CLAUDE.md` |
| <img width="48" height="48" src="docs/logos/anywhere-agents.png" alt="anywhere-agents" /> | [anywhere-agents](docs/anywhere-agents-integration.md) | Guidance | `tokenjuice install anywhere-agents` | `AGENTS.local.md`; run `anywhere-agents` after install or uninstall |
| <img width="48" height="48" src="docs/logos/augment.png" alt="Augment" /> | [Augment](docs/augment-integration.md) | Guidance | `tokenjuice install augment` | `.augment/rules/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/autoclaw.png" alt="AutoClaw" /> | [AutoClaw](docs/autoclaw-integration.md) | Manual skill setup | Create a custom skill using the [workflow](packaging/skills/autoclaw/tokenjuice-instructions.md) | Select the skill in a fresh conversation; execution unqualified |
| <img width="48" height="48" src="docs/logos/avante.png" alt="Avante.nvim" /> | [Avante.nvim](docs/avante-integration.md) | Guidance | `tokenjuice install avante` | `avante.md` |
| <img width="48" height="48" src="docs/logos/baz.png" alt="Baz" /> | [Baz](docs/baz-integration.md) | Guidance | `tokenjuice install baz` | `.baz/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/bito.png" alt="Bito" /> | [Bito](docs/bito-integration.md) | Guidance | `tokenjuice install bito` | `.bito.yaml` / `.bito/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/blackbox.png" alt="Blackbox CLI" /> | [Blackbox CLI](docs/blackbox-integration.md) | Guidance | `tokenjuice install blackbox` | `.blackbox/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/blocks.png" alt="Blocks" /> | [Blocks](docs/blocks-integration.md) | Guidance | `tokenjuice install blocks` | `.agents/skills/tokenjuice-blocks/SKILL.md` |
| <img width="48" height="48" src="docs/logos/builder.png" alt="Builder" /> | [Builder](docs/builder-integration.md) | Guidance | `tokenjuice install builder` | `.builder/rules/tokenjuice.mdc` |
| <img width="48" height="48" src="docs/logos/charlie.png" alt="Charlie" /> | [Charlie](docs/charlie-integration.md) | Guidance | `tokenjuice install charlie` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/claude-code.png" alt="Claude Code" /> | [Claude Code](docs/spec.md#install-doctor-and-uninstall) | Pre-tool wrapping | `tokenjuice install claude-code` | `~/.claude/settings.json` |
| <img width="48" height="48" src="docs/logos/clawdbot.png" alt="Clawdbot" /> | [Clawdbot](docs/clawdbot-integration.md) | Guidance | `tokenjuice install clawdbot` | `skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/cline.png" alt="Cline" /> | [Cline](docs/cline-integration.md) | Pre-tool wrapping | `tokenjuice install cline` | `~/.cline/hooks/PreToolUse`; native CLI 3.0.74 input wrapping |
| <img width="48" height="48" src="docs/logos/codeant.png" alt="CodeAnt" /> | [CodeAnt](docs/codeant-integration.md) | Guidance | `tokenjuice install codeant` | `.codeant/instructions.json` |
| <img width="48" height="48" src="docs/logos/codebuddy.png" alt="CodeBuddy" /> | [CodeBuddy](docs/codebuddy-integration.md) | Pre-tool wrapping | `tokenjuice install codebuddy` | `~/.codebuddy/settings.json` |
| <img width="48" height="48" src="docs/logos/codebuff.png" alt="Codebuff" /> | [Codebuff](docs/codebuff-integration.md) | Guidance | `tokenjuice install codebuff` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/codegen.png" alt="Codegen" /> | [Codegen](docs/codegen-integration.md) | Guidance | `tokenjuice install codegen` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/coder-agents.png" alt="Coder Agents" /> | [Coder Agents](docs/coder-agents-integration.md) | Guidance | `tokenjuice install coder-agents` | `.agents/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/coderabbit.png" alt="CodeRabbit" /> | [CodeRabbit](docs/coderabbit-integration.md) | Guidance | `tokenjuice install coderabbit` | `.coderabbit.yaml` |
| <img width="48" height="48" src="docs/logos/codex-cli.png" alt="Codex CLI" /> | [Codex CLI](docs/codex-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | Native 0.166.0 hooks lack exit status; automatic compaction stays off |
| <img width="48" height="48" src="docs/logos/command-code.png" alt="Command Code" /> | [Command Code](docs/command-code-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | Additive hook retired; scoped legacy cleanup remains available |
| — | [Community Grok CLI](docs/grok-cli-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | [Automatic hook retired](docs/grok-cli-integration.md) |
| <img width="48" height="48" src="docs/logos/continue.png" alt="Continue" /> | [Continue](docs/continue-integration.md) | Guidance | `tokenjuice install continue` | `.continue/rules/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/crush.png" alt="Crush" /> | [Crush](docs/crush-integration.md) | Guidance | `tokenjuice install crush` | `.crush/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/cursor.png" alt="Cursor" /> | [Cursor](docs/cursor-integration.md) | Pre-tool wrapping | `tokenjuice install cursor` | `~/.cursor/hooks.json` |
| <img width="48" height="48" src="docs/logos/deepagents.png" alt="Deep Agents Code" /> | [Deep Agents Code](docs/deepagents-integration.md) | Guidance | `tokenjuice install deepagents` | `.deepagents/AGENTS.md` |
| <img width="48" height="48" src="docs/logos/deepseek-harness.png" alt="DeepSeek Harness" /> | [DeepSeek Harness](docs/deepseek-harness-integration.md) | Native plugin | `dsh plugin --profile PROFILE add <bundle>` | Use the packaged `dist/hosts/deepseek-harness/bundle`; PTC requires explicit wrapping |
| <img width="48" height="48" src="docs/logos/devin.png" alt="Devin for Terminal" /> | [Devin for Terminal](docs/devin-integration.md) | Pre-tool wrapping | `tokenjuice install devin` | `.devin/hooks.v1.json` |
| <img width="48" height="48" src="docs/logos/docker-agent.png" alt="Docker Agent" /> | [Docker Agent](docs/docker-agent-integration.md) | Guidance | `tokenjuice install docker-agent` | `.docker-agent/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/dot-agents.png" alt="dot-agents" /> | [dot-agents](docs/dot-agents-integration.md) | Guidance | `tokenjuice install dot-agents` | `~/.agents/rules/global/rules.mdc`; run `dot-agents sync` after install or uninstall |
| <img width="48" height="48" src="docs/logos/doubao-work.png" alt="Doubao Work" /> | [Doubao Work](docs/doubao-work-integration.md) | Manual skill import | Import the packaged [Doubao Work skill](packaging/skills/doubao-work/tokenjuice/SKILL.md) | Personal file/folder import; native execution unqualified |
| <img width="48" height="48" src="docs/logos/droid.png" alt="Droid (Factory CLI)" /> | [Droid (Factory CLI)](docs/droid-integration.md) | Pre-tool wrapping | `tokenjuice install droid` | `~/.factory/hooks.json` or legacy settings |
| <img width="48" height="48" src="docs/logos/eca.png" alt="ECA" /> | [ECA](docs/eca-integration.md) | Guidance | `tokenjuice install eca` | `.eca/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/elyra.png" alt="Elyra" /> | [Elyra](docs/elyra-integration.md) | Guidance | `tokenjuice install elyra` | `.elyra/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/fastmcp.png" alt="FastMCP" /> | [FastMCP](docs/framework-integrations.md#fastmcp) | Python middleware | `pip install 'tokenjuice-integrations[fastmcp]'` | Add `TokenjuiceMiddleware` to the server or proxy; routed MCP traffic only |
| <img width="48" height="48" src="docs/logos/firebase-studio.png" alt="Firebase Studio" /> | [Firebase Studio](docs/firebase-studio-integration.md) | Guidance | `tokenjuice install firebase-studio` | `.idx/airules.md` |
| <img width="48" height="48" src="docs/logos/forgecode.png" alt="ForgeCode" /> | [ForgeCode](docs/forgecode-integration.md) | Guidance | `tokenjuice install forgecode` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/gemini-cli.png" alt="Gemini CLI" /> | [Gemini CLI](docs/gemini-cli-integration.md) | Pre-tool wrapping | `tokenjuice install gemini-cli` | `~/.gemini/settings.json`; `BeforeTool` command wrapping |
| <img width="48" height="48" src="docs/logos/copilot-cli.png" alt="GitHub Copilot CLI" /> | [GitHub Copilot CLI](docs/copilot-cli-integration.md) | Result replacement | `tokenjuice install copilot-cli` | native Bash replacement; [1.0.105 acceptance](docs/copilot-cli-integration.md) |
| <img width="48" height="48" src="docs/logos/copilot-cli.png" alt="GitHub Copilot coding agent" /> | [GitHub Copilot coding agent](docs/copilot-agent-integration.md) | Result replacement | `tokenjuice install copilot-agent` | `.github/hooks/tokenjuice-agent.json` |
| <img width="48" height="48" src="docs/logos/copilot-cli.png" alt="GitHub Copilot SDK" /> | [GitHub Copilot SDK](docs/framework-integrations.md#github-copilot-sdk) | SDK result hook | `createCopilotSdkHooks()` from `tokenjuice/copilot-sdk` | Compose with application `onPostToolUse` hooks; successful Bash results only |
| <img width="48" height="48" src="docs/logos/gitlab-duo.png" alt="GitLab Duo Agent Platform" /> | [GitLab Duo Agent Platform](docs/gitlab-duo-integration.md) | Guidance | `tokenjuice install gitlab-duo` | `.gitlab/duo/chat-rules.md` |
| <img width="48" height="48" src="docs/logos/antigravity.png" alt="Google Antigravity" /> | [Google Antigravity](docs/antigravity-integration.md) | Guidance | `tokenjuice install antigravity` | `.agents/rules/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/goose.png" alt="Goose" /> | [Goose](docs/goose-integration.md) | Guidance | `tokenjuice install goose` | `.goosehints` |
| <img width="48" height="48" src="docs/logos/gptme.png" alt="gptme" /> | [gptme](docs/gptme-integration.md) | Guidance | `tokenjuice install gptme` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/greptile.png" alt="Greptile" /> | [Greptile](docs/greptile-integration.md) | Guidance | `tokenjuice install greptile` | `.greptile/rules.md` |
| <img width="48" height="48" src="docs/logos/grok-bot.png" alt="Grok Bot" /> | [Grok Bot](docs/grok-bot-integration.md) | Experimental guidance | `tokenjuice install grok-bot` | experimental local rule; [cloud skill workflow](docs/grok-bot-integration.md) |
| <img width="48" height="48" src="docs/logos/grok-bot.png" alt="Grok Build" /> | [Grok Build](docs/grok-build-integration.md) | Guidance | `tokenjuice install grok-build` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/hermes.png" alt="Hermes" /> | [Hermes](docs/framework-integrations.md#hermes) | Native plugin | Copy the packaged bundle, then `hermes plugins enable tokenjuice` | Native user-plugin directory; `transform_terminal_output` |
| <img width="48" height="48" src="docs/logos/bob.png" alt="IBM Bob Shell" /> | [IBM Bob Shell](docs/bob-integration.md) | Guidance | `tokenjuice install bob` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/jean2.png" alt="Jean2" /> | [Jean2](docs/jean2-integration.md) | Guidance | `tokenjuice install jean2` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/jetbrains-ai.png" alt="JetBrains AI Assistant" /> | [JetBrains AI Assistant](docs/jetbrains-ai-integration.md) | Guidance | `tokenjuice install jetbrains-ai` | `.aiassistant/rules/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/jules.png" alt="Jules" /> | [Jules](docs/jules-integration.md) | Guidance | `tokenjuice install jules` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/junie.png" alt="Junie" /> | [Junie](docs/junie-integration.md) | Guidance | `tokenjuice install junie` | `.junie/AGENTS.md` |
| <img width="48" height="48" src="docs/logos/kilo.png" alt="Kilo Code" /> | [Kilo Code](docs/kilo-integration.md) | Guidance | `tokenjuice install kilo` | `kilo.jsonc` or `.kilo/kilo.jsonc` + `.kilo/rules/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/kimi-code-cli.png" alt="Kimi Code CLI" /> | [Kimi Code CLI](docs/kimi-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | [Automatic hook retired](docs/kimi-integration.md) |
| <img width="48" height="48" src="docs/logos/kiro.png" alt="Kiro" /> | [Kiro](docs/kiro-integration.md) | Guidance | `tokenjuice install kiro` | `.kiro/steering/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/knowns.png" alt="Knowns" /> | [Knowns](docs/knowns-integration.md) | Guidance | `tokenjuice install knowns` | `KNOWNS.md` |
| <img width="48" height="48" src="docs/logos/deepagents.png" alt="LangChain" /> | [LangChain](docs/framework-integrations.md#langchain) | Python middleware | `pip install 'tokenjuice-integrations[langchain]'` | Add `TokenjuiceMiddleware` with an explicit shell-result decoder |
| — | [LeanCTL](docs/leanctl-integration.md) | Guidance | `tokenjuice install leanctl` | `.leanctl/instructions.md` |
| <img width="48" height="48" src="docs/logos/localcode.png" alt="LocalCode" /> | [LocalCode](docs/localcode-integration.md) | On-demand tool (beta) | `tokenjuice install localcode` | `~/.localcode/plugins/tokenjuice/` |
| <img width="48" height="48" src="docs/logos/mastra.png" alt="Mastra" /> | [Mastra](docs/framework-integrations.md#mastra) | Output processor | `createMastraProcessor()` from `tokenjuice/mastra` | Add to `outputProcessors` with application decoder/replacement callbacks |
| <img width="48" height="48" src="docs/logos/mcp-agent.png" alt="mcp-agent" /> | [mcp-agent](docs/mcp-agent-integration.md) | Guidance | `tokenjuice install mcp-agent` | `.mcp-agent/agents/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/mini-swe-agent.png" alt="mini-SWE-agent" /> | [mini-SWE-agent](docs/mini-swe-agent-integration.md) | Guidance | `tokenjuice install mini-swe-agent` | `.mini-swe-agent/tokenjuice.yaml` |
| <img width="48" height="48" src="docs/logos/mistral-vibe.png" alt="Mistral Vibe" /> | [Mistral Vibe](docs/mistral-vibe-integration.md) | Guidance | `tokenjuice install mistral-vibe` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/mux-xum.png" alt="Mux / Xum" /> | [Mux / Xum](docs/mux-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | [Automatic hook retired](docs/mux-integration.md) |
| — | [nanobot](docs/nanobot-integration.md) | Guidance | `tokenjuice install nanobot` | `<workspace>/skills/tokenjuice/SKILL.md`; set `NANOBOT_WORKSPACE` for custom workspaces |
| — | [NovaKit CLI](docs/novakit-integration.md) | Guidance | `tokenjuice install novakit` | `NOVAKIT.md` |
| <img width="48" height="48" src="docs/logos/ona.png" alt="Ona Agent" /> | [Ona Agent](docs/ona-integration.md) | Guidance | `tokenjuice install ona` | `.ona/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/open-interpreter.png" alt="Open Interpreter" /> | [Open Interpreter](docs/open-interpreter-integration.md) | Guidance | `tokenjuice install open-interpreter` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/openwebui.png" alt="Open WebUI" /> | [Open WebUI](docs/openwebui-integration.md) | Manual tool import (beta) | `tokenjuice install openwebui` | `.openwebui/tools/tokenjuice_compact.py`; then import in Workspace Tools |
| <img width="48" height="48" src="docs/logos/clawdbot.png" alt="OpenClaw" /> | [OpenClaw](https://docs.openclaw.ai/tools/tokenjuice) | External plugin | `openclaw plugins install @openclaw/tokenjuice` | `~/.openclaw/openclaw.json`; enable plugin and restart Gateway (see below) |
| <img width="48" height="48" src="docs/logos/opencode.png" alt="OpenCode V1" /> | [OpenCode V1](docs/spec.md#install-doctor-and-uninstall) | Result replacement | `tokenjuice install opencode` | `~/.config/opencode/plugins/tokenjuice.js` |
| <img width="48" height="48" src="docs/logos/opencode.png" alt="OpenCode V2" /> | [OpenCode V2](docs/opencode-v2-integration.md) | Result replacement | `tokenjuice install opencode-v2` | foreground `shell` result replacement; native v2.0.18 acceptance |
| <img width="48" height="48" src="docs/logos/openhands.png" alt="OpenHands" /> | [OpenHands](docs/openhands-integration.md) | Explicit wrapping | `tokenjuice wrap -- <command>` | Manual wrapping; [legacy hook cleanup](docs/openhands-integration.md) |
| <img width="48" height="48" src="docs/logos/pi.png" alt="pi" /> | [pi](docs/spec.md#install-doctor-and-uninstall) | Result replacement | `tokenjuice install pi` | `~/.pi/agent/extensions/tokenjuice.js` |
| — | [pi-go](docs/pi-go-integration.md) | Guidance | `tokenjuice install pi-go` | `.pi/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/plandex.png" alt="Plandex" /> | [Plandex](docs/plandex-integration.md) | Guidance | `tokenjuice install plandex` | `PLANDEX.tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/qclaw.png" alt="QClaw" /> | [QClaw](docs/qclaw-migration.md) | Migration only | Follow the WorkBuddy migration guide | No QClaw hook installer; qualify WorkBuddy separately |
| <img width="48" height="48" src="docs/logos/qoder.png" alt="Qoder (guidance)" /> | [Qoder (guidance)](docs/qoder-integration.md) | Guidance | `tokenjuice install qoder` | `AGENTS.md`; use `qoder-cli` for the replacement hook |
| <img width="48" height="48" src="docs/logos/qoder.png" alt="Qoder CLI" /> | [Qoder CLI](docs/qoder-integration.md) | Result replacement | `tokenjuice install qoder-cli` | Native `PostToolUse`; separate from Qoder guidance below |
| <img width="48" height="48" src="docs/logos/qoder.png" alt="QoderWork skills" /> | [QoderWork skills](docs/qoderwork-integration.md) | Guidance | `tokenjuice install qoderwork` | guidance skill at `~/.qoderwork/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/qodo.png" alt="Qodo Code Review" /> | [Qodo Code Review](docs/qodo-integration.md) | Guidance | `tokenjuice install qodo` | `.pr_agent.toml` |
| <img width="48" height="48" src="docs/logos/qwen-code.png" alt="Qwen Code" /> | [Qwen Code](docs/qwen-code-integration.md) | Pre-tool wrapping | `tokenjuice install qwen-code` | `.qwen/settings.json` |
| <img width="48" height="48" src="docs/logos/qwenwork.png" alt="QwenWork" /> | [QwenWork](docs/qwenwork-integration.md) | Guidance | `tokenjuice install qwenwork` | guidance skill at `~/.qwenwork/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/replit.png" alt="Replit Agent" /> | [Replit Agent](docs/replit-integration.md) | Guidance | `tokenjuice install replit` | `replit.md` |
| <img width="48" height="48" src="docs/logos/roo.png" alt="Roo Code" /> | [Roo Code](docs/roo-integration.md) | Guidance | `tokenjuice install roo` | `.roo/rules/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/rovo.png" alt="Rovo Dev CLI" /> | [Rovo Dev CLI](docs/rovo-integration.md) | Guidance | `tokenjuice install rovo` | `AGENTS.md` |
| — | [Ruler](docs/ruler-integration.md) | Guidance | `tokenjuice install ruler` | `.ruler/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/stagewise.png" alt="Stagewise" /> | [Stagewise](docs/stagewise-integration.md) | Guidance | `tokenjuice install stagewise` | `.stagewise/skills/tokenjuice/SKILL.md` |
| <img width="48" height="48" src="docs/logos/swe-agent.png" alt="SWE-agent" /> | [SWE-agent](docs/swe-agent-integration.md) | Guidance | `tokenjuice install swe-agent` | `.swe-agent/tokenjuice.yaml` |
| <img width="48" height="48" src="docs/logos/t3-code.png" alt="T3 Code" /> | [T3 Code](docs/t3-code-integration.md) | Provider integration | Configure the selected Codex, Claude Code or OpenCode provider | Install on the machine executing tools; no separate T3 installer |
| <img width="48" height="48" src="docs/logos/tabby.png" alt="Tabby" /> | [Tabby](docs/tabby-integration.md) | Guidance | `tokenjuice install tabby` | `~/.tabby/config.toml` |
| <img width="48" height="48" src="docs/logos/tabnine.png" alt="Tabnine CLI" /> | [Tabnine CLI](docs/tabnine-integration.md) | Guidance | `tokenjuice install tabnine` | `TABNINE.md` |
| <img width="48" height="48" src="docs/logos/trae.png" alt="Trae" /> | [Trae](docs/trae-integration.md) | Guidance | `tokenjuice install trae` | `.trae/rules/project_rules.md` |
| <img width="48" height="48" src="docs/logos/uipath.png" alt="UiPath for Coding Agents" /> | [UiPath for Coding Agents](docs/uipath-integration.md) | Guidance | `tokenjuice install uipath` | `AGENTS.md` |
| <img width="48" height="48" src="docs/logos/copilot-cli.png" alt="VS Code Copilot Chat (Local)" /> | [VS Code Copilot Chat (Local)](docs/vscode-copilot-integration.md) | Pre-tool wrapping | `tokenjuice install vscode-copilot` | `~/.copilot/hooks/tokenjuice-vscode.json` |
| <img width="48" height="48" src="docs/logos/warp.png" alt="Warp" /> | [Warp](docs/warp-integration.md) | Guidance | `tokenjuice install warp` | `AGENTS.md` / `WARP.md` |
| <img width="48" height="48" src="docs/logos/windsurf.png" alt="Windsurf" /> | [Windsurf](docs/windsurf-integration.md) | Guidance | `tokenjuice install windsurf` | `.windsurf/rules/tokenjuice.md` |
| <img width="48" height="48" src="docs/logos/workbuddy.png" alt="WorkBuddy" /> | [WorkBuddy](docs/workbuddy-integration.md) | Manual skill import | Import the packaged [WorkBuddy skill](packaging/skills/workbuddy/tokenjuice/SKILL.md) | Desktop import and execution unqualified; separate from CodeBuddy CLI |
| <img width="48" height="48" src="docs/logos/zed.png" alt="Zed" /> | [Zed](docs/zed-integration.md) | Guidance | `tokenjuice install zed` | `.rules` |
| <img width="48" height="48" src="docs/logos/zencoder.png" alt="Zencoder" /> | [Zencoder](docs/zencoder-integration.md) | Guidance | `tokenjuice install zencoder` | `.zencoder/rules/tokenjuice.md` |

Logos use locally stored, padded tiles for light and dark themes. A dash means no verified project mark is available; see [logo sources and standards](docs/logos/README.md).

### installation notes

For example, Claude Code uses pre-tool command wrapping:

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

## commands

```bash
tokenjuice --help
tokenjuice reduce build.log
tokenjuice reduce-json result.json
tokenjuice wrap -- pnpm test
tokenjuice wrap --keep-failures -- pnpm test
tokenjuice wrap --raw -- git status
tokenjuice wrap --store -- pnpm test
tokenjuice doctor hooks
tokenjuice stats --timezone utc
tokenjuice verify --fixtures
tokenjuice discover
```

`reduce` compacts existing text. `wrap` runs a command and compacts its observed output.
`reduce-json` provides the machine protocol for adapters.
See the [spec](docs/spec.md) for options, JSON envelopes, rules, and storage behavior.

## output and storage

Host integrations preserve exact file reads and apply their documented compaction policy to eligible output.
Use `--keep-failures` to preserve failed commands' stdout, stderr, and exit status within the capture limit.
Automatic pre-tool wrappers enable this option.

`--raw` and its alias `--full` bypass reduction. They still obey the capture limit, which defaults to `4mb`.
Increase `--max-capture-bytes` when you need a larger capture.

Raw artifact storage is opt-in through `--store`.
The Pi extension is the exception: it stores the raw bytes of every rewrite for retrieval with `tokenjuice cat <artifact-id>`.
Set `TOKENJUICE_ARTIFACT_DIR` to choose the artifact directory.

Statistics use bounded metadata segments. `tokenjuice stats --limit 1000` reports partial coverage and a cursor for the next page.
Set `TOKENJUICE_STATS=off` or pass `--no-stats` to disable metadata and hook-debug telemetry writes.

Rules load from built-ins, `~/.config/tokenjuice/rules`, and `.tokenjuice/rules`.
Later layers override earlier rules by ID. See [rule authoring](docs/rules.md).

## docs

- [documentation index](docs/README.md) — all integration guides and reference pages
- [harness and framework catalog](#harness-and-framework-catalog) — setup routes and configuration locations
- [support and verification](docs/adapter-support-matrix.md) — evidence and acceptance limits
- [spec](docs/spec.md) — CLI, adapter protocol, compaction, and storage
- [contributing](CONTRIBUTING.md) — development and validation
- [security](SECURITY.md) — private vulnerability reporting

💙 built by [Vincent Koc](https://github.com/vincentkoc).
