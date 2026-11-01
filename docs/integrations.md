# integration catalog

Choose a client below, then read its guide in the [documentation index](README.md).
The tables list setup routes. They do not imply equal support or native acceptance.
See [adapter support and verification](adapter-support-matrix.md) for recorded test evidence and remaining acceptance work.

Guidance files ask an agent to call `tokenjuice wrap`. They do not compact every command automatically.
Some observation-only hooks are retired because additive context retains the original output.

## native and external integration routes

| Logo | Client | Install | Configuration / behavior |
| --- | --- | --- | --- |
| <img width="48px" src="client-claude.jpg" alt="Claude" /> | [Claude Code](https://docs.anthropic.com/en/claude-code) | `tokenjuice install claude-code` | `~/.claude/settings.json` |
| <img width="48px" src="client-codebuddy.png" alt="CodeBuddy" /> | [CodeBuddy](https://codebuddy.tencent.com/) | `tokenjuice install codebuddy` | `~/.codebuddy/settings.json` |
| <img width="48px" src="client-openai.jpg" alt="Codex" /> | [Codex CLI](codex-integration.md) | `tokenjuice wrap -- <command>` | Native 0.166.0 hooks lack exit status; automatic compaction stays off |
| <img width="48px" src="client-cursor.jpg" alt="Cursor" /> | [Cursor](https://cursor.com/hooks) | `tokenjuice install cursor` | `~/.cursor/hooks.json` |
| <img width="48px" src="client-droid.png" alt="Droid" /> | [Droid (Factory CLI)](droid-integration.md) | `tokenjuice install droid` | `~/.factory/hooks.json` or legacy settings |
| <img width="48px" src="client-copilot.png" alt="GitHub Copilot CLI" /> | [GitHub Copilot CLI](https://github.com/github/copilot-cli) | `tokenjuice install copilot-cli` | native Bash replacement; [1.0.105 acceptance](copilot-cli-integration.md) |
| <img width="48px" src="client-openclaw.jpg" alt="OpenClaw" /> | [OpenClaw](https://openclaw.ai/) | `openclaw plugins install @openclaw/tokenjuice` | `~/.openclaw/openclaw.json` |
| <img width="48px" src="client-opencode.png" alt="OpenCode" /> | [OpenCode](https://opencode.ai/) | `tokenjuice install opencode` | `~/.config/opencode/plugins/tokenjuice.js` |
| <img width="48px" src="client-pi.png" alt="pi" /> | [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `tokenjuice install pi` | `~/.pi/agent/extensions/tokenjuice.js` |
| <img width="48px" src="client-copilot.png" alt="VS Code Copilot" /> | [VS Code Copilot Chat (Local)](vscode-copilot-integration.md) | `tokenjuice install vscode-copilot` | `~/.copilot/hooks/tokenjuice-vscode.json` |

## beta and guidance routes

| Logo | Client | Install | Configuration / behavior |
| --- | --- | --- | --- |
| <img width="48px" src="client-adal.svg" alt="AdaL CLI" /> | [AdaL CLI](https://docs.sylph.ai/features/plugins-and-skills) | `tokenjuice install adal` | `AGENTS.md` |
| <img width="48px" src="client-aether.svg" alt="Aether" /> | [Aether](https://aether-agent.io/) | `tokenjuice install aether` | `.aether/tokenjuice.md` / `.aether/settings.json` |
| <img width="48px" src="client-aictl.svg" alt="aictl" /> | [aictl](https://www.aictl.app/) | `tokenjuice install aictl` | `AICTL.md` |
| <img width="48px" src="client-ai-memory-protocol.svg" alt="AI Memory Protocol" /> | [AI Memory Protocol](https://github.com/bburda/ai_memory_protocol) | `tokenjuice install ai-memory-protocol` | `.memories/memory/preferences.rst` |
| <img width="48px" src="client-aider.svg" alt="Aider" /> | [Aider](https://aider.chat/) | `tokenjuice install aider` | `CONVENTIONS.tokenjuice.md` |
| <img width="48px" src="client-agent-layer.svg" alt="Agent Layer" /> | [Agent Layer](https://agent-layer.dev/) | `tokenjuice install agent-layer` | `.agent-layer/instructions/tokenjuice.md`; run `al sync` after install or uninstall |
| <img width="48px" src="client-agentinit.svg" alt="AgentInit" /> | [AgentInit](https://pypi.org/project/agentinit/) | `tokenjuice install agentinit` | `AGENTS.md`; run `agentinit sync` after install or uninstall |
| <img width="48px" src="client-agentlink.svg" alt="Agentlink" /> | [Agentlink](https://agentlink.run/) | `tokenjuice install agentlink` | `AGENTS.md`; run `agentlink sync` after install or uninstall |
| <img width="48px" src="client-agentloom.svg" alt="Agentloom" /> | [Agentloom](https://agentloom.sh/docs) | `tokenjuice install agentloom` | `.agents/rules/tokenjuice-agentloom.md`; run `agentloom sync` after install or uninstall |
| <img width="48px" src="client-agents-cli.svg" alt="agents-cli" /> | [agents-cli](https://agents-cli.sh/) | `tokenjuice install agents-cli` | `~/.agents/memory/AGENTS.md`; run `agents sync` after install or uninstall |
| <img width="48px" src="client-agents-md.svg" alt="AGENTS.md" /> | [AGENTS.md](https://agents.md/) | `tokenjuice install agents-md` | `AGENTS.md` |
| <img width="48px" src="client-agentsge.svg" alt="agents.ge" /> | [agents.ge](https://agents.ge/) | `tokenjuice install agentsge` | `.agents/rules/tokenjuice-agentsge.md` |
| <img width="48px" src="client-agentsmesh.svg" alt="AgentsMesh" /> | [AgentsMesh](https://samplexbro.github.io/agentsmesh/) | `tokenjuice install agentsmesh` | `.agentsmesh/rules/tokenjuice.md`; run `agentsmesh generate` after install or uninstall |
| <img width="48px" src="client-amazon-q.svg" alt="Amazon Q" /> | [Amazon Q Developer CLI / Kiro compatibility](https://kiro.dev/cli/migrating-from-q/) | `tokenjuice install amazon-q` | `.amazonq/rules/tokenjuice.md` |
| <img width="48px" src="client-amp.svg" alt="Amp" /> | [Amp](https://ampcode.com/manual) | `tokenjuice install amp` | `AGENTS.md` / `AGENT.md` / `CLAUDE.md` |
| <img width="48px" src="client-antigravity.svg" alt="Antigravity" /> | [Google Antigravity](https://antigravity.google/) | `tokenjuice install antigravity` | `.agents/rules/tokenjuice.md` |
| <img width="48px" src="client-anywhere-agents.svg" alt="anywhere-agents" /> | [anywhere-agents](https://anywhere-agents.readthedocs.io/) | `tokenjuice install anywhere-agents` | `AGENTS.local.md`; run `anywhere-agents` after install or uninstall |
| <img width="48px" src="client-augment.svg" alt="Augment" /> | [Augment](https://docs.augmentcode.com/cli/rules) | `tokenjuice install augment` | `.augment/rules/tokenjuice.md` |
| <img width="48px" src="client-avante.png" alt="Avante" /> | [Avante.nvim](https://github.com/yetone/avante.nvim) | `tokenjuice install avante` | `avante.md` |
| <img width="48px" src="client-baz.svg" alt="Baz" /> | [Baz](https://docs.baz.co/agents/skills-and-instructions) | `tokenjuice install baz` | `.baz/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-bito.svg" alt="Bito" /> | [Bito](https://docs.bito.ai/ai-code-reviews-in-git/agent-settings/repo-level-settings) | `tokenjuice install bito` | `.bito.yaml` / `.bito/tokenjuice.md` |
| <img width="48px" src="client-blackbox.svg" alt="Blackbox" /> | [Blackbox CLI](https://docs.blackbox.ai/features/blackbox-cli/skills) | `tokenjuice install blackbox` | `.blackbox/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-blocks.svg" alt="Blocks" /> | [Blocks](https://docs.blocks.team/using-blocks/features/skills) | `tokenjuice install blocks` | `.agents/skills/tokenjuice-blocks/SKILL.md` |
| <img width="48px" src="client-clawdbot.svg" alt="Clawdbot" /> | [Clawdbot](https://docs.clawd.bot/skills) | `tokenjuice install clawdbot` | `skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-bob.svg" alt="IBM Bob" /> | [IBM Bob Shell](https://bob.ibm.com/shell/configuration/configuring) | `tokenjuice install bob` | `AGENTS.md` |
| <img width="48px" src="client-builder.svg" alt="Builder" /> | [Builder](https://www.builder.io/c/projects-configuration-files) | `tokenjuice install builder` | `.builder/rules/tokenjuice.mdc` |
| <img width="48px" src="client-charlie.svg" alt="Charlie" /> | [Charlie](https://docs.charlielabs.ai/customization/instructions) | `tokenjuice install charlie` | `AGENTS.md` |
| <img width="48px" src="client-cline.svg" alt="Cline" /> | [Cline](cline-integration.md) | `tokenjuice install cline` | `~/.cline/hooks/PreToolUse`; native CLI 3.0.74 input wrapping |
| <img width="48px" src="client-codeant.svg" alt="CodeAnt" /> | [CodeAnt](https://docs.codeant.ai/ide/review/code_review_instructions) | `tokenjuice install codeant` | `.codeant/instructions.json` |
| <img width="48px" src="client-codebuff.svg" alt="Codebuff" /> | [Codebuff](https://www.codebuff.com/help/quick-start) | `tokenjuice install codebuff` | `AGENTS.md` |
| <img width="48px" src="client-codegen.svg" alt="Codegen" /> | [Codegen](https://docs.codegen.com/settings/repo-rules) | `tokenjuice install codegen` | `AGENTS.md` |
| <img width="48px" src="client-coder-agents.svg" alt="Coder Agents" /> | [Coder Agents](https://coder.com/ai-coder/agents) | `tokenjuice install coder-agents` | `.agents/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-coderabbit.svg" alt="CodeRabbit" /> | [CodeRabbit](https://docs.coderabbit.ai/configuration/path-instructions) | `tokenjuice install coderabbit` | `.coderabbit.yaml` |
| <img width="48px" src="client-command-code.svg" alt="Command Code" /> | [Command Code](command-code-integration.md) | `tokenjuice wrap -- <command>` | Additive hook retired; scoped legacy cleanup remains available |
| <img width="48px" src="client-continue.png" alt="Continue" /> | [Continue](https://docs.continue.dev/) | `tokenjuice install continue` | `.continue/rules/tokenjuice.md` |
| <img width="48px" src="client-crush.svg" alt="Crush" /> | [Crush](https://github.com/charmbracelet/crush) | `tokenjuice install crush` | `.crush/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-deepagents.svg" alt="Deep Agents Code" /> | [Deep Agents Code](https://docs.langchain.com/oss/javascript/deepagents/code/overview) | `tokenjuice install deepagents` | `.deepagents/AGENTS.md` |
| <img width="48px" src="client-devin.svg" alt="Devin" /> | [Devin for Terminal](https://cli.devin.ai/extensibility/hooks/overview) | `tokenjuice install devin` | `.devin/hooks.v1.json` |
| <img width="48px" src="client-dot-agents.svg" alt="dot-agents" /> | [dot-agents](https://www.dot-agents.com/) | `tokenjuice install dot-agents` | `~/.agents/rules/global/rules.mdc`; run `dot-agents sync` after install or uninstall |
| <img width="48px" src="client-docker-agent.svg" alt="Docker Agent" /> | [Docker Agent](https://docs.docker.com/ai/docker-agent/) | `tokenjuice install docker-agent` | `.docker-agent/tokenjuice.md` |
| <img width="48px" src="client-eca.svg" alt="ECA" /> | [ECA](https://eca.dev/) | `tokenjuice install eca` | `.eca/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-elyra.svg" alt="Elyra" /> | [Elyra](https://elyracode.com/) | `tokenjuice install elyra` | `.elyra/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-firebase-studio.svg" alt="Firebase Studio" /> | [Firebase Studio](https://firebase.google.com/studio/set-up-gemini) | `tokenjuice install firebase-studio` | `.idx/airules.md` |
| <img width="48px" src="client-forgecode.svg" alt="ForgeCode" /> | [ForgeCode](https://forgecode.dev/custom-rules/) | `tokenjuice install forgecode` | `AGENTS.md` |
| <img width="48px" src="client-gemini.png" alt="Gemini" /> | [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `tokenjuice install gemini-cli` | `~/.gemini/settings.json` |
| <img width="48px" src="client-gitlab-duo.svg" alt="GitLab Duo" /> | [GitLab Duo Agent Platform](https://docs.gitlab.com/user/duo_agent_platform/customize/custom_rules/) | `tokenjuice install gitlab-duo` | `.gitlab/duo/chat-rules.md` |
| <img width="48px" src="client-goose.svg" alt="Goose" /> | [Goose](https://goose-docs.ai/) | `tokenjuice install goose` | `.goosehints` |
| <img width="48px" src="client-greptile.svg" alt="Greptile" /> | [Greptile](https://www.greptile.com/code-review/greptile-config) | `tokenjuice install greptile` | `.greptile/rules.md` |
| <img width="48px" src="client-grok-build.svg" alt="Grok Build" /> | [Grok Build](https://docs.x.ai/build/overview) | `tokenjuice install grok-build` | `AGENTS.md` |
| <img width="48px" src="client-grok-bot.svg" alt="Grok Bot" /> | Grok Bot | `tokenjuice install grok-bot` | experimental local rule; [cloud skill workflow](grok-bot-integration.md) |
| <img width="48px" src="client-grok-cli.svg" alt="Grok CLI" /> | [Community Grok CLI](https://github.com/superagent-ai/grok-cli) | `tokenjuice wrap -- <command>` | [Automatic hook retired](grok-cli-integration.md) |
| <img width="48px" src="client-gptme.svg" alt="gptme" /> | [gptme](https://gptme.org/prompts.html) | `tokenjuice install gptme` | `AGENTS.md` |
| <img width="48px" src="client-copilot.png" alt="GitHub Copilot coding agent" /> | [GitHub Copilot coding agent](https://docs.github.com/en/copilot/using-github-copilot/coding-agent) | `tokenjuice install copilot-agent` | `.github/hooks/tokenjuice-agent.json` |
| <img width="48px" src="client-jean2.svg" alt="Jean2" /> | [Jean2](https://jean2.ai/deep-dive/agents-md) | `tokenjuice install jean2` | `AGENTS.md` |
| <img width="48px" src="client-jetbrains-ai.svg" alt="JetBrains AI Assistant" /> | [JetBrains AI Assistant](https://www.jetbrains.com/help/ai-assistant/) | `tokenjuice install jetbrains-ai` | `.aiassistant/rules/tokenjuice.md` |
| <img width="48px" src="client-junie.svg" alt="Junie" /> | [Junie](https://junie.jetbrains.com/junie-cli-usage.html) | `tokenjuice install junie` | `.junie/AGENTS.md` |
| <img width="48px" src="client-jules.svg" alt="Jules" /> | [Jules](https://jules.google/) | `tokenjuice install jules` | `AGENTS.md` |
| <img width="48px" src="client-leanctl.svg" alt="LeanCTL" /> | [LeanCTL](https://leanctl.com/configuration) | `tokenjuice install leanctl` | `.leanctl/instructions.md` |
| <img width="48px" src="client-kimi.svg" alt="Kimi" /> | [Kimi Code CLI](https://www.kimi.com/code/en/kimi-code-cli/guides/getting-started.html) | `tokenjuice wrap -- <command>` | [Automatic hook retired](kimi-integration.md) |
| <img width="48px" src="client-kiro.svg" alt="Kiro" /> | [Kiro](https://kiro.dev/) | `tokenjuice install kiro` | `.kiro/steering/tokenjuice.md` |
| <img width="48px" src="client-kilo.svg" alt="Kilo Code" /> | [Kilo Code](https://kilocode.ai/) | `tokenjuice install kilo` | `kilo.jsonc` or `.kilo/kilo.jsonc` + `.kilo/rules/tokenjuice.md` |
| <img width="48px" src="client-localcode.svg" alt="LocalCode" /> | [LocalCode](https://www.localcode.codes/) | `tokenjuice install localcode` | `~/.localcode/plugins/tokenjuice/` |
| <img width="48px" src="client-mcp-agent.svg" alt="mcp-agent" /> | [mcp-agent](https://docs.mcp-agent.com/) | `tokenjuice install mcp-agent` | `.mcp-agent/agents/tokenjuice.md` |
| <img width="48px" src="client-mini-swe-agent.svg" alt="mini-SWE-agent" /> | [mini-SWE-agent](https://mini-swe-agent.com/) | `tokenjuice install mini-swe-agent` | `.mini-swe-agent/tokenjuice.yaml` |
| <img width="48px" src="client-swe-agent.svg" alt="SWE-agent" /> | [SWE-agent](https://swe-agent.com/latest/) | `tokenjuice install swe-agent` | `.swe-agent/tokenjuice.yaml` |
| <img width="48px" src="client-stagewise.svg" alt="Stagewise" /> | [Stagewise](https://docs.stagewise.io/agent/skills-and-context) | `tokenjuice install stagewise` | `.stagewise/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-mistral-vibe.svg" alt="Mistral Vibe" /> | [Mistral Vibe](https://docs.mistral.ai/mistral-vibe/agents-skills) | `tokenjuice install mistral-vibe` | `AGENTS.md` |
| <img width="48px" src="client-mux.svg" alt="Mux" /> | [Mux / Xum](https://github.com/coder/xum) | `tokenjuice wrap -- <command>` | [Automatic hook retired](mux-integration.md) |
| <img width="48px" src="client-novakit.svg" alt="NovaKit" /> | [NovaKit CLI](https://www.novakit.ai/cli) | `tokenjuice install novakit` | `NOVAKIT.md` |
| <img width="48px" src="client-knowns.svg" alt="Knowns" /> | [Knowns](https://knowns.sh/) | `tokenjuice install knowns` | `KNOWNS.md` |
| <img width="48px" src="client-ona.svg" alt="Ona" /> | [Ona Agent](https://ona.com/ona/agents/overview) | `tokenjuice install ona` | `.ona/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-openhands.svg" alt="OpenHands" /> | [OpenHands](https://docs.openhands.dev/) | `tokenjuice wrap -- <command>` | Manual wrapping; [legacy hook cleanup](openhands-integration.md) |
| <img width="48px" src="client-open-interpreter.svg" alt="Open Interpreter" /> | [Open Interpreter](https://www.openinterpreter.com/terminal/agents_md) | `tokenjuice install open-interpreter` | `AGENTS.md` |
| <img width="48px" src="client-openwebui.svg" alt="Open WebUI" /> | [Open WebUI](https://openwebui.com/) | `tokenjuice install openwebui` | `.openwebui/tools/tokenjuice_compact.py` |
| <img width="48px" src="client-pi-go.svg" alt="pi-go" /> | [pi-go](https://pi-go.sh/) | `tokenjuice install pi-go` | `.pi/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-plandex.svg" alt="Plandex" /> | [Plandex](https://docs.plandex.ai/) | `tokenjuice install plandex` | `PLANDEX.tokenjuice.md` |
| <img width="48px" src="client-qodo.svg" alt="Qodo" /> | [Qodo Code Review](https://docs.qodo.ai/code-review/get-started/configuration-overview/configuration-file) | `tokenjuice install qodo` | `.pr_agent.toml` |
| | [OpenCode V2](opencode-v2-integration.md) | `tokenjuice install opencode-v2` | foreground `shell` result replacement; native v2.0.18 acceptance |
| | [Antigma Ante](ante-integration.md) | `tokenjuice install ante` | project `AGENTS.md` or `CLAUDE.md` |
| <img width="48px" src="client-qoder.svg" alt="Qoder" /> | [Qoder CLI](https://docs.qoder.com/cli/using-cli) | `tokenjuice install qoder-cli` | native `PostToolUse`; `qoder` retains `AGENTS.md` guidance |
| QoderWork | [QoderWork skills](qoderwork-integration.md) | `tokenjuice install qoderwork` | guidance skill at `~/.qoderwork/skills/tokenjuice/SKILL.md` |
| QwenWork | [QwenWork](https://www.alibabacloud.com/help/zh/qwenwork/skills) | `tokenjuice install qwenwork` | guidance skill at `~/.qwenwork/skills/tokenjuice/SKILL.md` |
| <img width="48px" src="client-qwen-code.svg" alt="Qwen Code" /> | [Qwen Code](https://qwenlm.github.io/qwen-code-) | `tokenjuice install qwen-code` | `.qwen/settings.json` |
| <img width="48px" src="client-replit.svg" alt="Replit" /> | [Replit Agent](https://docs.replit.com/references/project-setup/replit-dot-md) | `tokenjuice install replit` | `replit.md` |
| <img width="48px" src="client-roo.svg" alt="Roo Code" /> | [Roo Code](https://roocode.com/) | `tokenjuice install roo` | `.roo/rules/tokenjuice.md` |
| <img width="48px" src="client-rovo.svg" alt="Rovo" /> | [Rovo Dev CLI](https://support.atlassian.com/rovo/use-memory-in-rovo-dev-cli/) | `tokenjuice install rovo` | `AGENTS.md` |
| <img width="48px" src="client-ruler.svg" alt="Ruler" /> | [Ruler](https://github.com/intellectronica/ruler) | `tokenjuice install ruler` | `.ruler/tokenjuice.md` |
| <img width="48px" src="client-tabby.svg" alt="Tabby" /> | [Tabby](https://tabby.tabbyml.com/) | `tokenjuice install tabby` | `~/.tabby/config.toml` |
| <img width="48px" src="client-tabnine.svg" alt="Tabnine" /> | [Tabnine CLI](https://docs.tabnine.com/main/getting-started/tabnine-cli/features/cli-commands) | `tokenjuice install tabnine` | `TABNINE.md` |
| <img width="48px" src="client-trae.svg" alt="Trae" /> | [Trae](https://traeide.com/) | `tokenjuice install trae` | `.trae/rules/project_rules.md` |
| <img width="48px" src="client-uipath.svg" alt="UiPath" /> | [UiPath for Coding Agents](https://www.uipath.com/developers/coding-agents) | `tokenjuice install uipath` | `AGENTS.md` |
| <img width="48px" src="client-warp.svg" alt="Warp" /> | [Warp](https://docs.warp.dev/agent-platform/capabilities/rules) | `tokenjuice install warp` | `AGENTS.md` / `WARP.md` |
| <img width="48px" src="client-windsurf.svg" alt="Windsurf" /> | [Windsurf](https://windsurf.com/) | `tokenjuice install windsurf` | `.windsurf/rules/tokenjuice.md` |
| <img width="48px" src="client-zed.svg" alt="Zed" /> | [Zed](https://zed.dev/ai/rules.html) | `tokenjuice install zed` | `.rules` |
| <img width="48px" src="client-zencoder.svg" alt="Zencoder" /> | [Zencoder](https://docs.zencoder.ai/rules-context/zen-rules) | `tokenjuice install zencoder` | `.zencoder/rules/tokenjuice.md` |
