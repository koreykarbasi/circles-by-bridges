import React, { useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import Colors from "@/constants/colors";

interface QuickPickOption {
  label: string;
  getDate: (currentLastContacted?: string | null) => Date;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const C1_C2_OPTIONS: QuickPickOption[] = [
  { label: "Today", getDate: () => new Date() },
  { label: "This week", getDate: () => daysAgo(4) },
  { label: "This month", getDate: () => daysAgo(21) },
  {
    label: "Longer",
    getDate: (currentLastContacted) => {
      const sixWeeksAgo = daysAgo(42);
      if (currentLastContacted) {
        const current = new Date(currentLastContacted);
        if (!isNaN(current.getTime()) && current < sixWeeksAgo) return current;
      }
      return sixWeeksAgo;
    },
  },
];

const C3_OPTIONS: QuickPickOption[] = [
  { label: "This week", getDate: () => daysAgo(4) },
  { label: "This month", getDate: () => daysAgo(21) },
  { label: "This quarter", getDate: () => daysAgo(49) },
  {
    label: "Longer",
    getDate: (currentLastContacted) => {
      const fourMonthsAgo = daysAgo(120);
      if (currentLastContacted) {
        const current = new Date(currentLastContacted);
        if (!isNaN(current.getTime()) && current < fourMonthsAgo) return current;
      }
      return fourMonthsAgo;
    },
  },
];

interface QuickPickRowProps {
  circleLevel: 1 | 2 | 3;
  currentLastContacted?: string | null;
  onSelect: (date: Date) => void;
}

export function QuickPickRow({ circleLevel, currentLastContacted, onSelect }: QuickPickRowProps) {
  const options = circleLevel === 3 ? C3_OPTIONS : C1_C2_OPTIONS;

  const handlePress = useCallback(
    (opt: QuickPickOption) => {
      const date = opt.getDate(currentLastContacted);
      onSelect(date);
    },
    [currentLastContacted, onSelect],
  );

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>When did you last speak?</Text>
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
  label: {
    fontSize: 11,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    letterSpacing: 0.2,
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
