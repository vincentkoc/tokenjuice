function isoDay(createdAt: string): string {
  return createdAt.slice(0, 10);
}

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalDay(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

function formatUtcDay(date: Date): string {
  return `${date.getUTCFullYear()}-${padTwo(date.getUTCMonth() + 1)}-${padTwo(date.getUTCDate())}`;
}

let supportedTimeZoneByLowerCase: Map<string, string> | undefined;

function canonicalizeTimeZone(timeZone: string): string | undefined {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function getSupportedTimeZoneByLowerCase(): Map<string, string> {
  if (supportedTimeZoneByLowerCase) {
    return supportedTimeZoneByLowerCase;
  }

  const zones = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];
  supportedTimeZoneByLowerCase = new Map(zones.map((zone) => [zone.toLowerCase(), zone]));
  return supportedTimeZoneByLowerCase;
}

export function normalizeTimeZone(timeZone = "utc"): string {
  const trimmed = timeZone.trim();
  if (!trimmed) {
    return "utc";
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === "local" || normalized === "utc") {
    return normalized;
  }

  const canonical = canonicalizeTimeZone(trimmed);
  if (canonical) {
    return canonical;
  }

  const supported = getSupportedTimeZoneByLowerCase().get(normalized);
  if (supported) {
    return supported;
  }

  throw new Error(
    `invalid timezone: ${timeZone}. Expected "local", "utc", or an IANA time zone such as "Asia/Shanghai" or "America/New_York".`,
  );
}

export function buildCalendarDayFormatter(timeZone = "utc"): (createdAt: string) => string {
  const normalizedTimeZone = normalizeTimeZone(timeZone);

  if (normalizedTimeZone === "local") {
    return (createdAt) => {
      const date = new Date(createdAt);
      return Number.isNaN(date.getTime()) ? isoDay(createdAt) : formatLocalDay(date);
    };
  }

  if (normalizedTimeZone === "utc") {
    return (createdAt) => {
      const date = new Date(createdAt);
      return Number.isNaN(date.getTime()) ? isoDay(createdAt) : formatUtcDay(date);
    };
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (createdAt) => {
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
      return isoDay(createdAt);
    }

    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return year && month && day ? `${year}-${month}-${day}` : isoDay(createdAt);
  };
}
