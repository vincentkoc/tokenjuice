import { getAvailableHookIntegrationNames, getInstalledHookIntegrations } from "../hosts/shared/hook-doctor.js";
import type { HookDoctorReport } from "../hosts/shared/hook-doctor.js";

type IntegrationDoctorReport = HookDoctorReport["integrations"][keyof HookDoctorReport["integrations"]];

function getIntegrationPath(report: IntegrationDoctorReport): string {
  if ("hooksPath" in report) {
    return report.hooksPath;
  }
  if ("settingsPath" in report) {
    return report.settingsPath;
  }
  if ("hookPath" in report) {
    return report.hookPath;
  }
  if ("rulePath" in report) {
    return report.rulePath;
  }
  if ("conventionPath" in report) {
    return report.conventionPath;
  }
  if ("instructionsPath" in report) {
    return report.instructionsPath;
  }
  return report.extensionPath;
}

function appendInstallHint(lines: string[]): void {
  lines.push("");
  lines.push(`available integrations: ${getAvailableHookIntegrationNames().join(", ")}`);
  lines.push("enable another integration: tokenjuice install <host>");
}

export function formatHookDoctorReport(report: HookDoctorReport): string {
  const lines = [`hook health: ${report.status}`];
  const installedIntegrations = getInstalledHookIntegrations(report);

  if (installedIntegrations.length === 0) {
    lines.push("no tokenjuice hooks installed");
    appendInstallHint(lines);
    return `${lines.join("\n")}\n`;
  }

  for (const [index, [name, integrationReport]] of installedIntegrations.entries()) {
    if (index > 0) {
      lines.push("");
    }
    lines.push(`${name}:`);
    lines.push(`- path: ${getIntegrationPath(integrationReport)}`);
    lines.push(`- health: ${integrationReport.status}`);
    if ("expectedCommand" in integrationReport) {
      lines.push(`- expected command: ${integrationReport.expectedCommand}`);
    }
    if ("detectedCommand" in integrationReport && integrationReport.detectedCommand) {
      lines.push(`- configured command: ${integrationReport.detectedCommand}`);
    }
    if (integrationReport.issues.length > 0) {
      lines.push("- issues:");
      for (const issue of integrationReport.issues) {
        lines.push(`  - ${issue}`);
      }
    }
    if (integrationReport.missingPaths.length > 0) {
      lines.push("- missing paths:");
      for (const path of integrationReport.missingPaths) {
        lines.push(`  - ${path}`);
      }
    }
    if ("featureFlag" in integrationReport && integrationReport.featureFlag) {
      const flag = integrationReport.featureFlag;
      if (flag.enabled) {
        lines.push(`- feature flag: codex_hooks is enabled (${flag.configPath})`);
      } else {
        const where = flag.configExists
          ? `${flag.configPath} (missing or disabled)`
          : `no ${flag.configPath}`;
        lines.push(`- feature flag: codex_hooks not enabled — ${where}`);
      }
    }
    lines.push(`- repair: ${integrationReport.fixCommand}`);
  }

  appendInstallHint(lines);
  return `${lines.join("\n")}\n`;
}
