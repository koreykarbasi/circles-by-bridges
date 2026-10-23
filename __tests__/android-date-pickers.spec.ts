import React from "react";
import { DateWheelPicker } from "../components/DateWheelPicker.android";
import {
  scheduleYears, parseScheduleSelection, formatScheduleSelection, scheduleSelection,
} from "../lib/android-only/scheduled-date";

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};
const mockWheels: any[] = [];
jest.mock("react-native", () => ({
  StyleSheet: { create: (s: unknown) => s },
  View: (p: any) => require("react").createElement("div", null, p.children),
  Text: (p: any) => require("react").createElement("span", null, p.children),
}));
jest.mock("react-native-gesture-handler", () => ({
  ScrollView: (p: any) => {
    mockWheels.push(p);
    return require("react").createElement("div", null, p.children);
  },
}));
jest.mock("@/lib/theme-context", () => ({
  useThemeColors: () => ({ primary: "#999999", surface: "#111111", borderLight: "#222222" }),
}));

beforeEach(() => {
  mockWheels.length = 0;
  jest.useFakeTimers();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const event = (index: number) => ({ nativeEvent: { contentOffset: { y: index * 34 } } });
function mount(mode: "birthday" | "deadline" | "datetime", value: string) {
  const change = jest.fn();
  // Capture native handlers without a device or changing the app's test dependencies.
  jest.spyOn(React, "useState").mockImplementation(((initial: any) =>
    [typeof initial === "function" ? initial() : initial, jest.fn()]) as any);
  const html = renderToStaticMarkup(React.createElement(DateWheelPicker, { mode, value, onChange: change }));
  return { change, html };
}
function drag(label: string, index: number) {
  const wheel = mockWheels.find(w => w.accessibilityLabel === label);
  wheel.onScrollBeginDrag();
  wheel.onScroll(event(index));
  wheel.onScrollEndDrag(event(index));
  jest.advanceTimersByTime(180);
}

describe("every Android date picker uses the repaired wheel", () => {
  test.each([
    ["birthday", "02/29", 3],
    ["deadline", "March 23, 2028", 3],
    ["datetime", "March 23, 2028 at 7:00 PM", 5],
  ] as const)("%s uses nested gesture-handler wheels with drag and momentum handlers", (mode, value, count) => {
    mount(mode, value);
    expect(mockWheels).toHaveLength(count);
    for (const wheel of mockWheels) {
      expect(wheel.nestedScrollEnabled).toBe(true);
      expect(wheel.disallowInterruption).toBe(true);
      expect(wheel.testID.startsWith(`android-${mode}-`)).toBe(true);
      expect(wheel.onMomentumScrollEnd).toEqual(expect.any(Function));
      expect(wheel.onScrollEndDrag).toEqual(expect.any(Function));
    }
  });
  test("hangout month, day, year, hour and AM/PM all compose even before a render", () => {
    const year = new Date().getFullYear();
    const { change } = mount("datetime", `March 23, ${year} at 7:00 PM`);
    drag("Month", 3);
    drag("Day", 4);
    drag("Year", 1);
    drag("Hour", 11);
    drag("AMPM", 0);
    expect(change).toHaveBeenLastCalledWith(`April 5, ${year + 1} at 12:00 AM`);
  });
  test("a visible change is emitted before Confirm can be tapped", () => {
    const year = new Date().getFullYear();
    const { change } = mount("datetime", `March 23, ${year} at 7:00 PM`);
    const hour = mockWheels.find(w => w.accessibilityLabel === "Hour");
    hour.onScrollBeginDrag();
    hour.onScroll(event(9));
    expect(change).toHaveBeenLastCalledWith(`March 23, ${year} at 10:00 PM`);
  });
  test("deadline clamps January 31 to February's last day", () => {
    const year = new Date().getFullYear();
    const { change } = mount("deadline", `January 31, ${year}`);
    drag("Month", 1);
    expect(change).toHaveBeenLastCalledWith(`February ${new Date(year, 2, 0).getDate()}, ${year}`);
  });
  test("flings settle on the latest hour rather than the drag-end hour", () => {
    const year = new Date().getFullYear();
    const { change } = mount("datetime", `March 23, ${year} at 7:00 PM`);
    const hour = mockWheels.find(w => w.accessibilityLabel === "Hour");
    hour.onScrollBeginDrag();
    hour.onScrollEndDrag(event(1));
    hour.onMomentumScrollBegin();
    hour.onScroll(event(4));
    hour.onMomentumScrollEnd(event(5));
    jest.advanceTimersByTime(500);
    expect(change).toHaveBeenLastCalledWith(`March 23, ${year} at 6:00 PM`);
  });
});

describe("Android calendar values and unchanged storage formats", () => {
  const now = new Date(2027, 11, 30, 12);
  test("default dates crossing New Year select the actual next year", () => {
    for (const mode of ["deadline", "datetime"] as const) {
      const years = scheduleYears(mode, now);
      const selection = parseScheduleSelection(undefined, mode, years, now);
      expect(years[selection.yearIndex]).toBe("2028");
      expect(selection.month).toBe(0);
      expect(formatScheduleSelection(selection, mode, years)).toBe(
        mode === "deadline" ? "January 2, 2028" : "January 6, 2028 at 7:00 PM",
      );
    }
  });
  test.each(["deadline", "datetime"] as const)("reopening %s preserves leap day", mode => {
    const years = scheduleYears(mode, now);
    const value = mode === "datetime" ? "February 29, 2028 at 12:00 AM" : "February 29, 2028";
    const selection = parseScheduleSelection(value, mode, years, now);
    expect(formatScheduleSelection(selection, mode, years)).toBe(value);
    const next = scheduleSelection({ ...selection, yearIndex: 2 }, years);
    expect(formatScheduleSelection(next, mode, years)).toContain("February 28, 2029");
  });
  test.each(["12:00 AM", "12:00 PM", "1:00 AM", "11:00 PM"])("round trips %s", time => {
    const years = scheduleYears("datetime", now);
    const value = `March 23, 2028 at ${time}`;
    expect(formatScheduleSelection(parseScheduleSelection(value, "datetime", years, now), "datetime", years)).toBe(value);
  });
});
