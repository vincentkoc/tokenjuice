import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { collectGuidanceIssues, readInstructionFile, removeInstructionFile, writeInstructionFile } from "../shared/instruction-file.js";
import {
  buildInstructionDoctorReportFields,
  instructionDoctorStatusFromIssues,
} from "../shared/instruction-doctor.js";

export type OpenWebUIToolOptions = {
  projectDir?: string;
};

export type InstallOpenWebUIToolResult = {
  toolPath: string;
  backupPath?: string;
};

export type UninstallOpenWebUIToolResult = {
  toolPath: string;
  removed: boolean;
};

export type OpenWebUIDoctorReport = {
  toolPath: string;
  status: "ok" | "broken" | "disabled";
  issues: string[];
  advisories: string[];
  fixCommand: string;
  checkedPaths: string[];
  missingPaths: string[];
};

const TOKENJUICE_OPENWEBUI_FIX_COMMAND = "tokenjuice install openwebui";
const TOKENJUICE_OPENWEBUI_TOOL_MARKER = "tokenjuice compact terminal output";
const TOKENJUICE_OPENWEBUI_ADVISORY = "Open WebUI support is beta and exports a Workspace Tool source file; review and import it manually as an administrator.";

function getExplicitProjectDir(options: OpenWebUIToolOptions = {}): string | undefined {
  return options.projectDir || process.env.OPENWEBUI_PROJECT_DIR;
}

async function hasGitMetadata(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function findGitRoot(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    if (await hasGitMetadata(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function resolveProjectDir(options: OpenWebUIToolOptions = {}): Promise<string> {
  const explicitProjectDir = getExplicitProjectDir(options);
  if (explicitProjectDir) {
    return resolve(explicitProjectDir);
  }

  return (await findGitRoot(process.cwd())) ?? resolve(process.cwd());
}

async function getDefaultToolPath(options: OpenWebUIToolOptions = {}): Promise<string> {
  return join(await resolveProjectDir(options), ".openwebui", "tools", "tokenjuice_compact.py");
}

const TOKENJUICE_OPENWEBUI_TOOL = [
  "\"\"\"",
  "title: Tokenjuice Compact Terminal Output",
  "author: tokenjuice",
  "version: 0.1.0",
  "description: Compact pasted terminal output with tokenjuice without running user commands.",
  "required_open_webui_version: 0.4.0",
  "licence: MIT",
  "\"\"\"",
  "",
  "import asyncio",
  "import json",
  "import shutil",
  "import subprocess",
  "",
  "from pydantic import BaseModel, Field",
  "",
  `TOKENJUICE_OPENWEBUI_TOOL_MARKER = "${TOKENJUICE_OPENWEBUI_TOOL_MARKER}"`,
  "",
  "",
  "class Tools:",
  "    def __init__(self):",
  "        self.valves = self.Valves()",
  "",
  "    class Valves(BaseModel):",
  "        tokenjuice_bin: str = Field(",
  "            \"tokenjuice\",",
  "            description=\"tokenjuice executable path available to the Open WebUI server.\",",
  "        )",
  "        timeout_seconds: int = Field(",
  "            10,",
  "            ge=1,",
  "            le=60,",
  "            description=\"Maximum seconds to wait for tokenjuice.\",",
  "        )",
  "        max_inline_chars: int = Field(",
  "            20000,",
  "            ge=1000,",
  "            le=200000,",
  "            description=\"Maximum compacted characters returned to chat.\",",
  "        )",
  "        max_input_chars: int = Field(",
  "            200000,",
  "            ge=1000,",
  "            le=2000000,",
  "            description=\"Maximum pasted output characters accepted.\",",
  "        )",
  "",
  "    async def compact_terminal_output(self, command: str, output: str, exit_code: int = 0) -> str:",
  "        \"\"\"",
  "        Compact terminal output that has already been captured.",
  "        The command string is metadata only; it is never executed by this tool.",
  "        :param command: Command that produced the output; used for tokenjuice rule matching only.",
  "        :param output: Terminal output text to compact.",
  "        :param exit_code: Command exit code, if known.",
  "        \"\"\"",
  "        if not isinstance(command, str) or not command.strip():",
  "            return \"Error: command must be a non-empty string.\"",
  "        if not isinstance(output, str):",
  "            return \"Error: output must be a string.\"",
  "        if len(output) > int(self.valves.max_input_chars):",
  "            return f\"Error: output exceeds max_input_chars ({self.valves.max_input_chars}).\"",
  "",
  "        tokenjuice_bin = shutil.which(self.valves.tokenjuice_bin) or self.valves.tokenjuice_bin",
  "        request = {",
  "            \"input\": {",
  "                \"toolName\": \"openwebui-tool\",",
  "                \"command\": command.strip(),",
  "                \"combinedText\": output,",
  "                \"exitCode\": int(exit_code),",
  "                \"metadata\": {\"source\": \"openwebui\"},",
  "            },",
  "            \"options\": {",
  "                \"maxInlineChars\": int(self.valves.max_inline_chars),",
  "            },",
  "        }",
  "",
  "        try:",
  "            completed = await asyncio.to_thread(",
  "                subprocess.run,",
  "                [tokenjuice_bin, \"reduce-json\", \"--format\", \"json\"],",
  "                input=json.dumps(request),",
  "                text=True,",
  "                stdout=subprocess.PIPE,",
  "                stderr=subprocess.PIPE,",
  "                timeout=int(self.valves.timeout_seconds),",
  "                check=False,",
  "            )",
  "        except FileNotFoundError:",
  "            return f\"Error: tokenjuice executable not found: {self.valves.tokenjuice_bin}\"",
  "        except subprocess.TimeoutExpired:",
  "            return f\"Error: tokenjuice timed out after {self.valves.timeout_seconds} seconds.\"",
  "",
  "        if completed.returncode != 0:",
  "            error_text = (completed.stderr or completed.stdout).strip()",
  "            return f\"tokenjuice failed with exit code {completed.returncode}: {error_text}\"",
  "",
  "        try:",
  "            result = json.loads(completed.stdout)",
  "        except json.JSONDecodeError:",
  "            return f\"tokenjuice returned non-JSON output: {completed.stdout[:1000]}\"",
  "",
  "        inline_text = result.get(\"inlineText\")",
  "        if not isinstance(inline_text, str):",
  "            return \"tokenjuice returned no inline text.\"",
  "",
  "        stats = result.get(\"stats\") if isinstance(result.get(\"stats\"), dict) else {}",
  "        classification = result.get(\"classification\") if isinstance(result.get(\"classification\"), dict) else {}",
  "        reducer = classification.get(\"matchedReducer\") or \"generic/fallback\"",
  "        ratio = stats.get(\"ratio\")",
  "        ratio_text = f\", ratio {ratio:.0%}\" if isinstance(ratio, (int, float)) else \"\"",
  "        return f\"tokenjuice compacted output ({reducer}{ratio_text}):\\n\\n{inline_text}\"",
  "",
].join("\n");

export async function installOpenWebUITool(
  toolPath?: string,
  options: OpenWebUIToolOptions = {},
): Promise<InstallOpenWebUIToolResult> {
  const resolvedToolPath = toolPath ?? await getDefaultToolPath(options);
  const result = await writeInstructionFile(resolvedToolPath, TOKENJUICE_OPENWEBUI_TOOL);
  return {
    toolPath: result.filePath,
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
  };
}

export async function uninstallOpenWebUITool(
  toolPath?: string,
  options: OpenWebUIToolOptions = {},
): Promise<UninstallOpenWebUIToolResult> {
  const resolvedToolPath = toolPath ?? await getDefaultToolPath(options);
  const existing = await readInstructionFile(resolvedToolPath);
  if (!existing.exists) {
    return { toolPath: resolvedToolPath, removed: false };
  }
  if (existing.text !== TOKENJUICE_OPENWEBUI_TOOL) {
    throw new Error(
      `refusing to remove ${resolvedToolPath}; it does not match the current tokenjuice Open WebUI tool source. Review and remove it manually, or reinstall tokenjuice openwebui first.`,
    );
  }
  const result = await removeInstructionFile(resolvedToolPath);
  return { toolPath: result.filePath, removed: result.removed };
}

export async function doctorOpenWebUITool(
  toolPath?: string,
  options: OpenWebUIToolOptions = {},
): Promise<OpenWebUIDoctorReport> {
  const resolvedToolPath = toolPath ?? await getDefaultToolPath(options);
  const existing = await readInstructionFile(resolvedToolPath);
  if (!existing.exists) {
    return {
      toolPath: resolvedToolPath,
      ...buildInstructionDoctorReportFields({
        status: "disabled",
        issues: ["tokenjuice Open WebUI tool source is not installed"],
        advisory: TOKENJUICE_OPENWEBUI_ADVISORY,
        fixCommand: TOKENJUICE_OPENWEBUI_FIX_COMMAND,
      }),
    };
  }

  if (existing.text !== TOKENJUICE_OPENWEBUI_TOOL) {
    return {
      toolPath: resolvedToolPath,
      ...buildInstructionDoctorReportFields({
        status: "broken",
        issues: ["configured Open WebUI tool source does not match the current tokenjuice generated source"],
        advisory: TOKENJUICE_OPENWEBUI_ADVISORY,
        fixCommand: TOKENJUICE_OPENWEBUI_FIX_COMMAND,
      }),
    };
  }

  const issues = collectGuidanceIssues(existing.text, {
    required: [
      {
        requiredText: TOKENJUICE_OPENWEBUI_TOOL_MARKER,
        missingIssue: "configured Open WebUI tool source does not look like the tokenjuice tool",
      },
      {
        requiredText: "class Tools:",
        missingIssue: "configured Open WebUI tool source is missing the Tools class",
      },
      {
        requiredText: "compact_terminal_output",
        missingIssue: "configured Open WebUI tool source is missing the compaction tool method",
      },
      {
        requiredText: "reduce-json",
        missingIssue: "configured Open WebUI tool source is missing tokenjuice reduce-json wiring",
      },
      {
        requiredText: "The command string is metadata only; it is never executed by this tool.",
        missingIssue: "configured Open WebUI tool source is missing the no-command-execution safety note",
      },
    ],
    forbidden: [
      {
        forbiddenText: "shell=True",
        presentIssue: "configured Open WebUI tool source enables shell=True",
      },
      {
        forbiddenText: "shell = True",
        presentIssue: "configured Open WebUI tool source enables shell=True",
      },
    ],
  });

  return {
    toolPath: resolvedToolPath,
    ...buildInstructionDoctorReportFields({
      status: instructionDoctorStatusFromIssues(issues),
      issues,
      advisory: TOKENJUICE_OPENWEBUI_ADVISORY,
      fixCommand: TOKENJUICE_OPENWEBUI_FIX_COMMAND,
    }),
  };
}
