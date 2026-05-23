import { getAvailableHookIntegrationNames, getInstalledHookIntegrations } from "../hosts/shared/hook-doctor.js";
import type { HookDoctorReport } from "../hosts/shared/hook-doctor.js";

type IntegrationDoctorReport = HookDoctorReport["integrations"][keyof HookDoctorReport["integrations"]];

function getStringField(report: IntegrationDoctorReport, key: string): string | undefined {
  if (key in report) {
    const value = (report as Record<string, unknown>)[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function getIntegrationPath(report: IntegrationDoctorReport): string {
  return (
    getStringField(report, "hooksPath") ??
    getStringField(report, "settingsPath") ??
    getStringField(report, "hookPath") ??
    getStringField(report, "hintsPath") ??
    getStringField(report, "rulePath") ??
    getStringField(report, "skillPath") ??
    getStringField(report, "promptPath") ??
    getStringField(report, "configPath") ??
    getStringField(report, "steeringPath") ??
    getStringField(report, "conventionPath") ??
    getStringField(report, "instructionsPath") ??
    getStringField(report, "toolPath") ??
    getStringField(report, "agentPath") ??
    getStringField(report, "pluginDir") ??
    getStringField(report, "extensionPath") ??
    "(unknown)"
  );
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
        const source = flag.key ? `[features].${flag.key}` : "default-on";
        lines.push(`- feature flag: hooks enabled via ${source} (${flag.configPath})`);
      } else {
        const where = flag.configExists
          ? `${flag.configPath} (missing or disabled)`
          : `no ${flag.configPath}`;
        lines.push(`- feature flag: hooks disabled — ${where}`);
      }
    }
    if ("runtimeConfig" in integrationReport && integrationReport.runtimeConfig?.configExists) {
      const runtime = integrationReport.runtimeConfig;
      lines.push(
        `- codex config: approval_policy=${runtime.approvalPolicy ?? "(default)"}, sandbox_mode=${runtime.sandboxMode ?? "(default)"}, approvals_reviewer=${runtime.approvalsReviewer ?? "(default)"}`,
      );
    }
    lines.push(`- repair: ${integrationReport.fixCommand}`);
    if ("syncCommand" in integrationReport && typeof integrationReport.syncCommand === "string") {
      lines.push(`- sync: ${integrationReport.syncCommand}`);
    }
  }

  appendInstallHint(lines);
  return `${lines.join("\n")}\n`;
}
