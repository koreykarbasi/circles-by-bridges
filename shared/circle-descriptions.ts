import { CIRCLE_CONFIG } from "@/lib/types";

export const CIRCLE_DESCRIPTIONS = {
  1: {
    name: CIRCLE_CONFIG[1].label,
    explanation:
      "Your closest people, the handful you'd call first in a crisis and celebrate first with. Does not have to be 5. People usually have 2-3 people they trust their lives with. The Limit is 5. You're probably already in touch all the time, so Bridges keeps nudges rare here.",
  },
  2: {
    name: CIRCLE_CONFIG[2].label,
    explanation:
      "Good friends you genuinely enjoy and want to keep growing with. People you trust fully but just arent in contact with as frequently as you'd want. Worth regular effort: a catch-up every month or two. Again doesnt have to be 10 but that is the limit.",
  },
  3: {
    name: CIRCLE_CONFIG[3].label,
    explanation:
      "Friends and friendly faces you like but see a few times a year. A check-in every few months keeps the connection warm.",
  },
  4: {
    name: CIRCLE_CONFIG[4].label,
    explanation:
      "Acquaintances worth keeping: mentors, former coworkers, people you'd like updates from. A hello roughly once a year is plenty.",
  },
} as const;
