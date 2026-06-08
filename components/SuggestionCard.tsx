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
