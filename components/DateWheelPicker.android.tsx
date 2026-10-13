import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useThemeColors } from "@/lib/theme-context";
import { createWheelSelection } from "@/lib/android-only/wheel-selection";
import { BIRTHDAY_YEARS as YEARS, birthdayMonthDays, birthdaySelection, parseBirthdaySelection } from "@/lib/android-only/birthday-date";
import type { DateWheelPickerProps } from "./DateWheelPicker";

// Explicit extension bypasses Android resolution; all non-birthday modes use
// the untouched original implementation, without importing ourselves.
const { DateWheelPicker: OriginalPicker } =
  require("./DateWheelPicker.tsx") as typeof import("./DateWheelPicker");

const ITEM_HEIGHT = 34;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function Wheel({ items, selected, onSelect, flex, label }: {
  items: string[];
  selected: number;
  onSelect: (index: number) => void;
  flex: number;
  label: string;
}) {
  const colors = useThemeColors();
  const scroll = useRef<ScrollView>(null);
  const current = useRef({ items, onSelect, selected });
  current.current = { items, onSelect, selected };
  const preview = (index: number) => {
    if (index !== current.current.selected) {
      current.current.selected = index;
      current.current.onSelect(index);
    }
  };
  const selection = useMemo(() => createWheelSelection({
    itemHeight: ITEM_HEIGHT,
    itemCount: () => current.current.items.length,
    // Keep the visible selection current even if Confirm is tapped immediately
    // after a drag, before the quiet-scroll fallback timer fires.
    preview,
    commit: (index) => {
      scroll.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
      preview(index);
    },
  }), []);
  useEffect(() => () => selection.dispose(), [selection]);
  useEffect(() => {
    if (!selection.isMoving()) {
      scroll.current?.scrollTo({ y: selected * ITEM_HEIGHT, animated: false });
    }
  }, [selected, items.length, selection]);

  return (
    <View style={{ flex, height: ITEM_HEIGHT * 3, overflow: "hidden" }}>
      <View pointerEvents="none" style={[
        styles.highlight, { backgroundColor: colors.primary + "18" },
      ]} />
      <ScrollView
        ref={scroll}
        accessibilityLabel={label}
        testID={`android-birthday-${label.toLowerCase()}`}
        contentOffset={{ x: 0, y: selected * ITEM_HEIGHT }}
        nestedScrollEnabled
        disallowInterruption
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
        onContentSizeChange={() => {
          if (!selection.isMoving()) {
            scroll.current?.scrollTo({ y: current.current.selected * ITEM_HEIGHT, animated: false });
          }
        }}
        onScrollBeginDrag={() => selection.dragBegin()}
        onScroll={(e) => selection.scroll(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => selection.dragEnd(e.nativeEvent.contentOffset.y)}
        onMomentumScrollBegin={() => selection.momentumBegin()}
        onMomentumScrollEnd={(e) => selection.momentumEnd(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        bounces={false}
        overScrollMode="never"
      >
        {items.map((item, index) => (
          <View key={item} style={styles.item}>
            <Text numberOfLines={1} style={{
              fontFamily: index === selected ? "Nunito_700Bold" : "Nunito_400Regular",
              fontSize: 14,
              color: index === selected ? colors.text : colors.textTertiary,
              paddingHorizontal: 4,
            }}>{item}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function BirthdayPicker({ value, onChange }: DateWheelPickerProps) {
  const colors = useThemeColors();
  const parsed = parseBirthdaySelection(value);
  const [month, setMonth] = useState(parsed.month);
  const [day, setDay] = useState(parsed.day);
  // Birthdays persist as MM/DD, not a birth year. Use a leap year when reopening
  // February 29 so opening/confirming cannot silently change it to February 28.
  const [year, setYear] = useState(parsed.yearIndex);
  const previousValue = useRef(value);
  useEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;
    const match = /^(\d{1,2})\/(\d{1,2})$/.exec(value || "");
    if (!match) return;
    const next = parseBirthdaySelection(value);
    setMonth(next.month);
    setDay(next.day);
    if (Number(match[1]) === 2 && Number(match[2]) === 29) setYear(next.yearIndex);
  }, [value]);

  const days = Array.from({ length: birthdayMonthDays(month, year) }, (_, i) => String(i + 1).padStart(2, "0"));
  const selectedDay = Math.min(day, days.length - 1);
  const change = (m: number, d: number, y: number) => {
    const next = birthdaySelection(m, d, y);
    setMonth(next.month);
    setDay(next.day);
    setYear(next.yearIndex);
    previousValue.current = next.value;
    onChange(next.value);
  };
  const separator = <View style={{ width: 1, height: ITEM_HEIGHT * 3, backgroundColor: colors.borderLight }} />;
  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
      <Wheel items={MONTHS} selected={month} onSelect={(m) => change(m, selectedDay, year)} flex={2} label="Month" />
      {separator}
      <Wheel items={days} selected={selectedDay} onSelect={(d) => change(month, d, year)} flex={1} label="Day" />
      {separator}
      <Wheel items={YEARS} selected={year} onSelect={(y) => change(month, selectedDay, y)} flex={1.15} label="Year" />
    </View>
  );
}

export function DateWheelPicker(props: DateWheelPickerProps) {
  return (props.mode ?? "birthday") === "birthday"
    ? <BirthdayPicker {...props} />
    : <OriginalPicker {...props} />;
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", borderRadius: 14, borderWidth: 1, overflow: "hidden", alignItems: "center" },
  item: { height: ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
  highlight: { position: "absolute", top: ITEM_HEIGHT, height: ITEM_HEIGHT, left: 0, right: 0, borderRadius: 6 },
});
