export type InstallOutputDetail = {
  label: string;
  value: string;
};

export type CodeBuddyInstallOutput = {
  settingsPath: string;
  command: string;
  backupPath?: string;
  local: boolean;
};

export function formatInstallSuccess(target: string, noun: string, details: InstallOutputDetail[]): string {
  const labelWidth = details.reduce((width, detail) => Math.max(width, detail.label.length), 0);
  const lines = [`success: ${target} ${noun} installed successfully`];

  if (details.length > 0) {
    lines.push("");
    for (const detail of details) {
      lines.push(`  ${detail.label.padEnd(labelWidth)}: ${detail.value}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function formatCodeBuddyInstallSuccess(result: CodeBuddyInstallOutput): string {
  const doctorCommand = `tokenjuice doctor codebuddy${result.local ? " --local" : ""}`;
  const details = [
    { label: "Settings", value: result.settingsPath },
    { label: "Command", value: result.command },
    {
      label: "Activate",
      value: "open /hooks and review the external change for this session, or start a new CodeBuddy session",
    },
    {
      label: "Verify",
      value: `${doctorCommand} (persisted config only; not active-session activation)`,
    },
  ];
  if (result.backupPath) {
    details.push({ label: "Backup", value: result.backupPath });
  }
  return formatInstallSuccess("codebuddy", "hook", details);
}
