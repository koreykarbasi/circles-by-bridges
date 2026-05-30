import React, { useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgoRandom(min: number, max: number): Date {
  return new Date(Date.now() - randomInRange(min, max) * 24 * 60 * 60 * 1000);
}

interface Option {
  label: string;
  getDate: () => Date;
}

const CHECKIN_C1_C2: Option[] = [
  { label: "Today", getDate: () => new Date() },
  { label: "This week", getDate: () => daysAgoRandom(3, 6) },
  { label: "This month", getDate: () => daysAgoRandom(12, 24) },
  { label: "Longer", getDate: () => daysAgoRandom(35, 55) },
];

const CHECKIN_C3: Option[] = [
  { label: "This week", getDate: () => daysAgoRandom(3, 6) },
  { label: "This month", getDate: () => daysAgoRandom(12, 24) },
  { label: "This quarter", getDate: () => daysAgoRandom(55, 80) },
  { label: "Longer", getDate: () => daysAgoRandom(90, 120) },
];

const HANGOUT_C1_C2: Option[] = [
  { label: "This week", getDate: () => daysAgoRandom(3, 6) },
  { label: "This month", getDate: () => daysAgoRandom(12, 24) },
  { label: "This year", getDate: () => daysAgoRandom(60, 180) },
];

const HANGOUT_C3: Option[] = [
  { label: "This month", getDate: () => daysAgoRandom(12, 24) },
  { label: "This year", getDate: () => daysAgoRandom(60, 180) },
  { label: "Longer", getDate: () => daysAgoRandom(200, 300) },
];

interface QuickPickRowProps {
  circleLevel: 1 | 2 | 3;
  variant: "checkin" | "hangout";
  onSelect: (date: Date, label: string) => void;
  onCalendarPress?: () => void;
}

export function QuickPickRow({ circleLevel, variant, onSelect, onCalendarPress }: QuickPickRowProps) {
  let options: Option[];
  if (variant === "hangout") {
    options = circleLevel === 3 ? HANGOUT_C3 : HANGOUT_C1_C2;
  } else {
    options = circleLevel === 3 ? CHECKIN_C3 : CHECKIN_C1_C2;
  }

  const handlePress = useCallback(
    (opt: Option) => {
      const date = opt.getDate();
      onSelect(date, opt.label);
    },
    [onSelect],
  );

  const questionText = variant === "hangout"
    ? "When did you last hang out?"
    : "When did you last speak?";

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{questionText}</Text>
        {variant === "hangout" && onCalendarPress && (
          <Pressable
            onPress={onCalendarPress}
            hitSlop={6}
            style={({ pressed }) => [styles.calBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="calendar-outline" size={14} color={Colors.primaryLight} />
            <Text style={styles.calBtnText}>Plan one</Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {options.map((opt) => (
          <Pressable
            key={opt.label}
            onPress={() => handlePress(opt)}
            style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
          >
            <Text style={styles.pillText}>{opt.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 10,
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 11,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    letterSpacing: 0.2,
  },
  calBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  calBtnText: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primaryLight,
  },
  row: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 4,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillPressed: {
    backgroundColor: Colors.primary + "28",
    borderColor: Colors.primary + "60",
  },
  pillText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
});
