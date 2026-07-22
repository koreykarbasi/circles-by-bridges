// Returns how many full calendar days have elapsed since the given date string.
// Accepts YYYY-MM-DD (ISO) or MM/DD/YYYY — avoids UTC midnight shift by
// constructing a local-midnight Date from parsed parts rather than relying on
// `new Date(dateStr)` which would interpret ISO strings as UTC.
export function getDaysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null;

  let year: number;
  let month: number; // 0-indexed
  let day: number;

  const slashParts = dateStr.split("/");
  if (slashParts.length >= 2) {
    // MM/DD or MM/DD/YYYY
    month = parseInt(slashParts[0], 10) - 1;
    day = parseInt(slashParts[1], 10);
    year = slashParts.length >= 3 ? parseInt(slashParts[2], 10) : new Date().getFullYear();
  } else {
    const dashParts = dateStr.split("-");
    if (dashParts.length === 3) {
      // YYYY-MM-DD
      year = parseInt(dashParts[0], 10);
      month = parseInt(dashParts[1], 10) - 1;
      day = parseInt(dashParts[2], 10);
    } else {
      return null;
    }
  }

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 0 || month > 11 || day < 1 || day > 31) return null;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateMidnight = new Date(year, month, day);
  return Math.floor((todayMidnight.getTime() - dateMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

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
