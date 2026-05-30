export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export function getDaysSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  const now = new Date();
  const date = new Date(dateStr);
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDaysUntilBirthday(birthday?: string): number | null {
  if (!birthday) return null;
  const now = new Date();
  let month: number, day: number;
  const mmdd = birthday.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mmdd) {
    month = parseInt(mmdd[1], 10) - 1;
    day = parseInt(mmdd[2], 10);
  } else {
    const bday = new Date(birthday);
    if (isNaN(bday.getTime())) return null;
    month = bday.getMonth();
    day = bday.getDate();
  }
  if (isNaN(month) || isNaN(day)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = new Date(now.getFullYear(), month, day);
  if (thisYear < today) {
    thisYear.setFullYear(thisYear.getFullYear() + 1);
  }
  return Math.floor((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
