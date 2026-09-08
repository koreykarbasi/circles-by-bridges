function calendarParts(value: Date, timezone: string): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return [
    Number(parts.find((part) => part.type === "year")?.value),
    Number(parts.find((part) => part.type === "month")?.value),
    Number(parts.find((part) => part.type === "day")?.value),
  ];
}

function literalDateParts(value: string): [number, number, number] | null {
  const dateOnly = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnly) return [Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3])];
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!slash) return null;
  return [slash[3] ? Number(slash[3]) : new Date().getFullYear(), Number(slash[1]), Number(slash[2])];
}

/**
 * Calendar-day age for check-in timestamps. ISO timestamps represent instants,
 * so both the contact instant and now are projected into the same timezone.
 * Date-only legacy values remain literal local calendar dates.
 */
export function getCheckinDaysSince(
  value: string | Date | null | undefined,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  now = new Date(),
): number | null {
  if (!value) return null;
  try {
    const today = calendarParts(now, timezone);
    const literal = typeof value === "string" ? literalDateParts(value) : null;
    const contactDay = literal ?? calendarParts(value instanceof Date ? value : new Date(value), timezone);
    if ([...today, ...contactDay].some((part) => !Number.isFinite(part))) return null;
    return Math.floor(
      (Date.UTC(today[0], today[1] - 1, today[2]) -
        Date.UTC(contactDay[0], contactDay[1] - 1, contactDay[2])) /
        86_400_000,
    );
  } catch {
    return null;
  }
}