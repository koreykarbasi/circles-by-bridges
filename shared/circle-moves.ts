import { CIRCLE_LEVELS, CIRCLE_LIMITS, isCircleLevel, type CircleLevel } from "./circles";

export interface CircleMove { contactId: string; circleLevel: CircleLevel }
export interface CircleMoveContact { id: string; circleLevel: number }
export class CircleMoveValidationError extends Error {}

/** Draft moves can overflow; only a balanced draft can be committed. */
export function projectCircleMoves(contacts: CircleMoveContact[], moves: CircleMove[]) {
  const contactIds = new Set(contacts.map(contact => contact.id));
  const destinations = new Map<string, CircleLevel>();
  for (const move of moves) {
    if (!contactIds.has(move.contactId)) throw new CircleMoveValidationError("A contact is no longer available. Refresh and try again.");
    if (!isCircleLevel(move.circleLevel)) throw new CircleMoveValidationError("Choose a valid destination circle.");
    if (destinations.has(move.contactId)) throw new CircleMoveValidationError("Each contact may have only one destination.");
    destinations.set(move.contactId, move.circleLevel);
  }
  const counts: Record<CircleLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const assignments = contacts.map(contact => {
    const circleLevel = destinations.get(contact.id) ?? contact.circleLevel;
    if (!isCircleLevel(circleLevel)) throw new CircleMoveValidationError("A contact has an invalid circle.");
    counts[circleLevel]++;
    return { id: contact.id, circleLevel };
  });
  return {
    counts,
    assignments,
    overfullCircles: CIRCLE_LEVELS.filter(level => counts[level] > CIRCLE_LIMITS[level]),
  };
}

export function validateCircleMoves(contacts: CircleMoveContact[], moves: CircleMove[]) {
  const projection = projectCircleMoves(contacts, moves);
  if (projection.overfullCircles.length) throw new CircleMoveValidationError("Move another contact out of each full circle before saving.");
  return projection;
}
