import React from "react";
import { Alert, Platform } from "react-native";
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";
import { C4_CHECKIN_OPTIONS, dateForCheckinOption } from "../shared/checkin-policy";
import { getCheckinDaysSince } from "../shared/checkin-time";
import type { Contact } from "../lib/types";
import { setCheckinElevationIfOverdue } from "../lib/checkin-state";

let mockSlots: any[] = [];
let mockCursor = 0;
let mockContact: Contact;
const mockUpdate = jest.fn();
const mockMarkContacted = jest.fn().mockResolvedValue(undefined);
const mockAddReminder = jest.fn();
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn, useEffect: () => {},
  useState: (initial: any) => {
    const i = mockCursor++;
    if (!(i in mockSlots)) mockSlots[i] = initial;
    return [mockSlots[i], (value: any) => {
      mockSlots[i] = typeof value === "function" ? value(mockSlots[i]) : value;
    }];
  },
  useRef: (initial: unknown) => {
    const i = mockCursor++;
    if (!(i in mockSlots)) mockSlots[i] = { current: initial };
    return mockSlots[i];
  },
}));
jest.mock("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", TextInput: "TextInput", ScrollView: "ScrollView",
  Platform: { OS: "ios" }, Alert: { alert: jest.fn() }, Linking: {},
  useWindowDimensions: () => ({ width: 402 }), StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
jest.mock("expo-router", () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ id: "alex" }) }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(), impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" }, NotificationFeedbackType: { Success: "success" },
}));
jest.mock("@/lib/contacts-context", () => ({
  useContacts: () => ({
    contacts: [mockContact], updateContact: mockUpdate, markContacted: mockMarkContacted,
    deleteContact: jest.fn(), addReachOutReminder: mockAddReminder,
  }),
}));
jest.mock("@/lib/theme-context", () => ({ useThemeColors: () => require("../constants/colors").darkColors }));
jest.mock("@/lib/prompts", () => ({ AVAILABLE_INTERESTS: [] }));
jest.mock("@/lib/hints-store", () => ({ useSequentialHints: () => [null, jest.fn()], HINT_TEXT: {} }));
jest.mock("@/lib/checkin-state", () => ({ setCheckinElevationIfOverdue: jest.fn() }));

const source = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");
function load(file: string, expose = "") {
  const compiled = ts.transpileModule(source(file) + expose, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)((id: string) => {
    if (id.startsWith("@/components/")) return new Proxy({}, { get: (_, key) => String(key) });
    return require(id);
  }, exports);
  return exports;
}
const { TestForm } = load("app/edit-contact.tsx", "\nexports.TestForm = EditContactForm;");
const { QuickPickRow } = load("components/QuickPickRow.tsx");
function elements(tree: any): any[] {
  if (!React.isValidElement(tree)) return [];
  const element = tree as React.ReactElement<any>;
  return [element, ...React.Children.toArray(element.props.children).flatMap(elements)];
}
function text(tree: any): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (!React.isValidElement(tree)) return "";
  return React.Children.toArray((tree as React.ReactElement<any>).props.children).map(text).join("");
}
function render() {
  mockCursor = 0;
  return TestForm({ contact: mockContact });
}
const find = (id: string) => elements(render()).find(e => e.props.testID === id);
const button = (label: string) => elements(render()).find(e => e.type === "Pressable" && text(e) === label);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date(2026, 11, 25, 12));
  jest.spyOn(Math, "random").mockReturnValue(0);
  mockSlots = [];
  mockContact = {
    id: "alex", name: "Alex", circleLevel: 4, labels: [], interests: [],
    avatarColor: "#000", notes: "Saved notes", lastContacted: "2026-10-01",
    customReminders: [{ label: "Anniversary", date: "06/12" }],
  };
  mockUpdate.mockResolvedValue(undefined);
  mockAddReminder.mockImplementation(async (_id: string, date: string) => {
    const reminder = { label: "Reach out", date };
    mockContact = { ...mockContact, customReminders: [...mockContact.customReminders!, reminder] };
    return reminder;
  });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe.each(["ios", "android"])("Circle 4 editor on %s", platform => {
  beforeEach(() => { (Platform as any).OS = platform; });
  test("one tap persists the reminder immediately, retains draft edits, and shows the chosen date", async () => {
    elements(render()).find(e => e.type === "TextInput" && e.props.value === "Alex").props.onChangeText("Alex edited");
    elements(render()).find(e => e.type === "TextInput" && e.props.value === "Saved notes").props.onChangeText("Unsaved notes");
    button("Add reminder").props.onPress();
    elements(render()).find(e => e.type === "TextInput" && e.props.placeholder?.startsWith("Name (")).props.onChangeText("Unsaved reminder");
    button("Save").props.onPress(); // Adds to the local draft only.
    await find("reach-out-soon").props.onPress();
    expect(mockAddReminder).toHaveBeenCalledWith("alex", "01/01");
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockMarkContacted).not.toHaveBeenCalled();
    expect(mockContact.customReminders).toContainEqual({ label: "Reach out", date: "01/01" });
    expect(text(render())).toContain("Reminder set for January 1, 2027");
    expect(text(render())).toContain("Unsaved reminder");
    expect(text(render())).toContain("Anniversary");
    await find("save-contact-changes").props.onPress();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      name: "Alex edited", notes: "Unsaved notes", lastContacted: "2026-10-01",
      customReminders: [
        { label: "Anniversary", date: "06/12" },
        { label: "Unsaved reminder", date: "03/23" },
        { label: "Reach out", date: "01/01" },
      ],
    }));
  });
  test("rapid taps create one request and contact Save is blocked while the reminder is pending", async () => {
    let finish!: (value: unknown) => void;
    mockAddReminder.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const staleSave = find("save-contact-changes");
    const firstButton = find("reach-out-soon");
    const pending = firstButton.props.onPress();
    await firstButton.props.onPress();
    await staleSave.props.onPress();
    expect(mockAddReminder).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(find("save-contact-header").props.disabled).toBe(true);
    expect(find("reach-out-soon").props.accessibilityState.busy).toBe(true);
    finish({ label: "Reach out", date: "01/01" });
    await pending;
    expect(find("save-contact-header").props.disabled).toBe(false);
  });
  test("failed saves show no success or draft reminder and can be retried", async () => {
    mockAddReminder.mockRejectedValueOnce(new Error("offline"));
    await find("reach-out-soon").props.onPress();
    expect(Alert.alert).toHaveBeenCalledWith("Could not save reminder", expect.any(String));
    expect(text(render())).not.toContain("Reminder set for");
    expect(text(render())).not.toContain("Reach outJanuary");
    expect(find("reach-out-soon").props.disabled).toBe(false);
    await find("reach-out-soon").props.onPress();
    expect(mockAddReminder).toHaveBeenCalledTimes(2);
    expect(text(render())).toContain("Reminder set for January 1, 2027");
  });
  test("Circle 4 chips and reminder shortcut occur before the full-size snooze control", () => {
    const tree = render();
    const all = elements(tree);
    const chips = C4_CHECKIN_OPTIONS.map(option => button(option.label));
    expect(chips.every(Boolean)).toBe(true);
    expect(all.indexOf(all.find(e => e.props.testID === "reach-out-soon"))).toBeLessThan(
      all.indexOf(all.find(e => e.type === "ContactCooldownButton")),
    );
  });
  test.each([1, 2, 3])("circle %i never displays the reach-out shortcut", circle => {
    mockContact.circleLevel = circle;
    expect(find("reach-out-soon")).toBeUndefined();
    expect(text(render())).not.toContain("Remind me to check in soon");
  });
  test.each(C4_CHECKIN_OPTIONS)("selecting $label samples once and persists the chosen date and label", async option => {
    const now = new Date();
    const expected = dateForCheckinOption(option, now, () => 0);
    button(option.label).props.onPress();
    await Promise.resolve();
    expect(mockMarkContacted).toHaveBeenCalledWith("alex", expected, option.label);
    expect(Math.random).toHaveBeenCalledTimes(1);
    expect(getCheckinDaysSince(mockMarkContacted.mock.calls[0][1])).toBe(option.minDaysAgo);
    if (option.label === "Years ago") {
      expect(setCheckinElevationIfOverdue).toHaveBeenCalledWith(expect.objectContaining({
        circleLevel: 4, contactId: "alex", selectedDate: expected,
      }));
    } else {
      expect(setCheckinElevationIfOverdue).not.toHaveBeenCalled();
    }
  });
});

test("quick-picks use Circle 4 ranges while other circles and hangout choices remain unchanged", () => {
  for (const circle of [1, 2, 3, 4] as const) {
    for (const variant of ["checkin", "hangout"] as const) {
      const onSelect = jest.fn();
      const tree = QuickPickRow({ circleLevel: circle, variant, onSelect });
      const buttons = elements(tree).filter(e => e.type === "Pressable");
      const labels = buttons.map(text);
      if (variant === "checkin" && circle === 4) {
        expect(labels).toEqual(C4_CHECKIN_OPTIONS.map(o => o.label));
        buttons.forEach((b, i) => {
          b.props.onPress();
          expect(onSelect).toHaveBeenLastCalledWith(expect.any(Date), C4_CHECKIN_OPTIONS[i].label);
          expect(getCheckinDaysSince(onSelect.mock.calls[i][0])).toBe(C4_CHECKIN_OPTIONS[i].minDaysAgo);
        });
      } else if (variant === "checkin") {
        expect(labels).toEqual(circle === 3
          ? ["This month", "This quarter", "This year", "Longer"]
          : ["Today", "This week", "This month", "Longer"]);
      } else {
        expect(labels).toEqual(circle >= 3
          ? ["This month", "This year", "Longer"]
          : ["This week", "This month", "This year"]);
      }
    }
  }
});
