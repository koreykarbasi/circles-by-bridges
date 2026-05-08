import React, { useRef, useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import Colors from "@/constants/colors";

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(month1Based: number, year: number): number {
  return new Date(year, month1Based, 0).getDate();
}

function buildBirthdayYears(): string[] {
  const result: string[] = [];
  for (let y = 1940; y <= new Date().getFullYear(); y++) {
    result.push(String(y));
  }
  return result;
}

function buildDeadlineYears(): string[] {
  const result: string[] = [];
  const current = new Date().getFullYear();
  for (let y = current; y <= current + 4; y++) {
    result.push(String(y));
  }
  return result;
}

const BIRTHDAY_YEARS = buildBirthdayYears();
const DEADLINE_YEARS = buildDeadlineYears();

interface WheelColumnProps {
  items: string[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  width: number;
}

function WheelColumn({ items, selectedIndex, onIndexChange, width }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const isScrolling = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    const target = selectedIndex * ITEM_HEIGHT;
    if (!mounted.current) {
      mounted.current = true;
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: target, animated: false });
      }, 50);
    } else if (!isScrolling.current) {
      scrollRef.current?.scrollTo({ y: target, animated: true });
    }
  }, [selectedIndex]);

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isScrolling.current = false;
      const y = e.nativeEvent.contentOffset.y;
      const index = Math.round(y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(index, items.length - 1));
      onIndexChange(clamped);
    },
    [items.length, onIndexChange],
  );

  const handleScrollBeginDrag = useCallback(() => {
    isScrolling.current = true;
  }, []);

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const index = Math.round(y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(index, items.length - 1));
      setTimeout(() => {
        if (!isScrolling.current) {
          scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
          onIndexChange(clamped);
        }
      }, 150);
    },
    [items.length, onIndexChange],
  );

  return (
    <View style={{ width, height: PICKER_HEIGHT, overflow: "hidden" }}>
      <View style={styles.selectionHighlight} pointerEvents="none" />
      <View style={styles.fadeTop} pointerEvents="none" />
      <View style={styles.fadeBottom} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
        onScrollBeginDrag={handleScrollBeginDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollEndDrag={handleScrollEndDrag}
        scrollEventThrottle={16}
        bounces={false}
      >
        {items.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <View key={item + i} style={styles.item}>
              <Text
                style={[
                  styles.itemText,
                  isSelected && styles.itemTextSelected,
                ]}
                numberOfLines={1}
              >
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export interface DateWheelPickerProps {
  value?: string;
  onChange: (value: string) => void;
  mode?: "birthday" | "deadline";
}

function parseBirthdayValue(v?: string): { monthIdx: number; dayIdx: number; yearIdx: number } {
  const defaultYear = BIRTHDAY_YEARS.indexOf("1999");
  if (!v) return { monthIdx: 2, dayIdx: 22, yearIdx: defaultYear >= 0 ? defaultYear : 59 };
  const mmdd = v.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mmdd) {
    const m = parseInt(mmdd[1], 10) - 1;
    const d = parseInt(mmdd[2], 10) - 1;
    return {
      monthIdx: Math.max(0, Math.min(m, 11)),
      dayIdx: Math.max(0, d),
      yearIdx: defaultYear >= 0 ? defaultYear : 59,
    };
  }
  return { monthIdx: 2, dayIdx: 22, yearIdx: defaultYear >= 0 ? defaultYear : 59 };
}

function parseDeadlineValue(v?: string): { monthIdx: number; dayIdx: number; yearIdx: number } {
  if (!v) {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return {
      monthIdx: d.getMonth(),
      dayIdx: d.getDate() - 1,
      yearIdx: 0,
    };
  }
  const parsed = new Date(v);
  if (!isNaN(parsed.getTime())) {
    const yearStr = String(parsed.getFullYear());
    const yIdx = DEADLINE_YEARS.indexOf(yearStr);
    return {
      monthIdx: parsed.getMonth(),
      dayIdx: parsed.getDate() - 1,
      yearIdx: yIdx >= 0 ? yIdx : 0,
    };
  }
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return { monthIdx: d.getMonth(), dayIdx: d.getDate() - 1, yearIdx: 0 };
}

export function DateWheelPicker({ value, onChange, mode = "birthday" }: DateWheelPickerProps) {
  const ALL_YEARS = mode === "deadline" ? DEADLINE_YEARS : BIRTHDAY_YEARS;
  const initial = mode === "deadline" ? parseDeadlineValue(value) : parseBirthdayValue(value);

  const [monthIdx, setMonthIdx] = useState(initial.monthIdx);
  const [dayIdx, setDayIdx] = useState(initial.dayIdx);
  const [yearIdx, setYearIdx] = useState(initial.yearIdx);

  const currentYear = parseInt(ALL_YEARS[yearIdx] ?? (mode === "deadline" ? String(new Date().getFullYear()) : "1999"), 10);
  const numDays = daysInMonth(monthIdx + 1, currentYear);
  const days = Array.from({ length: numDays }, (_, i) =>
    String(i + 1).padStart(2, "0"),
  );

  const clampedDayIdx = Math.min(dayIdx, numDays - 1);

  const emitChange = useCallback(
    (mIdx: number, dIdx: number, yIdx: number) => {
      if (mode === "deadline") {
        const year = ALL_YEARS[yIdx] ?? String(new Date().getFullYear());
        const monthName = MONTHS[mIdx];
        const day = dIdx + 1;
        onChange(`${monthName} ${day}, ${year}`);
      } else {
        const mm = String(mIdx + 1).padStart(2, "0");
        const dd = String(dIdx + 1).padStart(2, "0");
        onChange(`${mm}/${dd}`);
      }
    },
    [onChange, mode, ALL_YEARS],
  );

  const handleMonthChange = useCallback(
    (idx: number) => {
      setMonthIdx(idx);
      const nd = daysInMonth(idx + 1, currentYear);
      const newDay = Math.min(dayIdx, nd - 1);
      setDayIdx(newDay);
      emitChange(idx, newDay, yearIdx);
    },
    [dayIdx, currentYear, emitChange, yearIdx],
  );

  const handleDayChange = useCallback(
    (idx: number) => {
      setDayIdx(idx);
      emitChange(monthIdx, idx, yearIdx);
    },
    [monthIdx, yearIdx, emitChange],
  );

  const handleYearChange = useCallback(
    (idx: number) => {
      setYearIdx(idx);
      const yr = parseInt(ALL_YEARS[idx] ?? String(currentYear), 10);
      const nd = daysInMonth(monthIdx + 1, yr);
      const newDay = Math.min(dayIdx, nd - 1);
      setDayIdx(newDay);
      emitChange(monthIdx, newDay, idx);
    },
    [monthIdx, dayIdx, currentYear, emitChange, ALL_YEARS],
  );

  if (Platform.OS === "web") {
    return (
      <View style={styles.webContainer}>
        <View style={styles.webSelect}>
          <Text style={styles.webSelectLabel}>Month</Text>
          <select
            value={monthIdx}
            onChange={(e) => handleMonthChange(Number(e.target.value))}
            style={{
              background: "transparent",
              border: "none",
              color: Colors.text,
              fontSize: 16,
              fontFamily: "Nunito_400Regular",
              outline: "none",
              width: "100%",
            }}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
        </View>
        <View style={styles.webSelect}>
          <Text style={styles.webSelectLabel}>Day</Text>
          <select
            value={clampedDayIdx}
            onChange={(e) => handleDayChange(Number(e.target.value))}
            style={{
              background: "transparent",
              border: "none",
              color: Colors.text,
              fontSize: 16,
              fontFamily: "Nunito_400Regular",
              outline: "none",
              width: "100%",
            }}
          >
            {days.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </View>
        {mode === "deadline" && (
          <View style={styles.webSelect}>
            <Text style={styles.webSelectLabel}>Year</Text>
            <select
              value={yearIdx}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              style={{
                background: "transparent",
                border: "none",
                color: Colors.text,
                fontSize: 16,
                fontFamily: "Nunito_400Regular",
                outline: "none",
                width: "100%",
              }}
            >
              {ALL_YEARS.map((y, i) => (
                <option key={y} value={i}>{y}</option>
              ))}
            </select>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WheelColumn
        items={MONTHS}
        selectedIndex={monthIdx}
        onIndexChange={handleMonthChange}
        width={mode === "deadline" ? 120 : 140}
      />
      <View style={styles.separator} />
      <WheelColumn
        items={days}
        selectedIndex={clampedDayIdx}
        onIndexChange={handleDayChange}
        width={60}
      />
      {mode === "deadline" && (
        <>
          <View style={styles.separator} />
          <WheelColumn
            items={ALL_YEARS}
            selectedIndex={yearIdx}
            onIndexChange={handleYearChange}
            width={80}
          />
        </>
      )}
      {mode === "birthday" && (
        <>
          <View style={styles.separator} />
          <WheelColumn
            items={BIRTHDAY_YEARS}
            selectedIndex={yearIdx}
            onIndexChange={handleYearChange}
            width={80}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: "hidden",
    alignItems: "center",
  },
  separator: {
    width: 1,
    height: PICKER_HEIGHT,
    backgroundColor: Colors.borderLight,
  },
  selectionHighlight: {
    position: "absolute",
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: Colors.primary + "18",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.primary + "30",
    zIndex: 1,
  },
  fadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 2,
    zIndex: 2,
    backgroundColor: "transparent",
  },
  fadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 2,
    zIndex: 2,
    backgroundColor: "transparent",
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  itemText: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    textAlign: "center",
  },
  itemTextSelected: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  webContainer: {
    flexDirection: "row",
    gap: 8,
  },
  webSelect: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  webSelectLabel: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textTertiary,
    marginBottom: 4,
  },
});
