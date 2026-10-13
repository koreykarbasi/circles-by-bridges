export const BIRTHDAY_YEARS = Array.from(
  { length: new Date().getFullYear() - 1939 }, (_, i) => String(1940 + i),
);

export function birthdayMonthDays(month: number, yearIndex: number): number {
  return new Date(Number(BIRTHDAY_YEARS[yearIndex]), month + 1, 0).getDate();
}

export function birthdaySelection(month: number, day: number, yearIndex: number) {
  const clampedMonth = Math.max(0, Math.min(11, month));
  const clampedYear = Math.max(0, Math.min(BIRTHDAY_YEARS.length - 1, yearIndex));
  const clampedDay = Math.max(0, Math.min(day, birthdayMonthDays(clampedMonth, clampedYear) - 1));
  return {
    month: clampedMonth,
    day: clampedDay,
    yearIndex: clampedYear,
    value: `${String(clampedMonth + 1).padStart(2, "0")}/${String(clampedDay + 1).padStart(2, "0")}`,
  };
}

export function parseBirthdaySelection(value?: string) {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(value || "03/23");
  const month = Number(match?.[1] ?? 3) - 1;
  const day = Number(match?.[2] ?? 23) - 1;
  // No year is stored for birthdays. Preserve February 29 when reopening.
  const yearIndex = BIRTHDAY_YEARS.indexOf(month === 1 && day === 28 ? "2000" : "1999");
  return birthdaySelection(month, day, yearIndex);
}
