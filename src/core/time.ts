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

export function buildCalendarDayFormatter(timeZone = "utc"): (createdAt: string) => string {
  const normalizedTimeZone = timeZone.toLowerCase();

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
    timeZone,
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
