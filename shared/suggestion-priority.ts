export const PRIORITY_COHORT_SIZE = 3;

export const CIRCLE_COOLDOWN_DAYS: Record<1 | 2 | 3, number> = {
  1: 7,
  2: 5,
  3: 15,
};

export const ELEVATION_SCORE_BONUS: Record<1 | 2 | 3, number> = {
  1: 3000,
  2: 1500,
  3: 1001,
};

export const ELEVATION_DELAY_HOURS: Record<1 | 2 | 3, number> = {
  1: 24,
  2: 48,
  3: 72,
};

export const ELEVATION_LIFETIME_HOURS: Record<1 | 2 | 3, number> = {
  1: 6 * 24,
  2: 7 * 24,
  3: 8 * 24,
};

export function elevationBonusForAge(
  circleLevel: 1 | 2 | 3,
  ageHours: number | null,
): number {
  if (
    ageHours === null ||
    ageHours < ELEVATION_DELAY_HOURS[circleLevel] ||
    ageHours >= ELEVATION_LIFETIME_HOURS[circleLevel]
  ) {
    return 0;
  }
  return ELEVATION_SCORE_BONUS[circleLevel];
}

export type ElevationPhase = "none" | "deferred" | "due";

export function elevationPhaseForAge(
  circleLevel: 1 | 2 | 3,
  ageHours: number | null,
): ElevationPhase {
  if (ageHours === null || ageHours < 0 || ageHours >= ELEVATION_LIFETIME_HOURS[circleLevel]) {
    return "none";
  }
  return ageHours < ELEVATION_DELAY_HOURS[circleLevel] ? "deferred" : "due";
}

export function shouldDeferSuggestion(
  contactId: string,
  localElevationActive: boolean,
  hasDueElevationBonus: boolean,
  serverDeferredContactIds: readonly string[] = [],
): boolean {
  return (
    serverDeferredContactIds.includes(contactId) ||
    (localElevationActive && !hasDueElevationBonus)
  );
}

export function shouldSuppressCheckin(
  contactId: string,
  localElevationActive: boolean,
  serverPendingContactIds: readonly string[] = [],
): boolean {
  return localElevationActive || serverPendingContactIds.includes(contactId);
}

export function isSuggestionInCooldown(
  circleLevel: 1 | 2 | 3,
  daysSinceLastSuggested: number | null,
): boolean {
  if (daysSinceLastSuggested === null) return false;
  return daysSinceLastSuggested < CIRCLE_COOLDOWN_DAYS[circleLevel];
}

/**
 * Shared priority score used by both Home and the server push picker.
 * Keep this function pure so it can be imported by React Native and Node.
 */
export function scorePrioritySuggestion(
  circleLevel: 1 | 2 | 3,
  daysSinceLastSuggested: number | null,
  daysSinceContact: number | null,
  elevationBonus = 0,
): number {
  let score = circleLevel === 2 ? 1150 : circleLevel === 1 ? 1100 : 1000;

  if (daysSinceLastSuggested === null) {
    score += 150;
  } else {
    score += Math.min(daysSinceLastSuggested * 12, 150);
  }

  const freshThreshold: Record<1 | 2 | 3, number> = { 1: 2, 2: 5, 3: 10 };
  if (daysSinceContact !== null && daysSinceContact < freshThreshold[circleLevel]) {
    score -= (freshThreshold[circleLevel] - daysSinceContact) * 50;
  }

  if (daysSinceContact !== null) {
    score += Math.min(daysSinceContact * 6, 450);
  } else {
    score += 40;
  }

  return score + elevationBonus;
}

export function selectSuggestionForDelivery<T extends { id: string }>(
  priorityCohort: T[],
  lastSuccessfulContactIds: readonly string[],
): T | undefined {
  const recentlyDelivered = new Set(lastSuccessfulContactIds.slice(0, 2));
  return (
    priorityCohort.find((contact) => !recentlyDelivered.has(contact.id)) ??
    priorityCohort.find((contact) => contact.id !== lastSuccessfulContactIds[0]) ??
    priorityCohort[0]
  );
}