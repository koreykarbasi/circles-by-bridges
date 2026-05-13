import { getApiUrl } from "@/lib/query-client";

interface SyncedPromptsData {
  circle1Call: string[];
  circle1Text: string[];
  circle1Hangout: string[];
  circle2Call: string[];
  circle2Text: string[];
  circle2Hangout: string[];
  circle3Call: string[];
  circle3Text: string[];
  circle3Hangout: string[];
  universal: string[];
  birthday: string[];
  overdue: string[];
  labelPrompts: Record<string, string[]>;
  interestPrompts: Record<string, string[]>;
  lastSynced: string | null;
}

let syncedData: SyncedPromptsData | null = null;
let syncFetchPromise: Promise<void> | null = null;

export async function loadSyncedPrompts(): Promise<void> {
  if (syncFetchPromise) return syncFetchPromise;
  syncFetchPromise = (async () => {
    try {
      const url = new URL("/api/prompts", getApiUrl());
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (resp.ok) {
        syncedData = await resp.json();
      }
    } catch (e) {
      console.log("Failed to load synced prompts, using hardcoded fallback");
    } finally {
      syncFetchPromise = null;
    }
  })();
  return syncFetchPromise;
}

function getSyncedList(key: keyof SyncedPromptsData, fallback: string[]): string[] {
  if (syncedData && Array.isArray(syncedData[key])) {
    const synced = syncedData[key] as string[];
    if (synced.length > 0) return synced;
  }
  return fallback;
}

function getSyncedRecord(key: "labelPrompts" | "interestPrompts", fallback: Record<string, string[]>): Record<string, string[]> {
  if (syncedData && syncedData[key] && typeof syncedData[key] === "object") {
    const synced = syncedData[key] as Record<string, string[]>;
    if (Object.keys(synced).length > 0) return synced;
  }
  return fallback;
}

const CIRCLE_1_CALL_PROMPTS = [
  "Leave [Name] a voice note telling them why they matter to you.",
  "Call [Name] just to hear their voice - no agenda needed.",
  "Ask [Name] what's been weighing on them lately via a phone call.",
  "Call [Name] and ask what they need most right now and really listen.",
  "Leave [Name] a voice message sharing a vulnerable thought.",
  "Tell [Name] out loud what they mean to you - not a text, a real call.",
  "Call [Name] and ask how they're really doing - not the surface answer.",
  "Leave [Name] a voice note about a moment this week where you wished they were there.",
  "Call [Name] and share something you've been sitting with lately.",
  "Call [Name] with no reason at all - just the desire to hear their voice.",
  "Tell [Name] on a call that you see how hard they've been working lately.",
  "Ask [Name] what's been bringing them peace lately - then really listen.",
  "Call [Name] to remind them they're not doing life alone.",
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
  "Tell [Name] about a moment recently where you thought of them.",
  "Ask [Name] what's been on their heart lately.",
  "Tell [Name]: I don't say this enough, but I'm really glad you're in my life.",
  "Ask [Name] what they need most right now - and really mean it.",
  "Tell [Name] one thing you hope never changes about them.",
  "Tell [Name] that you admire how they show up for others.",
  "Ask [Name] what they've been learning about themselves lately.",
  "Send [Name] a note: you don't have to have it all figured out - I'm here.",
  "Ask [Name] what part of life feels most uncertain for them right now.",
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
  "Call [Name] and tell them you've been thinking about them - no agenda.",
  "Leave [Name] a voice note just to check in - warmth goes a long way.",
  "Phone [Name] out of the blue - the unexpected call often means the most.",
  "Ask [Name] how they're doing beyond the surface - show you actually want to know.",
  "Call [Name] and ask what's been weighing on them lately.",
  "Leave [Name] a voice message saying you've been thinking about them.",
  "Give [Name] a call and share something specific you admire about them.",
  "Ask [Name] what they're looking forward to - a call goes deeper than a text.",
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
  "Ask [Name] what's been making them happy lately.",
  "Tell [Name] you're thinking of them and hope things are going well.",
  "Ask [Name] something genuine: what are they figuring out right now?",
  "Send [Name] a word of encouragement about something they're working through.",
  "Tell [Name] specifically what you value about their friendship.",
  "Tell [Name] that you've been rooting for them quietly.",
  "Ask [Name] how they're really doing - not the polished version.",
  "Send [Name] a genuine compliment about something you've noticed.",
  "Ask [Name] what's something they wish they had more time for.",
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
  "Leave [Name] a voice note - it's low pressure and surprisingly meaningful.",
  "Call [Name] just to say you were thinking about them - keep it short and genuine.",
  "Give [Name] a quick call to check in - no agenda, just connection.",
  "Send [Name] a voice note with no agenda - just warmth.",
  "Call [Name] to say you saw something that made you think of them.",
  "Give [Name] a brief call to check in - keep it light and easy.",
  "Leave [Name] a voice note with a genuine compliment.",
  "Call [Name] to share something small you thought they'd enjoy.",
];

const CIRCLE_3_TEXT_PROMPTS = [
  "Tell [Name] something you admire from afar - a quality or habit.",
  "React to their recent story or post with something thoughtful.",
  "Send [Name] a relevant article, song, or meme that reminded you of them.",
  "Check in: 'Hey, it's been a minute - want to catch up sometime soon?'",
  "Ask what's new in their world and actually listen.",
  "Congratulate [Name] on a recent milestone or life event.",
  "Forward [Name] an opportunity you think they'd be interested in.",
  "Send [Name] a message just to let them know you're thinking of them.",
  "Tell [Name] something genuine you noticed or admire about who they are.",
  "Check in with [Name] - no agenda, just a moment of presence.",
  "Send [Name] something small that made you think of them this week.",
  "Drop [Name] a short message - they don't need a reason to hear from you.",
  "Tell [Name] something you noticed about them that you haven't said yet.",
  "Ask [Name] what's been new in their world lately.",
  "Send [Name] a kind word - small gestures build real connection.",
  "Reach out to [Name] just to say hi - it's always the right time.",
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
  "international friend": [
    "Ask [Name] when they started feeling at home in their new city.",
    "Ask [Name] if there's something they miss about home that surprised them.",
    "Tell [Name] that whenever they feel lonely, you're always here to talk.",
    "Ask [Name] what's a random thing from home they didn't expect to miss.",
    "Ask [Name] what's surprised them most about living where they do.",
    "Tell [Name] about something small that made you think of them this week.",
    "Send [Name] a message - I was just thinking about you and wanted to say hi.",
    "Jump on a FaceTime with [Name] - a real conversation is long overdue.",
    "Schedule a video call with [Name] to properly catch up.",
    "Send [Name] a voice note - your voice means more than a text.",
    "FaceTime [Name] out of the blue - they'll love to see your face.",
    "Ask [Name] if they're free for a video call this week.",
    "Next time you're in the same city as [Name], make a plan - put a date on the calendar.",
    "Start thinking about a trip to visit [Name] - even floating the idea will mean a lot.",
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
      callPrompts = getSyncedList("circle1Call", CIRCLE_1_CALL_PROMPTS);
      textPrompts = getSyncedList("circle1Text", CIRCLE_1_TEXT_PROMPTS);
      hangoutPrompts = getSyncedList("circle1Hangout", CIRCLE_1_HANGOUT_PROMPTS);
      break;
    case 2:
      callPrompts = getSyncedList("circle2Call", CIRCLE_2_CALL_PROMPTS);
      textPrompts = getSyncedList("circle2Text", CIRCLE_2_TEXT_PROMPTS);
      hangoutPrompts = getSyncedList("circle2Hangout", CIRCLE_2_HANGOUT_PROMPTS);
      break;
    case 3:
      callPrompts = getSyncedList("circle3Call", CIRCLE_3_CALL_PROMPTS);
      textPrompts = getSyncedList("circle3Text", CIRCLE_3_TEXT_PROMPTS);
      hangoutPrompts = getSyncedList("circle3Hangout", CIRCLE_3_HANGOUT_PROMPTS);
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
  const isInternationalFriend = options?.labels?.some(
    (l) => l.toLowerCase().trim() === "international friend"
  ) ?? false;

  const tagged = buildTaggedPrompts(circleLevel);
  let allPrompts: string[];
  if (isInternationalFriend) {
    // Reduce hangout weight to ~20%: keep all call/text, randomly sample hangout prompts
    const nonHangout = tagged.filter((t) => t.actionType !== "hangout");
    const hangoutPool = shuffleArray(tagged.filter((t) => t.actionType === "hangout"));
    // Target ~20% hangout: nonHangout * 0.25 gives hangout/(hangout+nonHangout) ≈ 20%
    const targetHangoutCount = Math.max(1, Math.round(nonHangout.length * 0.25));
    const sampledHangout = hangoutPool.slice(0, targetHangoutCount);
    allPrompts = [...nonHangout.map((t) => t.text), ...sampledHangout.map((t) => t.text)];
  } else {
    allPrompts = tagged.map((t) => t.text);
  }

  const universalList = getSyncedList("universal", UNIVERSAL_PROMPTS);
  allPrompts.push(...universalList);
  universalList.forEach((p) => taggedPromptCache.set(p, "text"));

  if (options?.isOverdue) {
    const overdueList = getSyncedList("overdue", OVERDUE_PROMPTS);
    allPrompts.push(...overdueList);
    overdueList.forEach((p) => taggedPromptCache.set(p, "text"));
  }

  if (options?.hasBirthdaySoon) {
    const birthdayList = getSyncedList("birthday", BIRTHDAY_PROMPTS);
    allPrompts.push(...birthdayList);
    birthdayList.forEach((p) => taggedPromptCache.set(p, "text"));
  }

  const activeInterestPrompts = getSyncedRecord("interestPrompts", INTEREST_PROMPTS);
  const interestPrompts: string[] = [];
  interests.forEach((interest) => {
    const key = interest.toLowerCase().trim();
    if (activeInterestPrompts[key]) {
      activeInterestPrompts[key].forEach((p) => {
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

  const activeLabelPrompts = getSyncedRecord("labelPrompts", LABEL_PROMPTS);
  if (options?.labels) {
    options.labels.forEach((label) => {
      const key = label.toLowerCase().trim();
      if (activeLabelPrompts[key]) {
        activeLabelPrompts[key].forEach((p) => {
          allPrompts.push(p);
          if (!taggedPromptCache.has(p)) {
            const lower = p.toLowerCase();
            if (lower.includes("hangout") || lower.includes("invite") || lower.includes("dinner") || lower.includes("outing") || lower.includes("trip") || lower.includes("collaboration") || lower.includes("class") || lower.includes("lunch") || lower.includes("coffee break")) {
              taggedPromptCache.set(p, "hangout");
            } else if (lower.includes("call") || lower.includes("voice") || lower.includes("facetime") || lower.includes("video call")) {
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

  if (lower.includes("voice note") || lower.includes("phone call") || lower.includes("call") || lower.includes("facetime") || lower.includes("video call")) {
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
  "Mentor", "Mentee", "International Friend",
];
