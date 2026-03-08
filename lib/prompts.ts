const CIRCLE_1_CALL_PROMPTS = [
  "Leave [Name] a voice note telling them why they matter to you.",
  "Call [Name] just to hear their voice - no agenda needed.",
  "Ask [Name] what's been weighing on them lately via a phone call.",
  "Call [Name] and ask what they need most right now and really listen.",
  "Leave [Name] a voice message sharing a vulnerable thought.",
];

const CIRCLE_1_TEXT_PROMPTS = [
  "Tell [Name] something you deeply appreciate about who they are.",
  "Tell [Name] one way they've helped you grow.",
  "Send [Name] a reminder of one of your favorite shared memories.",
  "What's something you admire about how [Name] handles challenges?",
  "When's the last time you made [Name] laugh? Do it again.",
  "Send them a 'just because' message: no reason, just love.",
  "What's something [Name] does that makes you feel safe? Tell them.",
  "Share a vulnerable thought with [Name] - they can handle it.",
];

const CIRCLE_1_HANGOUT_PROMPTS = [
  "Plan a spontaneous date or hangout with [Name] this week.",
  "Surprise [Name] with a home-cooked meal or dessert drop-off.",
  "Plan a no-phones evening with [Name] - just quality time.",
  "Invite [Name] to do something completely new together.",
];

const CIRCLE_2_CALL_PROMPTS = [
  "Call [Name] to catch up - even 10 minutes makes a difference.",
  "Leave [Name] a voice note checking in on how life's been.",
  "Phone [Name] and ask for advice on something you're working through.",
];

const CIRCLE_2_TEXT_PROMPTS = [
  "Tell [Name] something you admire about how they live their life.",
  "Remind [Name] of a time they made your day better.",
  "Send a message: 'I've been thinking about you lately - how've you been?'",
  "Tell [Name] you're proud of them for something (big or small).",
  "Ask [Name] what's bringing them joy right now.",
  "Send [Name] a photo that reminds you of a good time together.",
  "Ask [Name] for advice on something - it shows you value their opinion.",
  "Share something new you've learned with [Name].",
];

const CIRCLE_2_HANGOUT_PROMPTS = [
  "Plan a micro-hangout: a walk, coffee, or phone call with [Name].",
  "Suggest trying something new together with [Name].",
  "Invite [Name] to join you for a weekend activity.",
  "Plan a double date or group outing that includes [Name].",
  "Share a new spot you've discovered and invite [Name] to check it out.",
];

const CIRCLE_3_CALL_PROMPTS = [
  "Give [Name] a quick call to reconnect - keep it light and easy.",
  "Call [Name] to congratulate them on a recent milestone.",
];

const CIRCLE_3_TEXT_PROMPTS = [
  "Tell [Name] something you admire from afar - a quality or habit.",
  "React to their recent story or post with something thoughtful.",
  "Send [Name] a relevant article, song, or meme that reminded you of them.",
  "Check in: 'Hey, it's been a minute - want to catch up sometime soon?'",
  "Ask what's new in their world and actually listen.",
  "Congratulate [Name] on a recent milestone or life event.",
  "Forward [Name] an opportunity you think they'd be interested in.",
];

const CIRCLE_3_HANGOUT_PROMPTS = [
  "Invite [Name] to a group hangout or event coming up.",
  "Suggest grabbing coffee with [Name] to catch up properly.",
  "Invite [Name] along to something you're already doing this weekend.",
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

const LABEL_PROMPTS: Record<string, string[]> = {
  "childhood friend": [
    "Reminisce about a memory from growing up with [Name].",
    "Ask [Name] if they've been back to your old neighborhood.",
    "Send [Name] a throwback photo from when you were kids.",
    "Ask [Name] if they still keep in touch with anyone else from back then.",
  ],
  "college friend": [
    "Remind [Name] of a ridiculous thing you did in college.",
    "Ask [Name] how their career has evolved since graduation.",
    "Send [Name] a memory from your college days together.",
    "Ask [Name] if they're going to any upcoming alumni events.",
  ],
  "work friend": [
    "Check in with [Name] about how their job is going.",
    "Suggest a lunch or coffee break with [Name].",
    "Ask [Name] if they've had any exciting projects lately.",
    "Share a professional article or opportunity with [Name].",
  ],
  "neighbor": [
    "Invite [Name] over for a casual backyard hangout.",
    "Ask [Name] if they need anything from the store.",
    "Suggest a neighborhood walk with [Name].",
    "Check in on [Name] - being a good neighbor goes a long way.",
  ],
  "family friend": [
    "Ask [Name] how their family is doing.",
    "Invite [Name]'s family over for dinner.",
    "Share a family update with [Name] and ask about theirs.",
    "Plan a family-friendly outing with [Name].",
  ],
  "gym buddy": [
    "Ask [Name] about their latest workout routine.",
    "Challenge [Name] to a fitness goal together.",
    "Suggest trying a new class or gym together.",
    "Check in on [Name]'s fitness progress.",
  ],
  "travel buddy": [
    "Start planning your next trip with [Name].",
    "Share a travel article or destination idea with [Name].",
    "Reminisce about your favorite trip together with [Name].",
    "Ask [Name] where they want to go next.",
  ],
  "creative partner": [
    "Ask [Name] what creative project they're working on.",
    "Suggest a creative collaboration with [Name].",
    "Share something inspiring you found that [Name] would appreciate.",
    "Give [Name] feedback on their latest work.",
  ],
  "mentor": [
    "Thank [Name] for something specific they've taught you.",
    "Ask [Name] for guidance on a challenge you're facing.",
    "Update [Name] on your progress - they'd love to hear it.",
    "Share a win with [Name] and credit their influence.",
  ],
  "mentee": [
    "Check in on [Name]'s progress and offer encouragement.",
    "Share a resource or tip that could help [Name].",
    "Ask [Name] what they're struggling with and offer support.",
    "Celebrate a recent achievement of [Name].",
  ],
};

type ActionType = "call" | "text" | "hangout";

interface TaggedPrompt {
  text: string;
  actionType: ActionType;
}

const taggedPromptCache = new Map<string, ActionType>();

function buildTaggedPrompts(
  circleLevel: 1 | 2 | 3,
): TaggedPrompt[] {
  const tagged: TaggedPrompt[] = [];

  let callPrompts: string[];
  let textPrompts: string[];
  let hangoutPrompts: string[];

  switch (circleLevel) {
    case 1:
      callPrompts = CIRCLE_1_CALL_PROMPTS;
      textPrompts = CIRCLE_1_TEXT_PROMPTS;
      hangoutPrompts = CIRCLE_1_HANGOUT_PROMPTS;
      break;
    case 2:
      callPrompts = CIRCLE_2_CALL_PROMPTS;
      textPrompts = CIRCLE_2_TEXT_PROMPTS;
      hangoutPrompts = CIRCLE_2_HANGOUT_PROMPTS;
      break;
    case 3:
      callPrompts = CIRCLE_3_CALL_PROMPTS;
      textPrompts = CIRCLE_3_TEXT_PROMPTS;
      hangoutPrompts = CIRCLE_3_HANGOUT_PROMPTS;
      break;
  }

  callPrompts.forEach((p) => {
    tagged.push({ text: p, actionType: "call" });
    taggedPromptCache.set(p, "call");
  });
  textPrompts.forEach((p) => {
    tagged.push({ text: p, actionType: "text" });
    taggedPromptCache.set(p, "text");
  });
  hangoutPrompts.forEach((p) => {
    tagged.push({ text: p, actionType: "hangout" });
    taggedPromptCache.set(p, "hangout");
  });

  return tagged;
}

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
    labels?: string[];
  },
): string[] {
  const tagged = buildTaggedPrompts(circleLevel);
  const allPrompts = tagged.map((t) => t.text);

  allPrompts.push(...UNIVERSAL_PROMPTS);
  UNIVERSAL_PROMPTS.forEach((p) => taggedPromptCache.set(p, "text"));

  if (options?.isOverdue) {
    allPrompts.push(...OVERDUE_PROMPTS);
    OVERDUE_PROMPTS.forEach((p) => taggedPromptCache.set(p, "text"));
  }

  if (options?.hasBirthdaySoon) {
    allPrompts.push(...BIRTHDAY_PROMPTS);
    BIRTHDAY_PROMPTS.forEach((p) => taggedPromptCache.set(p, "text"));
  }

  const interestPrompts: string[] = [];
  interests.forEach((interest) => {
    const key = interest.toLowerCase().trim();
    if (INTEREST_PROMPTS[key]) {
      INTEREST_PROMPTS[key].forEach((p) => {
        interestPrompts.push(p);
        if (!taggedPromptCache.has(p)) {
          const lower = p.toLowerCase();
          if (lower.includes("together") || lower.includes("invite") || lower.includes("suggest") || lower.includes("plan") || lower.includes("potluck") || lower.includes("concert") || lower.includes("game night") || lower.includes("hike") || lower.includes("trip") || lower.includes("club")) {
            taggedPromptCache.set(p, "hangout");
          } else {
            taggedPromptCache.set(p, "text");
          }
        }
      });
    }
  });

  if (options?.labels) {
    options.labels.forEach((label) => {
      const key = label.toLowerCase().trim();
      if (LABEL_PROMPTS[key]) {
        LABEL_PROMPTS[key].forEach((p) => {
          allPrompts.push(p);
          if (!taggedPromptCache.has(p)) {
            const lower = p.toLowerCase();
            if (lower.includes("hangout") || lower.includes("invite") || lower.includes("dinner") || lower.includes("outing") || lower.includes("trip") || lower.includes("collaboration") || lower.includes("class") || lower.includes("lunch") || lower.includes("coffee break")) {
              taggedPromptCache.set(p, "hangout");
            } else if (lower.includes("call") || lower.includes("voice")) {
              taggedPromptCache.set(p, "call");
            } else {
              taggedPromptCache.set(p, "text");
            }
          }
        });
      }
    });
  }

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
    labels?: string[];
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
    labels?: string[];
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
  const originalPrompt = prompt.replace(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g, "[Name]");

  const cached = taggedPromptCache.get(prompt) || taggedPromptCache.get(originalPrompt);
  if (cached) {
    return cached;
  }

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
    lower.includes("potluck") || lower.includes("watch") ||
    lower.includes("dinner") || lower.includes("outing") ||
    lower.includes("lunch") || lower.includes("coffee break")
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

export const AVAILABLE_LABELS = [
  "Childhood Friend", "College Friend", "Work Friend", "Neighbor",
  "Family Friend", "Gym Buddy", "Travel Buddy", "Creative Partner",
  "Mentor", "Mentee",
];
