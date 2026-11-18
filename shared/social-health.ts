import { getCheckinDaysSince } from "./checkin-time";
import { isContactOnCooldown, type CooldownContact } from "./contact-cooldown";
import { CHECKIN_THRESHOLDS } from "./reminder-thresholds";

export interface SocialHealthContact extends CooldownContact {
  circleLevel: number;
  lastContacted?: string | Date | null;
}

export interface SocialHealth {
  score: number;
  circles: Record<2 | 3, { total: number; inRange: number }>;
}

export function calculateSocialHealth(
  contacts: readonly SocialHealthContact[],
  options: { now?: Date; timezone?: string } = {},
): SocialHealth | null {
  const now = options.now ?? new Date();
  const circles: SocialHealth["circles"] = {
    2: { total: 0, inRange: 0 },
    3: { total: 0, inRange: 0 },
  };
  for (const contact of contacts) {
    const circle = contact.circleLevel;
    if ((circle !== 2 && circle !== 3) || isContactOnCooldown(contact, now)) continue;
    const days = getCheckinDaysSince(contact.lastContacted, options.timezone, now);
    if (days === null) continue;
    circles[circle].total++;
    if (days <= CHECKIN_THRESHOLDS[circle]) circles[circle].inRange++;
  }
  if (circles[2].total + circles[3].total < 3) return null;
  return {
    score: Math.round(100 * (2 * circles[2].inRange + circles[3].inRange) /
      (2 * circles[2].total + circles[3].total)),
    circles,
  };
}

export function socialHealthBand(score: number): "success" | "warning" | "danger" {
  return score >= 70 ? "success" : score >= 40 ? "warning" : "danger";
}
