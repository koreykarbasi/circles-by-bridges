/**
 * A contact becomes a check-in quick-pick only after this many full days since
 * last contact. Both the mobile UI and server delivery import these values so a
 * visible quick-pick is never silently ineligible for its daily push.
 */
export const CHECKIN_THRESHOLDS: Record<1 | 2 | 3, number> = {
  1: 14,
  2: 45,
  3: 75,
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
): boolean {
  if (circleLevel === 3) {
    return daysSinceContact !== null && daysSinceContact > CHECKIN_THRESHOLDS[3];
  }

  const isNewUncontactedContact =
    daysSinceContact === null &&
    (daysSinceCreated === null || daysSinceCreated <= NEW_CONTACT_GRACE_DAYS);
  if (isNewUncontactedContact) return false;

  return daysSinceContact === null || daysSinceContact > CHECKIN_THRESHOLDS[circleLevel];
}