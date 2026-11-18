import { randomInclusive } from "./checkin-policy";

export const REACH_OUT_LABEL = "Reach out";

/** Use local calendar days, and the existing MM/DD custom-reminder contract. */
export function reachOutReminderDate(now = new Date(), random: () => number = Math.random) {
  const scheduledFor = new Date(now);
  scheduledFor.setDate(scheduledFor.getDate() + randomInclusive(7, 21, random));
  const month = String(scheduledFor.getMonth() + 1).padStart(2, "0");
  const day = String(scheduledFor.getDate()).padStart(2, "0");
  return { reminder: { label: REACH_OUT_LABEL, date: `${month}/${day}` }, scheduledFor };
}

export function isReminderMonthDay(value: string): boolean {
  if (!/^\d{2}\/\d{2}$/.test(value)) return false;
  const [month, day] = value.split("/").map(Number);
  const date = new Date(2000, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day;
}
