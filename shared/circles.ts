export type CircleLevel = 1 | 2 | 3 | 4;
export const CIRCLE_LEVELS = [1, 2, 3, 4] as const;
export const CIRCLE_LIMITS: Record<CircleLevel, number> = { 1: 5, 2: 10, 3: 35, 4: 100 };

export function homeCircleContacts<T extends { circleLevel: number }>(contacts: T[]): T[] {
  return contacts.filter(contact => contact.circleLevel >= 1 && contact.circleLevel <= 3);
}

export function isCircleLevel(value: number): value is CircleLevel {
  return CIRCLE_LEVELS.some(level => level === value);
}

export function visibleContactsForClient<T extends { circleLevel: number }>(
  contacts: T[],
  clientVersion?: string,
): T[] {
  return clientVersion === "2" ? contacts : contacts.filter(contact => contact.circleLevel !== 4);
}
