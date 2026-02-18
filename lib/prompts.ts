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
];

const CIRCLE_2_PROMPTS = [
  "Tell [Name] something you admire about how they live their life.",
  "Remind [Name] of a time they made your day better.",
  "Send a message: 'I've been thinking about you lately - how've you been?'",
  "Share something new you've learned and invite [Name] to join you.",
  "Tell [Name] you're proud of them for something (big or small).",
  "Ask [Name] what's bringing them joy right now.",
  "Plan a micro-hangout: a walk, coffee, or phone call with [Name].",
];

const CIRCLE_3_PROMPTS = [
  "Tell [Name] something you admire from afar - a quality or habit.",
  "React to their recent story or post with something thoughtful.",
  "Send [Name] a relevant article, song, or meme that reminded you of them.",
  "Check in: 'Hey, it's been a minute - want to catch up sometime soon?'",
  "Ask what's new in their world and actually listen.",
  "Congratulate [Name] on a recent milestone or life event.",
];

const UNIVERSAL_PROMPTS = [
  "What's a compliment you haven't said out loud to [Name] yet?",
  "Which friend would love to hear a random thank-you from you today?",
  "Who's overdue for a celebration? Send some encouragement.",
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

export function getPromptsForContact(
  name: string,
  circleLevel: 1 | 2 | 3,
  interests: string[],
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

export function getRandomPrompt(
  name: string,
  circleLevel: 1 | 2 | 3,
  interests: string[],
): string {
  const prompts = getPromptsForContact(name, circleLevel, interests);
  return prompts[Math.floor(Math.random() * prompts.length)];
}

export const AVAILABLE_INTERESTS = [
  "Fitness", "Cooking", "Music", "Travel", "Gaming",
  "Reading", "Art", "Sports", "Tech", "Outdoors",
  "Photography", "Movies", "Fashion", "Yoga", "Dancing",
  "Volunteering", "Pets", "Gardening", "Writing", "Podcasts",
];
