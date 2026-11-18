import { CIRCLE_CONFIG } from "@/lib/types";
import { CIRCLE_LIMITS } from "./circles";

export const CIRCLE_DESCRIPTIONS = {
  1: {
    name: CIRCLE_CONFIG[1].label,
    explanation:
      `Your closest people: the ones you'd call first in a crisis and celebrate with first. Most people only have 2-3 they'd trust with their life, so this circle doesn't need to be full (the limit is ${CIRCLE_LIMITS[1]}). You're probably already in touch all the time, so Bridges keeps nudges rare here.`,
  },
  2: {
    name: CIRCLE_CONFIG[2].label,
    explanation:
      `Good friends you trust fully but aren't in touch with as often as you'd like. People you want to be better friends with. Worth regular effort: a catch-up every month or two. It doesn't need to be full either (the limit is ${CIRCLE_LIMITS[2]}).`,
  },
  3: {
    name: CIRCLE_CONFIG[3].label,
    explanation:
      `Friends you like but see a few times a year. A check-in every few months keeps the connection warm. The limit is ${CIRCLE_LIMITS[3]}.`,
  },
  4: {
    name: CIRCLE_CONFIG[4].label,
    explanation:
      `Acquaintances worth keeping: mentors, former coworkers, people you'd like updates from. A hello roughly once a year is plenty. The limit is ${CIRCLE_LIMITS[4]}.`,
  },
} as const;
