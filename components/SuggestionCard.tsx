import React, { useCallback, useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { router } from "expo-router";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, runOnJS, Easing } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { NoPhoneSheet, type ExtraContactData } from "./NoPhoneSheet";

interface SuggestionCardProps {
  contactId: string;
  contactName: string;
  avatarColor: string;
  photoUri?: string | null;
  phone?: string | null;
  prompt: string;
  type: "call" | "text" | "hangout";
  circleLevel: 1 | 2 | 3;
  urgency?: "overdue" | "soon" | "ok";
  birthdayLabel?: string;
  lastContactedLabel?: string;
  interests?: string[];
  labels?: string[];
  daysSinceContact?: number | null;
  hasBirthdaySoon?: boolean;
  onDone: () => void;
  onRefresh: () => void;
  onCopyText?: () => void;
  onCopied?: () => void;
  onPlanHangout?: () => void;
  onSaveContactData?: (data: { phone: string; birthday?: string; photoUri?: string }) => Promise<void> | void;
}

const TYPE_CONFIG = {
  call: { icon: "call-outline" as const, label: "Call" },
  text: { icon: "chatbubble-outline" as const, label: "Text" },
  hangout: { icon: "people-outline" as const, label: "Hang out" },
};

const URGENCY_CONFIG = {
  overdue: { color: Colors.danger, label: "Overdue" },
  soon: { color: Colors.warning, label: "Due soon" },
  ok: { color: Colors.success, label: "On track" },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const PROMPT_SMS_MAP: Record<string, string> = {
  // ── Circle 1 Text ──────────────────────────────────────────────────────────
  "Tell [Name] something you deeply appreciate about who they are.":
    "Hey [Name]! Randomly thought of you today — there's something I genuinely appreciate about who you are that I don't say enough. [fill in what you appreciate].",
  "Tell [Name] one way they've helped you grow.":
    "Hey [Name]! Had a random thought about you today — you've actually helped me grow in a real way and I don't think I've ever told you that properly. [fill in how].",
  "Send [Name] a reminder of one of your favorite shared memories.":
    "Hey [Name]! Randomly thought of you — came across something that reminded me of one of my favourite memories of us. [fill in the memory]. Those were good times.",
  "What's something you admire about how [Name] handles challenges?":
    "Hey [Name]! Randomly thought of you today — I genuinely admire how you handle hard things. It's something I don't say enough.",
  "When's the last time you made [Name] laugh? Do it again.":
    "Hey [Name]! Randomly thought of you and wanted to put a smile on your face. [fill in the funny thing / attach the meme].",
  "Send them a 'just because' message: no reason, just love.":
    "Hey [Name]! No particular reason — just wanted to say I'm really glad you're in my life.",
  "What's something [Name] does that makes you feel safe? Tell them.":
    "Hey [Name]! Randomly thought of you — there's something you do that genuinely makes me feel safe and I've never actually told you. [fill in what it is].",
  "Share a vulnerable thought with [Name] - they can handle it.":
    "Hey [Name]! Randomly thought of you and wanted to share something I've been sitting with. [fill in your vulnerable thought].",
  "Tell [Name] about a moment recently where you thought of them.":
    "Hey [Name]! Had a moment recently where you came to mind — [fill in the moment]. Anyway, hope you're doing well!",
  "Ask [Name] what's been on their heart lately.":
    "Hey [Name]! Randomly thought of you — what's been on your heart lately? Would love to hear.",
  "Tell [Name]: I don't say this enough, but I'm really glad you're in my life.":
    "Hey [Name]! I don't say this enough, but I'm really glad you're in my life.",
  "Ask [Name] what they need most right now - and really mean it.":
    "Hey [Name]! Randomly thought of you — what do you need most right now? I genuinely mean that.",
  "Tell [Name] one thing you hope never changes about them.":
    "Hey [Name]! Randomly thought of you and realised there's something about you I hope never changes. [fill in what you hope stays the same].",
  "Tell [Name] that you admire how they show up for others.":
    "Hey [Name]! Randomly thought of you today — I genuinely admire how you show up for the people around you. It doesn't go unnoticed.",
  "Ask [Name] what they've been learning about themselves lately.":
    "Hey [Name]! Had a random question for you — what have you been learning about yourself lately? Curious.",
  "Ask [Name] what they're most excited about right now.":
    "Hey [Name]! Randomly thought of you today — what are you most excited about right now?",
  "Ask [Name] what part of life has surprised them the most lately.":
    "Hey [Name]! Randomly thought of you — what part of life has surprised you the most lately? Would love to hear.",

  // ── Circle 2 Text ──────────────────────────────────────────────────────────
  "Tell [Name] something you admire about how they live their life.":
    "Hey [Name]! Randomly thought of you today — there's something I genuinely admire about how you live your life. [fill in what you admire].",
  "Remind [Name] of a time they made your day better.":
    "Hey [Name]! Randomly thought of you — remember [fill in the time]? You really made my day better. Hope things are going great.",
  "Send a message: 'I've been thinking about you lately - how've you been?'":
    "Hey [Name]! Randomly thought of you today — how've you been? Would love to catch up.",
  "Tell [Name] you're proud of them for something (big or small).":
    "Hey [Name]! Randomly thought of you and wanted to say I'm genuinely proud of you — [fill in what specifically]. Keep going.",
  "Ask [Name] what's bringing them joy right now.":
    "Hey [Name]! Randomly thought of you today — what's been bringing you joy lately? Would love to hear.",
  "Send [Name] a photo that reminds you of a good time together.":
    "Hey [Name]! Came across this and it immediately reminded me of a great time we had.",
  "Ask [Name] for advice on something - it shows you value their opinion.":
    "Hey [Name]! Randomly thought of you — I'd love your take on something when you have a minute. I really value your perspective.",
  "Share something new you've learned with [Name].":
    "Hey [Name]! Randomly thought of you — came across something interesting recently and you were the first person I wanted to share it with. [fill in what you learned].",
  "Ask [Name] what's been making them happy lately.":
    "Hey [Name]! Randomly thought of you today — what's been making you happy lately?",
  "Tell [Name] you're thinking of them and hope things are going well.":
    "Hey [Name]! Randomly thought of you today — hope things are going really well.",
  "Ask [Name] something genuine: what are they figuring out right now?":
    "Hey [Name]! Had a genuine question for you — what are you figuring out right now? Would love to hear what's on your mind.",
  "Send [Name] a word of encouragement about something they're working through.":
    "Hey [Name]! Randomly thought of you and wanted to send some encouragement — whatever you're working through right now, you've got this.",
  "Tell [Name] specifically what you value about their friendship.":
    "Hey [Name]! Randomly thought of you today and realised I don't tell you enough what I genuinely value about your friendship. [fill in what you value].",
  "Tell [Name] that you've been rooting for them quietly.":
    "Hey [Name]! Just wanted you to know I've been quietly rooting for you. Hope things are going great.",
  "Ask [Name] how they're really doing - not the polished version.":
    "Hey [Name]! Randomly thought of you — how are you actually doing? Not the polished version, genuinely asking.",
  "Send [Name] a genuine compliment about something you've noticed.":
    "Hey [Name]! Randomly thought of you today — I've been meaning to say something: [fill in the genuine compliment you've noticed].",
  "Ask [Name] what's something they wish they had more time for.":
    "Hey [Name]! Randomly thought of you — what's something you wish you had more time for these days?",

  // ── Circle 3 Text ──────────────────────────────────────────────────────────
  "Tell [Name] something you admire from afar - a quality or habit.":
    "Hey [Name]! Randomly thought of you today — there's something I genuinely admire about you. [fill in the quality or habit].",
  "React to their recent story or post with something thoughtful.":
    "Hey [Name]! Saw your recent post and it genuinely resonated with me. [fill in your reaction].",
  "Send [Name] a relevant article, song, or meme that reminded you of them.":
    "Hey [Name]! Came across this and immediately thought of you — had to share.",
  "Check in: 'Hey, it's been a minute - want to catch up sometime soon?'":
    "Hey [Name]! It's been a minute — want to catch up sometime soon?",
  "Ask what's new in their world and actually listen.":
    "Hey [Name]! Randomly thought of you — what's new in your world lately?",
  "Congratulate [Name] on a recent milestone or life event.":
    "Hey [Name]! Heard about [fill in milestone] — couldn't be happier for you. Congrats!",
  "Forward [Name] an opportunity you think they'd be interested in.":
    "Hey [Name]! Came across something and immediately thought of you — think this could be right up your alley. [fill in / attach the opportunity].",
  "Send [Name] a message just to let them know you're thinking of them.":
    "Hey [Name]! No reason at all — just wanted to say hi and hope you're doing well.",
  "Tell [Name] something genuine you noticed or admire about who they are.":
    "Hey [Name]! Randomly thought of you — there's something I've genuinely noticed about you that I've never actually said. [fill in what you admire].",
  "Check in with [Name] - no agenda, just a moment of presence.":
    "Hey [Name]! No particular agenda — just wanted to check in and see how you're doing.",
  "Send [Name] something small that made you think of them this week.":
    "Hey [Name]! Came across this and it reminded me of you — had to send it along.",
  "Drop [Name] a short message - they don't need a reason to hear from you.":
    "Hey [Name]! Just wanted to say hi — hope things are going well.",
  "Tell [Name] something you noticed about them that you haven't said yet.":
    "Hey [Name]! Randomly thought of you today — there's something I've noticed about you that I've never actually said. [fill in what you noticed].",
  "Ask [Name] what's been new in their world lately.":
    "Hey [Name]! Randomly thought of you — what's been new in your world lately?",
  "Send [Name] a kind word - small gestures build real connection.":
    "Hey [Name]! Randomly thought of you today and just wanted to say — you're someone I'm genuinely glad to know.",
  "Reach out to [Name] just to say hi - it's always the right time.":
    "Hey [Name]! Just wanted to say hi — hope things are going really well.",

  // ── Universal ──────────────────────────────────────────────────────────────
  "What's a compliment you haven't said out loud to [Name] yet?":
    "Hey [Name]! Randomly thought of you today — there's a genuine compliment I've been meaning to say: [fill in the compliment].",
  "Which friend would love to hear a random thank-you from you today?":
    "Hey [Name]! Just wanted to say thank you — genuinely. You mean more than I probably show.",
  "Who's overdue for a celebration? Send some encouragement.":
    "Hey [Name]! Randomly thought of you today and wanted to send some encouragement — you're doing great things.",

  // ── Birthday ───────────────────────────────────────────────────────────────
  "[Name]'s birthday is coming up! Plan something special.":
    "Hey [Name]! Your birthday is coming up and I didn't want to let it pass by — hope you have the most amazing day!",
  "Start thinking about what would make [Name]'s birthday memorable.":
    "Hey [Name]! Your birthday is just around the corner — wanted to reach out before it got here. Hope it's a great one!",
  "Set a reminder to wish [Name] happy birthday - make it personal, not generic.":
    "Hey [Name]! I know your birthday is coming up and I wanted to say something genuine — hope you have an incredible day.",
  "[Name]'s birthday is soon. A heartfelt voice note goes a long way.":
    "Hey [Name]! Just thinking about your upcoming birthday — hope you have the most wonderful day.",

  // ── Overdue ────────────────────────────────────────────────────────────────
  "It's been a while since you reached out to [Name]. A quick message can reignite the connection.":
    "Hey [Name]! It's been way too long — had to reach out. How have you been?",
  "Don't let too much time pass - send [Name] a quick 'thinking of you' today.":
    "Hey [Name]! Randomly thought of you today and didn't want to let more time pass without saying hi. Hope you're doing well!",
  "[Name] might be wondering where you've been. Break the silence with something genuine.":
    "Hey [Name]! I know it's been a while — just wanted to break the silence and say hi. How are things?",
  "Reconnecting with [Name] doesn't have to be complicated. Just say hi.":
    "Hey [Name]! Just wanted to say hi — it's been too long. Hope everything is going great.",

  // ── Interest prompts (text-type) ───────────────────────────────────────────
  "Ask how their training is going":
    "Hey [Name]! Randomly thought of you — how's the training been going lately?",
  "Share a new exercise or routine you discovered":
    "Hey [Name]! Came across a new routine recently and immediately thought of you — had to share. [fill in the exercise or routine].",
  "Ask them to share their latest recipe":
    "Hey [Name]! Randomly thought of you — what have you been cooking lately? Would love to hear your latest recipe.",
  "Send them a recipe you think they'd love":
    "Hey [Name]! Came across a recipe recently and immediately thought of you — had to send it along. [fill in / attach the recipe].",
  "Share a song that reminded you of them":
    "Hey [Name]! Heard this song and it immediately reminded me of you — had to share. [fill in / attach the song].",
  "Ask what they've been listening to lately":
    "Hey [Name]! Randomly thought of you — what have you been listening to lately?",
  "Ask about their next trip plans":
    "Hey [Name]! Randomly thought of you — any trips coming up? Would love to hear what you're planning.",
  "Share a travel destination you think they'd love":
    "Hey [Name]! Came across this place and immediately thought you'd love it. [fill in the destination].",
  "Reminisce about a trip you took together":
    "Hey [Name]! Randomly thought about our trip together — such good memories. Hope you're doing well!",
  "Ask what they've been playing lately":
    "Hey [Name]! Randomly thought of you — what have you been playing lately?",
  "Share a game you think they'd enjoy":
    "Hey [Name]! Came across this game and immediately thought of you — think you'd love it. [fill in the game].",
  "Ask what book they're reading now":
    "Hey [Name]! Randomly thought of you — what are you reading right now?",
  "Share a book recommendation":
    "Hey [Name]! Just finished something I think you'd love — had to pass it along. [fill in the book title].",
  "Ask to see what they've been creating lately":
    "Hey [Name]! Randomly thought of you — what have you been creating lately? Would love to see.",
  "Share an exhibit or gallery you think they'd enjoy":
    "Hey [Name]! Came across this exhibit and immediately thought of you — think you'd love it. [fill in the details].",
  "Tell them you admire their creative work":
    "Hey [Name]! Randomly thought of you today — I genuinely admire your creative work. It's something special.",
  "Ask if they caught the latest game":
    "Hey [Name]! Randomly thought of you — did you catch the latest game? What did you think?",
  "Check in on their team's season":
    "Hey [Name]! Randomly thought of you — how's the season going for your team?",
  "Share an interesting tech article or tool":
    "Hey [Name]! Came across something in the tech space and immediately thought of you — had to share. [fill in / attach].",
  "Ask what projects they're working on":
    "Hey [Name]! Randomly thought of you — what projects have you been working on lately?",
  "Discuss a new tech trend with them":
    "Hey [Name]! Randomly thought of you — have you been following [fill in the tech trend]? Would love to get your take.",
  "Share a beautiful spot you discovered":
    "Hey [Name]! Discovered this amazing spot recently and immediately thought of you — you'd love it. [fill in the location].",

  // ── Label prompts: childhood friend ───────────────────────────────────────
  "Reminisce about a memory from growing up with [Name].":
    "Hey [Name]! Randomly thought about when we were kids — [fill in the memory]. Those were good times. Hope you're doing well!",
  "Ask [Name] if they've been back to your old neighborhood.":
    "Hey [Name]! Randomly thought of you — have you been back to our old neighbourhood lately? Would love to know.",
  "Send [Name] a throwback photo from when you were kids.":
    "Hey [Name]! Found this old photo and immediately thought of you — had to share.",
  "Ask [Name] if they still keep in touch with anyone else from back then.":
    "Hey [Name]! Randomly thought of you — do you still keep in touch with anyone else from back then? Curious how everyone's doing.",

  // ── Label prompts: college friend ─────────────────────────────────────────
  "Remind [Name] of a ridiculous thing you did in college.":
    "Hey [Name]! Randomly thought about [fill in the ridiculous college memory] — couldn't stop laughing. Hope you're doing well!",
  "Ask [Name] how their career has evolved since graduation.":
    "Hey [Name]! Randomly thought of you — how has your career evolved since we graduated? Would love to hear what you've been up to.",
  "Send [Name] a memory from your college days together.":
    "Hey [Name]! Came across something that brought back [fill in the college memory] — had to reach out. Hope you're doing great!",
  "Ask [Name] if they're going to any upcoming alumni events.":
    "Hey [Name]! Randomly thought of you — are you going to any alumni events coming up? Would be great to reconnect.",

  // ── Label prompts: work friend ────────────────────────────────────────────
  "Check in with [Name] about how their job is going.":
    "Hey [Name]! Randomly thought of you — how are things going at work these days?",
  "Ask [Name] if they've had any exciting projects lately.":
    "Hey [Name]! Randomly thought of you — had any exciting projects lately? Would love to hear what you've been working on.",
  "Share a professional article or opportunity with [Name].":
    "Hey [Name]! Came across something I thought you'd find useful — had to share. [fill in / attach the article or opportunity].",

  // ── Label prompts: neighbor ───────────────────────────────────────────────
  "Ask [Name] if they need anything from the store.":
    "Hey [Name]! Heading to the store soon — need anything while I'm out?",
  "Suggest a neighborhood walk with [Name].":
    "Hey [Name]! Randomly thought of you — want to go for a walk around the neighbourhood sometime soon?",
  "Check in on [Name] - being a good neighbor goes a long way.":
    "Hey [Name]! Just wanted to check in — how have things been going?",

  // ── Label prompts: family friend ──────────────────────────────────────────
  "Ask [Name] how their family is doing.":
    "Hey [Name]! Randomly thought of you — how's the family doing these days?",
  "Share a family update with [Name] and ask about theirs.":
    "Hey [Name]! Randomly thought of you and wanted to catch up. How's your family been doing? [fill in your own update].",

  // ── Label prompts: gym buddy ──────────────────────────────────────────────
  "Ask [Name] about their latest workout routine.":
    "Hey [Name]! Randomly thought of you — what does your workout routine look like these days?",
  "Challenge [Name] to a fitness goal together.":
    "Hey [Name]! Randomly thought of you — want to set a fitness challenge together? Could be fun.",
  "Check in on [Name]'s fitness progress.":
    "Hey [Name]! Randomly thought of you — how's the training been going?",

  // ── Label prompts: travel buddy ───────────────────────────────────────────
  "Share a travel article or destination idea with [Name].":
    "Hey [Name]! Came across this destination and immediately thought of you — you'd love it. [fill in / attach].",
  "Reminisce about your favorite trip together with [Name].":
    "Hey [Name]! Randomly thought about our favourite trip together — such good memories. Hope you're doing well!",
  "Ask [Name] where they want to go next.":
    "Hey [Name]! Randomly thought of you — where do you want to travel next? I've been thinking about it too.",

  // ── Label prompts: family ─────────────────────────────────────────────────
  "Tell [Name] something specific you're grateful for about who they are.":
    "Hey [Name]! Randomly thought of you today — there's something specific I'm genuinely grateful for about who you are and I don't say it enough. [fill in what you're grateful for].",
  "Ask [Name] how they're really doing - not just the surface version.":
    "Hey [Name]! Just wanted to check in properly — how are you actually doing? Not the surface version.",
  "Share a family memory with [Name] and ask what they remember about it.":
    "Hey [Name]! Randomly thought about [fill in the family memory] — what do you remember about that? Would love to reminisce.",
  "Tell [Name] something you've always admired about them but never said out loud.":
    "Hey [Name]! Randomly thought of you today — there's something I've always admired about you that I've never actually said out loud. [fill in what you admire].",
  "Ask [Name] what they need most from you right now.":
    "Hey [Name]! Just checking in — what do you need most from me right now? Genuinely asking.",
  "Check in on [Name] - family deserves the same intention as any close friend.":
    "Hey [Name]! Just wanted to check in — how have things been going? Would love to catch up properly.",
  "Tell [Name] that you love them and that you mean it.":
    "Hey [Name]! Just wanted to say — I love you and I mean it. Hope you know that.",

  // ── Label prompts: mentor ─────────────────────────────────────────────────
  "Thank [Name] for something specific they've taught you.":
    "Hey [Name]! Randomly thought of you today — I wanted to say thank you for something specific you taught me. [fill in what they taught you]. It's genuinely stayed with me.",
  "Ask [Name] for guidance on a challenge you're facing.":
    "Hey [Name]! Randomly thought of you — I've been working through something and would genuinely value your perspective. [fill in the challenge]. Any thoughts?",
  "Update [Name] on your progress - they'd love to hear it.":
    "Hey [Name]! Wanted to give you an update on how things have been going since we last caught up. [fill in your progress]. A lot of that is down to your guidance.",
  "Share a win with [Name] and credit their influence.":
    "Hey [Name]! Had a win recently I wanted to share with you — [fill in the win]. Honestly, your influence had a lot to do with it.",

  // ── Label prompts: international friend ───────────────────────────────────
  "Ask [Name] when they started feeling at home in their new city.":
    "Hey [Name]! Randomly thought of you — when did you start feeling at home in your city? Curious what that moment was like for you.",
  "Ask [Name] if there's something they miss about home that surprised them.":
    "Hey [Name]! Randomly thought of you — is there something you miss about home that you didn't expect to miss? Would love to hear.",
  "Tell [Name] that whenever they feel lonely, you're always here to talk.":
    "Hey [Name]! Just wanted to say — whenever you feel lonely or just need to talk, I'm always here. No agenda, just that.",
  "Ask [Name] what's a random thing from home they didn't expect to miss.":
    "Hey [Name]! Randomly thought of you — what's the most random thing from home you didn't expect to miss? I'm curious.",
  "Ask [Name] what's surprised them most about living where they do.":
    "Hey [Name]! Randomly thought of you — what's surprised you most about living where you do? Would love to hear.",
  "Tell [Name] about something small that made you think of them this week.":
    "Hey [Name]! Randomly thought of you this week — [fill in the small thing]. Hope you're doing well.",
  "Send [Name] a message - I was just thinking about you and wanted to say hi.":
    "Hey [Name]! No particular reason — just wanted to say hi and hope you're doing great.",
};

function reasonFromPrompt(prompt: string, interests: string[], labels: string[]): string {
  const lower = prompt.toLowerCase();

  // Season / chapter of life
  if (lower.includes("season of life") || lower.includes("this season") || lower.includes("chapter of life")) {
    return pick([
      "What's been different or special about this season of life for you?",
      "I've been curious — what's this chapter been like for you lately?",
    ]);
  }

  // Compliment — hasn't been said yet
  if (lower.includes("compliment") && (lower.includes("haven't said") || lower.includes("havent said") || lower.includes("out loud") || lower.includes("noticed"))) {
    return pick([
      "I wanted to share something I don't say enough — I genuinely admire how you show up.",
      "There's something I've been meaning to say: you're someone I really look up to.",
      "I realized I don't say this enough — you're a genuinely impressive person.",
    ]);
  }
  if (lower.includes("compliment")) {
    return "I wanted to pass along a genuine compliment — I think you're doing great.";
  }

  // Appreciation / gratitude / value
  if (lower.includes("appreciat") || lower.includes("grateful") || lower.includes("thankful") || lower.includes("value about")) {
    return pick([
      "Just wanted to say I appreciate you more than I probably show.",
      "I've been meaning to say how much I appreciate having you around.",
    ]);
  }

  // Admiration
  if (lower.includes("admire")) {
    return pick([
      "There's something I genuinely admire about you that I don't say enough.",
      "I've been meaning to tell you — I really admire how you handle things.",
    ]);
  }

  // Proud / rooting for them
  if (lower.includes("proud of") || lower.includes("rooting for")) {
    return pick([
      "Just wanted to say I'm proud of you — you're doing great things.",
      "Wanted to let you know I've been rooting for you. How are things going?",
    ]);
  }

  // Helped you grow / impact
  if (lower.includes("helped") && lower.includes("grow")) {
    return pick([
      "Just wanted to say — you've had a real positive impact on me.",
      "I've been meaning to say how much you've helped me grow.",
    ]);
  }

  // Shared memories / throwback
  if (lower.includes("memory") || lower.includes("memories") || lower.includes("remember") || lower.includes("reminiscing") || lower.includes("throwback") || lower.includes("shared memory")) {
    return pick([
      "I was just thinking about one of our memories and it put a big smile on my face.",
      "Something reminded me of a great time we had — hope you're doing well!",
      "Had a flashback to one of our old memories recently. How have you been?",
    ]);
  }

  // Laugh / funny / meme
  if (lower.includes("laugh") || lower.includes("funny") || lower.includes("joke") || lower.includes("meme") || lower.includes("ridiculous")) {
    return pick([
      "Came across something that made me laugh and instantly thought of you.",
      "Saw something today that you would absolutely find hilarious.",
    ]);
  }

  // Something that made you think of them
  if (lower.includes("made you think of them") || lower.includes("think they'd") || lower.includes("reminded you of") || lower.includes("small that made") || lower.includes("thought they'd")) {
    return pick([
      "Came across something this week that made me think of you.",
      "Saw something recently that you'd love — had to reach out.",
    ]);
  }

  // Just because / no reason / say hi
  if (lower.includes("just because") || lower.includes("no reason") || lower.includes("just to say hi") || lower.includes("always the right time") || lower.includes("don't need a reason")) {
    return pick([
      "No particular reason — just wanted to say hi. Hope you're doing well!",
      "Just dropping by to say hi. Hope things are great!",
    ]);
  }

  // What's been on their heart / mind
  if (lower.includes("on their heart") || lower.includes("on your heart")) {
    return "How are you doing? What's been on your mind lately?";
  }

  // What they've been learning about themselves
  if (lower.includes("learning about themselves") || lower.includes("learning about yourself")) {
    return pick([
      "What have you been learning about yourself lately?",
      "Curious — what's been teaching you the most about yourself recently?",
    ]);
  }

  // What are they figuring out / working on
  if (lower.includes("figuring out") || lower.includes("working through") || lower.includes("working on")) {
    return pick([
      "What are you figuring out these days?",
      "How are things going? What have you been working on lately?",
    ]);
  }

  // What's bringing them joy / making them happy
  if (lower.includes("joy") || lower.includes("making them happy") || lower.includes("happy lately") || lower.includes("bringing them joy") || lower.includes("brings you joy")) {
    return pick([
      "What's been bringing you joy lately?",
      "What's been making you happy these days?",
    ]);
  }

  // What they wish they had more time for
  if (lower.includes("more time for") || lower.includes("wish they had")) {
    return "What's something you wish you had more time for these days?";
  }

  // What are they looking forward to
  if (lower.includes("looking forward to") || lower.includes("excited about")) {
    return pick([
      "What are you looking forward to lately?",
      "What's something you're excited about right now?",
    ]);
  }

  // Harder than expected
  if (lower.includes("harder than expected")) {
    return "What's been harder than expected for you lately? Would love to hear how things are going.";
  }

  // How they're really doing (beyond the surface)
  if (lower.includes("really doing") || lower.includes("not the surface") || lower.includes("beyond the surface") || lower.includes("polished version") || lower.includes("really mean it")) {
    return pick([
      "How are you actually doing these days?",
      "Been meaning to check in — how are you really doing?",
    ]);
  }

  // Catch up / what's new
  if (lower.includes("what's new") || lower.includes("whats new") || lower.includes("catch up") || lower.includes("been up to") || lower.includes("their world") || lower.includes("what's going on")) {
    return pick([
      "What's new with you? Would love to catch up!",
      "It's been a bit — what have you been up to lately?",
      "What's going on in your world these days?",
    ]);
  }

  // Celebration / milestone / encouragement
  if (lower.includes("celebrat") || lower.includes("milestone") || lower.includes("congratulat") || lower.includes("encouragement") || lower.includes("overdue for a celebration")) {
    return pick([
      "I feel like you deserve some recognition — you've been doing great things.",
      "Just wanted to send some good energy your way. Hope things are going well!",
    ]);
  }

  // Advice / value their opinion
  if (lower.includes("advice") || lower.includes("value their opinion")) {
    return "I'd love your take on something when you have a minute — I really value your perspective.";
  }

  // What they need / check-in style
  if (lower.includes("what they need") || lower.includes("what do you need")) {
    return pick([
      "How are things going? What's keeping you busy these days?",
      "Just checking in — how have you been?",
    ]);
  }

  // Article / opportunity / something new discovered
  if (lower.includes("article") || lower.includes("opportunity") || lower.includes("discovered") || lower.includes("new recipe") || lower.includes("new spot") || lower.includes("share something new")) {
    return "Came across something I thought you'd find interesting — had to share!";
  }

  // Plans / hang out / get together
  if (lower.includes("plan") || lower.includes("hang") || lower.includes("get together") || lower.includes("spontaneous") || lower.includes("micro-hangout") || lower.includes("make plans")) {
    return pick([
      "We should actually make plans to hang out soon — what does your schedule look like?",
      "Been meaning to suggest getting together. What do you think?",
    ]);
  }

  // Birthday
  if (lower.includes("birthday")) {
    return "Your birthday is coming up and I didn't want to let it slip by — hope you have an amazing day!";
  }

  // Travel / adventure
  if (lower.includes("trip") || lower.includes("travel") || lower.includes("adventure")) {
    return pick([
      "What adventures have you been on lately?",
      "Any fun trips coming up? Would love to hear what you've been up to.",
    ]);
  }

  // Work / career / projects
  if (lower.includes("work") || lower.includes("career") || lower.includes("job") || lower.includes("project")) {
    return pick([
      "How's work going for you these days?",
      "How are things going with your projects lately?",
    ]);
  }

  // Food / cooking / coffee
  if (lower.includes("recipe") || lower.includes("cook") || lower.includes("food") || lower.includes("lunch") || lower.includes("dinner") || lower.includes("coffee")) {
    return "I tried something new recently and it made me think of you. How have you been?";
  }

  // Reading / books
  if (lower.includes("read") || lower.includes("book")) {
    return "Read something recently that reminded me of you. How have you been?";
  }

  // Fitness / training / outdoors
  if (lower.includes("training") || lower.includes("workout") || lower.includes("hike") || lower.includes("run") || lower.includes("gym") || lower.includes("fitness")) {
    return pick([
      "How's the training been going?",
      "How have the workouts been lately?",
    ]);
  }

  // Music / concerts
  if (lower.includes("music") || lower.includes("concert") || lower.includes("show")) {
    return "Heard something recently that made me think of you. How have you been?";
  }

  // Contact's specific interests
  for (const interest of interests) {
    if (lower.includes(interest.toLowerCase())) {
      return pick([
        `How's the ${interest.toLowerCase()} going lately?`,
        `What's new with the ${interest.toLowerCase()}? Would love to hear.`,
      ]);
    }
  }

  // Interest-based fallback
  if (interests.length > 0) {
    return `How's the ${interests[0].toLowerCase()} going lately?`;
  }

  // Label-based fallback
  if (labels.length > 0) {
    const label = labels[0].toLowerCase();
    if (label.includes("childhood") || label.includes("college")) {
      return pick([
        "I was just thinking about some of our old memories. How have you been?",
        "Randomly thought of you and some good times we've had. Hope things are great!",
      ]);
    }
    if (label.includes("work")) {
      return "How are things going at work? Would love to catch up!";
    }
    if (label.includes("family")) {
      return "How's everything going? Would love to hear what's new with you.";
    }
    if (label.includes("neighbor")) {
      return "Just wanted to say hi and check in — how have you been?";
    }
    if (label.includes("gym") || label.includes("fitness")) {
      return "How's the training been going? Would love to hear what you've been up to.";
    }
    if (label.includes("travel")) {
      return "What adventures have you been on lately? Would love to hear!";
    }
  }

  return pick([
    "Just wanted to check in — how have you been?",
    "Hope things are going well! What's new with you?",
    "Just thought of you and wanted to say hi. How are things?",
  ]);
}

export function getTextCopyMessage(
  contactName: string,
  options?: {
    prompt?: string;
    interests?: string[];
    labels?: string[];
    daysSinceContact?: number | null;
    hasBirthdaySoon?: boolean;
    circleLevel?: 1 | 2 | 3;
  },
): string {
  const firstName = contactName.split(" ")[0];
  const {
    prompt = "",
    interests = [],
    labels = [],
    daysSinceContact,
    hasBirthdaySoon,
  } = options ?? {};

  if (hasBirthdaySoon) {
    return pick([
      `Hey ${firstName}! Your birthday is coming up and I didn't want to miss it. Hope you have the most amazing day!`,
      `Hey ${firstName}! Just wanted to wish you an early happy birthday. Hope it's a great one!`,
      `Hey ${firstName}! Thinking of you with your birthday around the corner. Have an incredible day!`,
    ]);
  }

  if (daysSinceContact !== null && daysSinceContact !== undefined && daysSinceContact > 45) {
    return pick([
      `Hey ${firstName}! It's been way too long. I've been meaning to reach out — how have you been?`,
      `Hey ${firstName}! Randomly thought of you. Feels like ages — how are things going?`,
      `Hey ${firstName}! It's been a while. Would love to catch up. How have you been?`,
    ]);
  }

  if (prompt) {
    const escapedName = contactName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rawKey = prompt.replace(new RegExp(escapedName, "g"), "[Name]");
    const template = PROMPT_SMS_MAP[rawKey] ?? PROMPT_SMS_MAP[prompt];
    if (template) {
      return template.replace(/\[Name\]/g, firstName);
    }
  }

  const opener = pick([
    `Hey ${firstName}!`,
    `Hey ${firstName}, hope you're doing well.`,
    `Hey ${firstName}! Just thought of you.`,
    `Hey ${firstName}, wanted to reach out.`,
  ]);
  const reason = reasonFromPrompt(prompt, interests, labels);
  return `${opener} ${reason}`;
}

function buildSmsUrl(phone: string, message: string): string {
  if (Platform.OS === "ios") {
    return `sms:${phone}&body=${message}`;
  }
  return `sms:${phone}?body=${encodeURIComponent(message)}`;
}

export function SuggestionCard({
  contactId,
  contactName,
  avatarColor,
  photoUri,
  phone,
  prompt,
  type,
  circleLevel,
  urgency = "ok",
  birthdayLabel,
  lastContactedLabel,
  interests = [],
  labels = [],
  daysSinceContact,
  hasBirthdaySoon,
  onDone,
  onRefresh,
  onCopyText,
  onCopied,
  onPlanHangout,
  onSaveContactData,
}: SuggestionCardProps) {
  const circleColor = circleLevel === 1 ? Colors.circle1 : circleLevel === 2 ? Colors.circle2 : Colors.circle3;
  const typeConfig = TYPE_CONFIG[type];
  const urgencyConfig = URGENCY_CONFIG[urgency];

  const generatedTextMessage = useMemo(
    () => getTextCopyMessage(contactName, { prompt, interests, labels, daysSinceContact, hasBirthdaySoon, circleLevel }),
    [contactName, prompt, interests, labels, daysSinceContact, hasBirthdaySoon, circleLevel],
  );

  const [phoneSheetVisible, setPhoneSheetVisible] = useState(false);
  const [phoneSheetMode, setPhoneSheetMode] = useState<"sms" | "call">("sms");

  const opacity = useSharedValue(1);
  const translateX = useSharedValue(0);
  const height = useSharedValue<number | undefined>(undefined);
  const marginBottom = useSharedValue(12);
  const refreshScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
    height: height.value,
    marginBottom: marginBottom.value,
    overflow: "hidden" as const,
  }));

  const refreshStyle = useAnimatedStyle(() => ({
    transform: [{ scale: refreshScale.value }],
  }));

  const handleDone = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withTiming(-400, { duration: 300, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(0, { duration: 300 }, () => {
      height.value = withTiming(0, { duration: 200 });
      marginBottom.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(onDone)();
      });
    });
  }, [onDone]);

  const handleRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    refreshScale.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withTiming(1.05, { duration: 150 }),
      withTiming(1, { duration: 100 }),
    );
    opacity.value = withSequence(
      withTiming(0.4, { duration: 120 }),
      withTiming(1, { duration: 200 }),
    );
    setTimeout(() => onRefresh(), 120);
  }, [onRefresh]);

  const handleCopyText = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      try { await navigator.clipboard.writeText(generatedTextMessage); } catch {}
    } else {
      try { await Clipboard.setStringAsync(generatedTextMessage); } catch {}
    }
    onCopyText?.();
    onCopied?.();
  }, [generatedTextMessage, onCopyText, onCopied]);

  const handlePlanHangout = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPlanHangout?.();
  }, [onPlanHangout]);

  const openSms = useCallback(async (phoneNumber: string) => {
    if (Platform.OS === "web") {
      try { await navigator.clipboard.writeText(generatedTextMessage); } catch {}
      onCopyText?.();
      onCopied?.();
      return;
    }
    const url = buildSmsUrl(phoneNumber, generatedTextMessage);
    try {
      await Linking.openURL(url);
    } catch {}
    onCopyText?.();
    onCopied?.();
  }, [generatedTextMessage, onCopyText, onCopied]);

  const openDialer = useCallback(async (phoneNumber: string) => {
    try {
      await Linking.openURL(`tel:${phoneNumber}`);
    } catch {}
    handleDone();
  }, [handleDone]);

  const handleMessagePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      openSms("");
    } else if (phone) {
      openSms(phone);
    } else {
      setPhoneSheetMode("sms");
      setPhoneSheetVisible(true);
    }
  }, [phone, openSms]);

  const handleCallPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (phone) {
      openDialer(phone);
    } else {
      setPhoneSheetMode("call");
      setPhoneSheetVisible(true);
    }
  }, [phone, openDialer]);

  const handlePhoneSheetConfirm = useCallback(async (resolvedPhone: string, shouldSave: boolean, extra?: ExtraContactData) => {
    setPhoneSheetVisible(false);
    if (shouldSave && onSaveContactData) {
      try {
        await onSaveContactData({ phone: resolvedPhone, birthday: extra?.birthday, photoUri: extra?.photoUri });
      } catch {}
    }
    if (phoneSheetMode === "sms") {
      await openSms(resolvedPhone);
    } else {
      await openDialer(resolvedPhone);
    }
  }, [phoneSheetMode, openSms, openDialer, onSaveContactData]);

  return (
    <>
      <Animated.View style={[styles.container, animatedStyle]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.push({ pathname: "/edit-contact", params: { id: contactId } })}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            hitSlop={4}
          >
            <Avatar name={contactName} color={avatarColor} size={42} photoUri={photoUri} />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.name} numberOfLines={1}>{contactName}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.typeBadge, { backgroundColor: circleColor + "15" }]}>
                <Ionicons name={typeConfig.icon} size={11} color={circleColor} />
                <Text style={[styles.typeText, { color: circleColor }]}>{typeConfig.label}</Text>
              </View>
              {urgency !== "ok" && (
                <View style={[styles.urgencyDot, { backgroundColor: urgencyConfig.color }]} />
              )}
              {lastContactedLabel && (
                <Text style={styles.metaText} numberOfLines={1}>{lastContactedLabel}</Text>
              )}
            </View>
          </View>
        </View>

        {birthdayLabel ? (
          <View style={styles.birthdayBanner}>
            <Ionicons name="gift-outline" size={14} color={Colors.warning} />
            <Text style={styles.birthdayText}>Birthday {birthdayLabel}</Text>
          </View>
        ) : null}

        <Text style={styles.prompt}>{prompt}</Text>

        <View style={styles.actions}>
          <Animated.View style={refreshStyle}>
            <Pressable
              onPress={handleRefresh}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="shuffle-outline" size={20} color={Colors.textSecondary} />
            </Pressable>
          </Animated.View>

          {type === "text" && (
            <>
              <Pressable
                testID="suggestion-sms-btn"
                onPress={handleMessagePress}
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.primaryLight} />
              </Pressable>
              {onCopyText && (
                <Pressable
                  testID="suggestion-copy-btn"
                  onPress={handleCopyText}
                  style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
                >
                  <Ionicons name="copy-outline" size={20} color={Colors.primaryLight} />
                </Pressable>
              )}
            </>
          )}

          {type === "call" && (
            <Pressable
              testID="suggestion-call-btn"
              onPress={handleCallPress}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="call-outline" size={20} color={Colors.primaryLight} />
            </Pressable>
          )}

          {type === "hangout" && onPlanHangout && (
            <Pressable
              onPress={handlePlanHangout}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="calendar-outline" size={20} color={Colors.primaryLight} />
            </Pressable>
          )}

          <View style={{ flex: 1 }} />

          <Pressable
            onPress={handleDone}
            style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      </Animated.View>

      <NoPhoneSheet
        visible={phoneSheetVisible}
        contactName={contactName}
        mode={phoneSheetMode}
        onConfirm={handlePhoneSheetConfirm}
        onDismiss={() => setPhoneSheetVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  headerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
  },
  urgencyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaText: {
    fontSize: 11,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    flexShrink: 1,
  },
  birthdayBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.warning + "12",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  birthdayText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.warning,
  },
  prompt: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 14,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    padding: 8,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  primaryButtonText: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
});
