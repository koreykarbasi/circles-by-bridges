export const SCHEDULE_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type ScheduleMode = "deadline" | "datetime";
export interface ScheduleSelection {
  month: number;
  day: number;
  yearIndex: number;
  hour: number;
  ampm: number;
}

export function scheduleYears(mode: ScheduleMode, now = new Date()): string[] {
  return Array.from({ length: mode === "deadline" ? 5 : 4 },
    (_, i) => String(now.getFullYear() + i));
}

export function scheduleMonthDays(month: number, yearIndex: number, years: string[]): number {
  return new Date(Number(years[yearIndex]), month + 1, 0).getDate();
}

export function scheduleSelection(selection: ScheduleSelection, years: string[]) {
  const month = Math.max(0, Math.min(11, selection.month));
  const yearIndex = Math.max(0, Math.min(years.length - 1, selection.yearIndex));
  return {
    month,
    yearIndex,
    day: Math.max(0, Math.min(selection.day, scheduleMonthDays(month, yearIndex, years) - 1)),
    hour: Math.max(0, Math.min(11, selection.hour)),
    ampm: Math.max(0, Math.min(1, selection.ampm)),
  };
}

export function formatScheduleSelection(selection: ScheduleSelection, mode: ScheduleMode, years: string[]) {
  const s = scheduleSelection(selection, years);
  const date = `${SCHEDULE_MONTHS[s.month]} ${s.day + 1}, ${years[s.yearIndex]}`;
  return mode === "datetime" ? `${date} at ${s.hour + 1}:00 ${s.ampm === 0 ? "AM" : "PM"}` : date;
}

export function parseScheduleSelection(value: string | undefined, mode: ScheduleMode, years: string[], now = new Date()) {
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + (mode === "deadline" ? 3 : 7));
  // Parse the app's display format directly so calendar dates never shift with UTC.
  const match = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+at\s+(\d{1,2}):\d{2}\s+(AM|PM))?$/i.exec(value || "");
  let date = fallback;
  let hour = 6;
  let ampm = 1;
  if (match) {
    const month = SCHEDULE_MONTHS.findIndex(m => m.toLowerCase() === match[1].toLowerCase());
    if (month >= 0) {
      date = new Date(Number(match[3]), month, 1);
      date.setDate(Math.min(Number(match[2]), new Date(Number(match[3]), month + 1, 0).getDate()));
      if (match[4]) hour = Number(match[4]) - 1;
      if (match[5]) ampm = match[5].toUpperCase() === "AM" ? 0 : 1;
    }
  } else if (value && mode === "deadline") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  const index = years.indexOf(String(date.getFullYear()));
  return scheduleSelection({
    month: date.getMonth(), day: date.getDate() - 1,
    yearIndex: index >= 0 ? index : date.getFullYear() < Number(years[0]) ? 0 : years.length - 1,
    hour, ampm,
  }, years);
}
