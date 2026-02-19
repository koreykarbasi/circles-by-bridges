const CIRCLE_1_PROMPTS = [
  "Tell [Name] something you deeply appreciate about who they are.",
  "Tell [Name] one way they've helped you grow.",
  "Send [Name] a reminder of one of your favorite shared memories.",
  "Ask [Name] what's been weighing on them lately.",
  "What's something you admire about how [Name] handles challenges?",
  "Leave [Name] a voice note telling them why they matter to you.",
  "When's the last time you made [Name] laugh? Do it again.",
  "Send them a 'just because' message: no reason, just love.",
  "What's something [Name] does that makes you feel safe? Tell them.",
  "Share a vulnerable thought with [Name] - they can handle it.",
  "Ask [Name] what they need most right now and really listen.",
  "Plan a spontaneous date or hangout with [Name] this week.",
];

const CIRCLE_2_PROMPTS = [
  "Tell [Name] something you admire about how they live their life.",
  "Remind [Name] of a time they made your day better.",
  "Send a message: 'I've been thinking about you lately - how've you been?'",
  "Share something new you've learned and invite [Name] to join you.",
  "Tell [Name] you're proud of them for something (big or small).",
  "Ask [Name] what's bringing them joy right now.",
  "Plan a micro-hangout: a walk, coffee, or phone call with [Name].",
  "Send [Name] a photo that reminds you of a good time together.",
  "Ask [Name] for advice on something - it shows you value their opinion.",
  "Suggest trying something new together with [Name].",
];

const CIRCLE_3_PROMPTS = [
  "Tell [Name] something you admire from afar - a quality or habit.",
  "React to their recent story or post with something thoughtful.",
  "Send [Name] a relevant article, song, or meme that reminded you of them.",
  "Check in: 'Hey, it's been a minute - want to catch up sometime soon?'",
  "Ask what's new in their world and actually listen.",
  "Congratulate [Name] on a recent milestone or life event.",
  "Forward [Name] an opportunity you think they'd be interested in.",
  "Invite [Name] to a group hangout or event coming up.",
];

const UNIVERSAL_PROMPTS = [
  "What's a compliment you haven't said out loud to [Name] yet?",
  "Which friend would love to hear a random thank-you from you today?",
  "Who's overdue for a celebration? Send some encouragement.",
];

const BIRTHDAY_PROMPTS = [
  "[Name]'s birthday is coming up! Plan something special.",
  "Start thinking about what would make [Name]'s birthday memorable.",
  "Set a reminder to wish [Name] happy birthday - make it personal, not generic.",
  "[Name]'s birthday is soon. A heartfelt voice note goes a long way.",
];

const OVERDUE_PROMPTS = [
  "It's been a while since you reached out to [Name]. A quick message can reignite the connection.",
  "Don't let too much time pass - send [Name] a quick 'thinking of you' today.",
  "[Name] might be wondering where you've been. Break the silence with something genuine.",
  "Reconnecting with [Name] doesn't have to be complicated. Just say hi.",
];

const INTEREST_PROMPTS: Record<string, string[]> = {
  fitness: [
    "Ask how their training is going",
    "Invite them to work out together this week",
    "Share a new exercise or routine you discovered",
  ],
  cooking: [
    "Ask them to share their latest recipe",
    "Suggest a cooking date or potluck",
    "Send them a recipe you think they'd love",
  ],
  music: [
    "Share a song that reminded you of them",
    "Ask what they've been listening to lately",
    "Suggest going to a concert or show together",
  ],
  travel: [
    "Ask about their next trip plans",
    "Share a travel destination you think they'd love",
    "Reminisce about a trip you took together",
  ],
  gaming: [
    "Ask what they've been playing lately",
    "Suggest a game night together",
    "Share a game you think they'd enjoy",
  ],
  reading: [
    "Ask what book they're reading now",
    "Share a book recommendation",
    "Start a mini book club with them",
  ],
  art: [
    "Ask to see what they've been creating lately",
    "Share an exhibit or gallery you think they'd enjoy",
    "Tell them you admire their creative work",
  ],
  sports: [
    "Ask if they caught the latest game",
    "Invite them to watch a game together",
    "Check in on their team's season",
  ],
  tech: [
    "Share an interesting tech article or tool",
    "Ask what projects they're working on",
    "Discuss a new tech trend with them",
  ],
  outdoors: [
    "Suggest a hike or outdoor adventure",
    "Share a beautiful spot you discovered",
    "Plan a camping or nature trip together",
  ],
};

const seenPromptsMap = new Map<string, Set<string>>();

function getSeenKey(contactId: string): string {
  return contactId;
}

export function markPromptSeen(contactId: string, prompt: string) {
  const key = getSeenKey(contactId);
  if (!seenPromptsMap.has(key)) {
    seenPromptsMap.set(key, new Set());
  }
  seenPromptsMap.get(key)!.add(prompt);
}

export function resetSeenPrompts() {
  seenPromptsMap.clear();
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getPromptsForContact(
  name: string,
  circleLevel: 1 | 2 | 3,
  interests: string[],
  options?: {
    isOverdue?: boolean;
    hasBirthdaySoon?: boolean;
  },
): string[] {
  let circlePrompts: string[];
  switch (circleLevel) {
    case 1:
      circlePrompts = CIRCLE_1_PROMPTS;
      break;
    case 2:
      circlePrompts = CIRCLE_2_PROMPTS;
      break;
    case 3:
      circlePrompts = CIRCLE_3_PROMPTS;
      break;
  }

  const allPrompts = [...circlePrompts, ...UNIVERSAL_PROMPTS];

  if (options?.isOverdue) {
    allPrompts.push(...OVERDUE_PROMPTS);
  }

  if (options?.hasBirthdaySoon) {
    allPrompts.push(...BIRTHDAY_PROMPTS);
  }

  const interestPrompts: string[] = [];
  interests.forEach((interest) => {
    const key = interest.toLowerCase().trim();
    if (INTEREST_PROMPTS[key]) {
      interestPrompts.push(...INTEREST_PROMPTS[key]);
    }
  });

  const combined = [...allPrompts, ...interestPrompts];
  return combined.map((p) => p.replace(/\[Name\]/g, name));
}

export function getSmartPrompt(
  contactId: string,
  name: string,
  circleLevel: 1 | 2 | 3,
  interests: string[],
  options?: {
    isOverdue?: boolean;
    hasBirthdaySoon?: boolean;
  },
): string {
  const prompts = getPromptsForContact(name, circleLevel, interests, options);
  const seen = seenPromptsMap.get(getSeenKey(contactId)) || new Set();

  const unseen = prompts.filter((p) => !seen.has(p));
  const pool = unseen.length > 0 ? unseen : prompts;

  const shuffled = shuffleArray(pool);
  const chosen = shuffled[0];

  markPromptSeen(contactId, chosen);
  return chosen;
}

export function getNextPrompt(
  contactId: string,
  currentPrompt: string,
  name: string,
  circleLevel: 1 | 2 | 3,
  interests: string[],
  options?: {
    isOverdue?: boolean;
    hasBirthdaySoon?: boolean;
  },
): string {
  markPromptSeen(contactId, currentPrompt);

  const prompts = getPromptsForContact(name, circleLevel, interests, options);
  const seen = seenPromptsMap.get(getSeenKey(contactId)) || new Set();

  const unseen = prompts.filter((p) => !seen.has(p));
  if (unseen.length > 0) {
    const shuffled = shuffleArray(unseen);
    const chosen = shuffled[0];
    markPromptSeen(contactId, chosen);
    return chosen;
  }

  seenPromptsMap.set(getSeenKey(contactId), new Set([currentPrompt]));
  const available = prompts.filter((p) => p !== currentPrompt);
  const chosen = available[Math.floor(Math.random() * available.length)] || prompts[0];
  markPromptSeen(contactId, chosen);
  return chosen;
}

export function getRandomPrompt(
  name: string,
  circleLevel: 1 | 2 | 3,
  interests: string[],
): string {
  const prompts = getPromptsForContact(name, circleLevel, interests);
  return prompts[Math.floor(Math.random() * prompts.length)];
}

export function getActionType(circleLevel: 1 | 2 | 3, prompt: string): "call" | "text" | "hangout" {
  const lower = prompt.toLowerCase();

  if (lower.includes("voice note") || lower.includes("phone call") || lower.includes("call")) {
    return "call";
  }
  if (
    lower.includes("hangout") || lower.includes("hang out") ||
    lower.includes("plan") || lower.includes("together") ||
    lower.includes("invite") || lower.includes("date") ||
    lower.includes("trip") || lower.includes("concert") ||
    lower.includes("game night") || lower.includes("hike") ||
    lower.includes("potluck") || lower.includes("watch")
  ) {
    return "hangout";
  }
  return "text";
}

export const AVAILABLE_INTERESTS = [
  "Fitness", "Cooking", "Music", "Travel", "Gaming",
  "Reading", "Art", "Sports", "Tech", "Outdoors",
  "Photography", "Movies", "Fashion", "Yoga", "Dancing",
  "Volunteering", "Pets", "Gardening", "Writing", "Podcasts",
];
