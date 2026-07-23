export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export function getDaysSince(dateStr?: string): number | null {
  if (!dateStr) return null;

  let year: number;
  let month: number;
  let day: number;

  const slashParts = dateStr.split("/");
  if (slashParts.length >= 2) {
    month = parseInt(slashParts[0], 10) - 1;
    day = parseInt(slashParts[1], 10);
    year = slashParts.length >= 3 ? parseInt(slashParts[2], 10) : new Date().getFullYear();
  } else {
    const dashParts = dateStr.split("-");
    if (dashParts.length === 3) {
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

export function getDaysUntilBirthday(birthday?: string): number | null {
  if (!birthday) return null;

  let month: number;
  let day: number;

  const slashParts = birthday.split("/");
  if (slashParts.length >= 2) {
    month = parseInt(slashParts[0], 10) - 1;
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
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = new Date(now.getFullYear(), month, day);
  if (thisYear < todayMidnight) {
    thisYear.setFullYear(thisYear.getFullYear() + 1);
  }
  return Math.floor((thisYear.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatLastContacted(dateStr?: string): string {
  const days = getDaysSince(dateStr);
  if (days === null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 14) return "Last week";
  if (days < 30) return "This month";
  if (days < 60) return "Last month";
  if (days < 90) return "A couple months ago";
  if (days < 180) return "A few months ago";
  if (days < 365) return "Earlier this year";
  return "Over a year ago";
}

export function formatBirthdayCountdown(birthday?: string): string {
  const days = getDaysUntilBirthday(birthday);
  if (days === null) return "";
  if (days === 0) return "Today!";
  if (days === 1) return "Tomorrow!";
  if (days < 7) return `In ${days} days`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `In ${weeks} week${weeks > 1 ? "s" : ""}`;
  }
  return "";
}

export function getContactUrgency(circleLevel: 1 | 2 | 3, lastContacted?: string): "overdue" | "soon" | "ok" {
  const days = getDaysSince(lastContacted);
  if (days === null) return "overdue";

  if (circleLevel === 1) {
    if (days > 14) return "overdue";
    if (days > 7) return "soon";
    return "ok";
  }
  if (circleLevel === 2) {
    if (days > 45) return "overdue";
    if (days > 21) return "soon";
    return "ok";
  }
  if (days > 75) return "overdue";
  if (days > 45) return "soon";
  return "ok";
}

export function formatLastContactedLabel(label?: string | null, dateStr?: string | null): string {
  if (label) return label;
  return formatLastContacted(dateStr ?? undefined);
}
