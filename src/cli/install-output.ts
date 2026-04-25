export type InstallOutputDetail = {
  label: string;
  value: string;
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
