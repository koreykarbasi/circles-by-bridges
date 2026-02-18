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
  const bday = new Date(birthday);
  const thisYear = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  if (thisYear < now) {
    thisYear.setFullYear(thisYear.getFullYear() + 1);
  }
  return Math.floor((thisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatLastContacted(dateStr?: string): string {
  const days = getDaysSince(dateStr);
  if (days === null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
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
    if (days > 5) return "soon";
    return "ok";
  }
  if (circleLevel === 2) {
    if (days > 45) return "overdue";
    if (days > 21) return "soon";
    return "ok";
  }
  if (days > 120) return "overdue";
  if (days > 60) return "soon";
  return "ok";
}
