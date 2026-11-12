/**
 * A contact becomes a check-in quick-pick only after this many full days since
 * last contact. Both the mobile UI and server delivery import these values so a
 * visible quick-pick is never silently ineligible for its daily push.
 */
export const CHECKIN_THRESHOLDS: Record<1 | 2 | 3 | 4, number> = {
  1: 30,
  2: 45,
  3: 160,
  4: 320,
};

export const NEW_CONTACT_GRACE_DAYS = 7;

export interface CheckinThresholdContact {
  id: string;
  lastContacted?: string | Date | null;
}

/**
 * A stable per-contact/per-check-in interval, shared by native clients and Node.
 * Hash the stored value identically on both sides; never use time or randomness.
 */
export function getCheckinThreshold(
  circleLevel: 1 | 2 | 3 | 4,
  contact: CheckinThresholdContact,
): number {
  if (circleLevel !== 1) return CHECKIN_THRESHOLDS[circleLevel];
  const lastContacted = contact.lastContacted instanceof Date
    ? contact.lastContacted.toISOString()
    : contact.lastContacted ?? "";
  const input = JSON.stringify([contact.id, lastContacted]);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  }
  return 30 + ((hash >>> 0) % 61);
}

/**
 * Shared quick-pick eligibility contract. A server push can only be built for a
 * contact that would also appear as a check-in quick-pick in the app.
 */
export function isCheckinQuickPickEligible(
  contact: CheckinThresholdContact,
  circleLevel: 1 | 2 | 3 | 4,
  daysSinceContact: number | null,
  daysSinceCreated: number | null,
  emptyPromptDueAt?: string | Date | null,
  now = new Date(),
): boolean {
  if (daysSinceContact !== null) {
    return daysSinceContact > getCheckinThreshold(circleLevel, contact);
  }

  if (emptyPromptDueAt) {
    const due = new Date(emptyPromptDueAt);
    return !Number.isNaN(due.getTime()) && now.getTime() > due.getTime();
  }

  // Legacy C1/C2 rows keep their established createdAt grace behavior. Legacy
  // C3 rows stay hidden until the production rollout persists a stable due date.
  if (circleLevel >= 3) return false;
  // Pre-column rows without a creation timestamp cannot derive a stable grace
  // period. Production startup assigns them a persisted due date.
  if (daysSinceCreated === null) return false;
  const isNewUncontactedContact =
    daysSinceCreated <= NEW_CONTACT_GRACE_DAYS;
  if (isNewUncontactedContact) return false;

  return true;
}