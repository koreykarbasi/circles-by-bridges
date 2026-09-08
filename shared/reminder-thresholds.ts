/**
 * A contact becomes a check-in quick-pick only after this many full days since
 * last contact. Both the mobile UI and server delivery import these values so a
 * visible quick-pick is never silently ineligible for its daily push.
 */
export const CHECKIN_THRESHOLDS: Record<1 | 2 | 3, number> = {
  1: 14,
  2: 45,
  3: 160,
};

export const NEW_CONTACT_GRACE_DAYS = 7;

/**
 * Shared quick-pick eligibility contract. A server push can only be built for a
 * contact that would also appear as a check-in quick-pick in the app.
 */
export function isCheckinQuickPickEligible(
  circleLevel: 1 | 2 | 3,
  daysSinceContact: number | null,
  daysSinceCreated: number | null,
  emptyPromptDueAt?: string | Date | null,
  now = new Date(),
): boolean {
  if (daysSinceContact !== null) {
    return daysSinceContact > CHECKIN_THRESHOLDS[circleLevel];
  }

  if (emptyPromptDueAt) {
    const due = new Date(emptyPromptDueAt);
    return !Number.isNaN(due.getTime()) && now.getTime() > due.getTime();
  }

  // Legacy C1/C2 rows keep their established createdAt grace behavior. Legacy
  // C3 rows stay hidden until the production rollout persists a stable due date.
  if (circleLevel === 3) return false;
  // Pre-column rows without a creation timestamp cannot derive a stable grace
  // period. Production startup assigns them a persisted due date.
  if (daysSinceCreated === null) return false;
  const isNewUncontactedContact =
    daysSinceCreated <= NEW_CONTACT_GRACE_DAYS;
  if (isNewUncontactedContact) return false;

  return true;
}