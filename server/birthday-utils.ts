// Parses MM/DD, MM/DD/YYYY, or YYYY-MM-DD without UTC timezone shift.
// Compares as local calendar dates so day-of-birthday is always day 0.
export function getDaysUntilBirthday(birthday?: string | null): number | null {
  if (!birthday) return null;

  let month: number;
  let day: number;

  const slashParts = birthday.split("/");
  if (slashParts.length >= 2) {
    month = parseInt(slashParts[0], 10) - 1; // 0-indexed
    day = parseInt(slashParts[1], 10);
  } else {
    const dashParts = birthday.split("-");
    if (dashParts.length === 3) {
      month = parseInt(dashParts[1], 10) - 1;
      day = parseInt(dashParts[2], 10);
    } else {
      return null;
    }
  }

  if (isNaN(month) || isNaN(day) || month < 0 || month > 11 || day < 1 || day > 31) return null;

  const now = new Date();
  // Compare calendar dates only — no time component so "today" is always 0
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = new Date(now.getFullYear(), month, day);
  if (thisYear < todayMidnight) thisYear.setFullYear(thisYear.getFullYear() + 1);
  return Math.floor((thisYear.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
}
