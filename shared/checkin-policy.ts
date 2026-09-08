export const C3_CHECKIN_OPTIONS = [
  { label: "This month", minDaysAgo: 3, maxDaysAgo: 25 },
  { label: "This quarter", minDaysAgo: 35, maxDaysAgo: 75 },
  { label: "This year", minDaysAgo: 100, maxDaysAgo: 150 },
  { label: "Longer", minDaysAgo: 175, maxDaysAgo: 300 },
] as const;

export type C3CheckinOption = (typeof C3_CHECKIN_OPTIONS)[number];

export function randomInclusive(
  min: number,
  max: number,
  random: () => number = Math.random,
): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function dateForCheckinOption(
  option: Pick<C3CheckinOption, "minDaysAgo" | "maxDaysAgo">,
  now = new Date(),
  random: () => number = Math.random,
): Date {
  const result = new Date(now);
  result.setDate(result.getDate() - randomInclusive(option.minDaysAgo, option.maxDaysAgo, random));
  return result;
}

export function emptyContactPromptDueAt(
  circleLevel: 1 | 2 | 3,
  now = new Date(),
  random: () => number = Math.random,
): Date {
  const result = new Date(now);
  const days = circleLevel === 3 ? randomInclusive(14, 30, random) : 7;
  result.setDate(result.getDate() + days);
  return result;
}

export function canSaveContactEdit(
  name: string,
  saving: boolean,
  quickContactSaving: boolean,
): boolean {
  return !!name.trim() && !saving && !quickContactSaving;
}

export function normalizeLastContacted(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function promptDueAfterContactUpdate(params: {
  previousCircleLevel: 1 | 2 | 3;
  previousLastContacted: string | null;
  previousDueAt: Date | null;
  nextCircleLevel: 1 | 2 | 3;
  nextLastContacted: string | null;
  now?: Date;
  random?: () => number;
}): Date | null {
  if (params.nextLastContacted) return null;
  if (
    params.previousLastContacted ||
    params.previousCircleLevel !== params.nextCircleLevel
  ) {
    return emptyContactPromptDueAt(
      params.nextCircleLevel,
      params.now,
      params.random,
    );
  }
  return params.previousDueAt;
}