import React from "react";
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";
import { Platform } from "react-native";

let mockState: any[] = [];
let mockCursor = 0;
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: (initial: unknown) => {
    const index = mockCursor++;
    if (!(index in mockState)) mockState[index] = initial;
    return [mockState[index], (value: any) => {
      mockState[index] = typeof value === "function" ? value(mockState[index]) : value;
    }];
  },
  useMemo: (factory: () => unknown) => factory(),
  useRef: (value: unknown) => ({ current: value }),
}));
jest.mock("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", Modal: "Modal",
  ScrollView: "ScrollView", ActivityIndicator: "ActivityIndicator",
  Platform: { OS: "ios" }, Alert: { alert: jest.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));
jest.mock("@/lib/theme-context", () => ({
  useThemeColors: () => require("../constants/colors").darkColors,
}));
jest.mock("@/lib/contacts-context", () => ({
  useContacts: () => ({
    contacts: [{ id: "alex", name: "Alex", circleLevel: 2 }],
    moveContacts: jest.fn(), refreshContacts: jest.fn(), setContactCooldown: jest.fn(),
  }),
}));

const source = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");
function load(file: string, replacements: Record<string, unknown>) {
  const compiled = ts.transpileModule(source(file), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)(
    (id: string) => replacements[id] ?? require(id), exports,
  );
  return exports;
}
const { CircleMoveButton } = load("components/CircleMoveButton.tsx", {
  "./ContactCardSymbols": { ContactCardActionIcon: "MoveIcon" },
});
const { ContactCooldownButton } = load("components/ContactCooldownButton.tsx", {
  "./SnoozeGlyph": { SnoozeGlyph: "SnoozeGlyph", SNOOZE_ACTIVE_COLOR: "#FFBE85" },
});
function elements(tree: any): any[] {
  if (!React.isValidElement(tree)) return [];
  const element = tree as React.ReactElement<any>;
  return [element, ...React.Children.toArray(element.props.children).flatMap(elements)];
}
const contact = { id: "alex", name: "Alex", circleLevel: 2, notificationsCooldownUntil: null };
function render(component: any, compact: boolean, reset = true) {
  if (reset) mockState = [];
  mockCursor = 0;
  return component({ contact, compact });
}
function trigger(tree: any) {
  return elements(tree).find(element => element.type === "Pressable");
}

describe.each(["ios", "android"])("compact circle controls on %s", platform => {
  beforeEach(() => { (Platform as any).OS = platform; });
  test("move matches snooze dimensions while retaining a proportionate icon and touch area", () => {
    const move = trigger(render(CircleMoveButton, true));
    const snooze = trigger(render(ContactCooldownButton, true));
    const moveStyle = move.props.style({ pressed: false })[0];
    const snoozeStyle = snooze.props.style({ pressed: false })[0];
    for (const key of ["width", "height", "borderRadius", "alignItems", "justifyContent"]) {
      expect(moveStyle[key]).toBe(snoozeStyle[key]);
    }
    expect(moveStyle).toMatchObject({ width: 27.2, height: 27.2, borderRadius: 8 });
    expect(move.props.children[0].props.size).toBe(16);
    expect(move.props.hitSlop).toBe(snooze.props.hitSlop);
    expect(move.props.hitSlop).toBe(8);
    expect(move.props.accessibilityRole).toBe("button");
    expect(move.props.accessibilityLabel).toBe("Move Alex to another circle");
  });
  test("compact trigger still opens the original move dialog", () => {
    const tree = render(CircleMoveButton, true);
    expect(elements(tree).find(e => e.type === "Modal").props.visible).toBe(false);
    trigger(tree).props.onPress();
    const opened = render(CircleMoveButton, true, false);
    expect(elements(opened).find(e => e.type === "Modal").props.visible).toBe(true);
  });
  test("full-size move trigger remains unchanged", () => {
    const button = trigger(render(CircleMoveButton, false));
    expect(button.props.style({ pressed: false })[0]).toMatchObject({
      minHeight: 42, borderRadius: 12, paddingHorizontal: 13, gap: 8,
    });
    expect(button.props.children[0].props.size).toBe(17);
    expect(button.props.children[1].props.children).toBe("Move circle");
  });
});

test("contact cards continue using adjacent compact snooze and move buttons", () => {
  const card = source("components/ContactCard.tsx");
  expect(card).toMatch(/<ContactCooldownButton contact=\{contact\} compact \/>\s*<CircleMoveButton contact=\{contact\} compact \/>/);
});
