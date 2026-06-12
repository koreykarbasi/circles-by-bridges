import type { Contact } from "./types";

export interface ProfileCompletion {
  stage: 1 | 2;
  circle1WithBirthday: number;
  circle2Count: number;
  circle3Count: number;
  circle1NoBirthday: Contact[];
  circle2NoBirthday: Contact[];
  c1c2MissingEnrichment: Contact[];
  incompleteAnyContact: Contact[];
  isComplete: boolean;
}

const STAGE1_CIRCLE1_WITH_BIRTHDAY = 3;
const STAGE1_CIRCLE2 = 2;
const STAGE1_CIRCLE3 = 1;

export function computeProfileCompletion(contacts: Contact[]): ProfileCompletion {
  const circle1WithBirthday = contacts.filter((c) => c.circleLevel === 1 && !!c.birthday).length;
  const circle2Count = contacts.filter((c) => c.circleLevel === 2).length;
  const circle3Count = contacts.filter((c) => c.circleLevel === 3).length;
  const circle1NoBirthday = contacts.filter((c) => c.circleLevel === 1 && !c.birthday);
  const circle2NoBirthday = contacts.filter((c) => c.circleLevel === 2 && !c.birthday);
  const c1c2MissingEnrichment = contacts.filter(
    (c) =>
      (c.circleLevel === 1 || c.circleLevel === 2) &&
      (c.labels ?? []).length === 0 &&
      (c.interests ?? []).length === 0,
  );
  const incompleteAnyContact = contacts.filter(
    (c) =>
      !c.birthday ||
      ((c.labels ?? []).length === 0 && (c.interests ?? []).length === 0),
  );

  const isComplete =
    circle1WithBirthday >= STAGE1_CIRCLE1_WITH_BIRTHDAY &&
    circle2Count >= STAGE1_CIRCLE2 &&
    circle3Count >= STAGE1_CIRCLE3;

  const stage: 1 | 2 = isComplete ? 2 : 1;

  return {
    stage,
    circle1WithBirthday,
    circle2Count,
    circle3Count,
    circle1NoBirthday,
    circle2NoBirthday,
    c1c2MissingEnrichment,
    incompleteAnyContact,
    isComplete,
  };
}

export const STAGE1_GOALS = {
  circle1WithBirthday: STAGE1_CIRCLE1_WITH_BIRTHDAY,
  circle2: STAGE1_CIRCLE2,
  circle3: STAGE1_CIRCLE3,
};
