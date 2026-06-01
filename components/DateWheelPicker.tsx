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

const ITEM_HEIGHT = 34;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const HOURS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const AMPM = ["AM", "PM"];

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

function buildDatetimeYears(): string[] {
  const result: string[] = [];
  const current = new Date().getFullYear();
  for (let y = current; y <= current + 3; y++) {
    result.push(String(y));
  }
  return result;
}

const BIRTHDAY_YEARS = buildBirthdayYears();
const DEADLINE_YEARS = buildDeadlineYears();
const DATETIME_YEARS = buildDatetimeYears();

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
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
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
  mode?: "birthday" | "deadline" | "datetime";
}

interface ParsedDate {
  monthIdx: number;
  dayIdx: number;
  yearIdx: number;
  hourIdx?: number;
  ampmIdx?: number;
}

function parseBirthdayValue(v?: string): ParsedDate {
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

function parseDeadlineValue(v?: string): ParsedDate {
  if (!v) {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return { monthIdx: d.getMonth(), dayIdx: d.getDate() - 1, yearIdx: 0 };
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

function parseDatetimeValue(v?: string): ParsedDate {
  const makeDefault = (): ParsedDate => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return { monthIdx: d.getMonth(), dayIdx: d.getDate() - 1, yearIdx: 0, hourIdx: 6, ampmIdx: 1 };
  };
  if (!v) return makeDefault();
  const match = v.match(/^(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):\d+\s+(AM|PM)$/i);
  if (match) {
    const monthName = match[1];
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const ampm = match[5].toUpperCase();
    const monthIdx = MONTHS.indexOf(monthName);
    const yearStr = String(year);
    const yIdx = DATETIME_YEARS.indexOf(yearStr);
    return {
      monthIdx: monthIdx >= 0 ? monthIdx : 0,
      dayIdx: Math.max(0, day - 1),
      yearIdx: yIdx >= 0 ? yIdx : 0,
      hourIdx: Math.max(0, hour - 1),
      ampmIdx: ampm === "AM" ? 0 : 1,
    };
  }
  return makeDefault();
}

export function DateWheelPicker({ value, onChange, mode = "birthday" }: DateWheelPickerProps) {
  const ALL_YEARS =
    mode === "deadline" ? DEADLINE_YEARS :
    mode === "datetime" ? DATETIME_YEARS :
    BIRTHDAY_YEARS;

  const initial: ParsedDate =
    mode === "datetime" ? parseDatetimeValue(value) :
    mode === "deadline" ? parseDeadlineValue(value) :
    parseBirthdayValue(value);

  const [monthIdx, setMonthIdx] = useState(initial.monthIdx);
  const [dayIdx, setDayIdx] = useState(initial.dayIdx);
  const [yearIdx, setYearIdx] = useState(initial.yearIdx);
  const [hourIdx, setHourIdx] = useState(initial.hourIdx ?? 6);
  const [ampmIdx, setAmpmIdx] = useState(initial.ampmIdx ?? 1);

  const currentYear = parseInt(
    ALL_YEARS[yearIdx] ?? (mode === "deadline" || mode === "datetime" ? String(new Date().getFullYear()) : "1999"),
    10,
  );
  const numDays = daysInMonth(monthIdx + 1, currentYear);
  const days = Array.from({ length: numDays }, (_, i) => String(i + 1).padStart(2, "0"));
  const clampedDayIdx = Math.min(dayIdx, numDays - 1);

  const emitChange = useCallback(
    (mIdx: number, dIdx: number, yIdx: number, hIdx: number, apIdx: number) => {
      const year = ALL_YEARS[yIdx] ?? String(new Date().getFullYear());
      const monthName = MONTHS[mIdx];
      const day = dIdx + 1;
      if (mode === "datetime") {
        const hour = hIdx + 1;
        const ampm = AMPM[apIdx];
        onChange(`${monthName} ${day}, ${year} at ${hour}:00 ${ampm}`);
      } else if (mode === "deadline") {
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
      emitChange(idx, newDay, yearIdx, hourIdx, ampmIdx);
    },
    [dayIdx, currentYear, emitChange, yearIdx, hourIdx, ampmIdx],
  );

  const handleDayChange = useCallback(
    (idx: number) => {
      setDayIdx(idx);
      emitChange(monthIdx, idx, yearIdx, hourIdx, ampmIdx);
    },
    [monthIdx, yearIdx, hourIdx, ampmIdx, emitChange],
  );

  const handleYearChange = useCallback(
    (idx: number) => {
      setYearIdx(idx);
      const yr = parseInt(ALL_YEARS[idx] ?? String(currentYear), 10);
      const nd = daysInMonth(monthIdx + 1, yr);
      const newDay = Math.min(dayIdx, nd - 1);
      setDayIdx(newDay);
      emitChange(monthIdx, newDay, idx, hourIdx, ampmIdx);
    },
    [monthIdx, dayIdx, currentYear, emitChange, ALL_YEARS, hourIdx, ampmIdx],
  );

  const handleHourChange = useCallback(
    (idx: number) => {
      setHourIdx(idx);
      emitChange(monthIdx, clampedDayIdx, yearIdx, idx, ampmIdx);
    },
    [monthIdx, clampedDayIdx, yearIdx, ampmIdx, emitChange],
  );

  const handleAmpmChange = useCallback(
    (idx: number) => {
      setAmpmIdx(idx);
      emitChange(monthIdx, clampedDayIdx, yearIdx, hourIdx, idx);
    },
    [monthIdx, clampedDayIdx, yearIdx, hourIdx, emitChange],
  );

  const dayOfWeekName = mode === "datetime"
    ? DAY_NAMES[new Date(currentYear, monthIdx, clampedDayIdx + 1).getDay()]
    : null;

  if (Platform.OS === "web") {
    const selectStyle = {
      background: "transparent",
      border: "none",
      color: Colors.text,
      fontSize: 14,
      fontFamily: "Nunito_400Regular",
      outline: "none",
      width: "100%",
    };
    return (
      <View>
        {dayOfWeekName && (
          <View style={styles.dayOfWeekRow}>
            <Text style={styles.dayOfWeekText}>{dayOfWeekName}</Text>
          </View>
        )}
        <View style={styles.webContainer}>
          <View style={[styles.webSelect, { flex: 2 }]}>
            <Text style={styles.webSelectLabel}>Month</Text>
            <select
              value={monthIdx}
              onChange={(e) => handleMonthChange(Number(e.target.value))}
              style={selectStyle}
            >
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </View>
          <View style={styles.webSelect}>
            <Text style={styles.webSelectLabel}>Day</Text>
            <select
              value={clampedDayIdx}
              onChange={(e) => handleDayChange(Number(e.target.value))}
              style={selectStyle}
            >
              {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </View>
          {(mode === "deadline" || mode === "datetime") && (
            <View style={styles.webSelect}>
              <Text style={styles.webSelectLabel}>Year</Text>
              <select
                value={yearIdx}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                style={selectStyle}
              >
                {ALL_YEARS.map((y, i) => <option key={y} value={i}>{y}</option>)}
              </select>
            </View>
          )}
          {mode === "datetime" && (
            <>
              <View style={styles.webSelect}>
                <Text style={styles.webSelectLabel}>Hour</Text>
                <select
                  value={hourIdx}
                  onChange={(e) => handleHourChange(Number(e.target.value))}
                  style={selectStyle}
                >
                  {HOURS.map((h, i) => <option key={h} value={i}>{h}</option>)}
                </select>
              </View>
              <View style={styles.webSelect}>
                <Text style={styles.webSelectLabel}> </Text>
                <select
                  value={ampmIdx}
                  onChange={(e) => handleAmpmChange(Number(e.target.value))}
                  style={selectStyle}
                >
                  {AMPM.map((a, i) => <option key={a} value={i}>{a}</option>)}
                </select>
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  const monthDisplayItems = mode === "datetime" ? MONTHS_SHORT : MONTHS;

  const wheelPicker = (
    <View style={styles.container}>
      <WheelColumn
        items={monthDisplayItems}
        selectedIndex={monthIdx}
        onIndexChange={handleMonthChange}
        width={mode === "datetime" ? 62 : mode === "deadline" ? 120 : 140}
      />
      <View style={styles.separator} />
      <WheelColumn
        items={days}
        selectedIndex={clampedDayIdx}
        onIndexChange={handleDayChange}
        width={mode === "datetime" ? 44 : 60}
      />
      {(mode === "deadline" || mode === "datetime") && (
        <>
          <View style={styles.separator} />
          <WheelColumn
            items={ALL_YEARS}
            selectedIndex={yearIdx}
            onIndexChange={handleYearChange}
            width={mode === "datetime" ? 64 : 80}
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
      {mode === "datetime" && (
        <>
          <View style={styles.separator} />
          <WheelColumn
            items={HOURS}
            selectedIndex={hourIdx}
            onIndexChange={handleHourChange}
            width={44}
          />
          <View style={styles.separator} />
          <WheelColumn
            items={AMPM}
            selectedIndex={ampmIdx}
            onIndexChange={handleAmpmChange}
            width={44}
          />
        </>
      )}
    </View>
  );

  if (!dayOfWeekName) return wheelPicker;

  return (
    <View>
      <View style={styles.dayOfWeekRow}>
        <Text style={styles.dayOfWeekText}>{dayOfWeekName}</Text>
      </View>
      {wheelPicker}
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
    top: ITEM_HEIGHT,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: Colors.primary + "28",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.primary + "60",
    zIndex: 1,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  itemText: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    textAlign: "center",
  },
  itemTextSelected: {
    fontSize: 20,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
  },
  webContainer: {
    flexDirection: "row",
    gap: 6,
  },
  webSelect: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  webSelectLabel: {
    fontSize: 10,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textTertiary,
    marginBottom: 3,
  },
  dayOfWeekRow: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  dayOfWeekText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
    letterSpacing: 0.3,
  },
});
