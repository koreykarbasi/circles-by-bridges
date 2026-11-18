import React from "react";
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";
import { darkColors } from "../constants/colors";
import type { SocialHealthContact } from "../shared/social-health";

let mockContacts: SocialHealthContact[] = [];
let mockExpanded = false;
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: () => [mockExpanded, (value: boolean) => { mockExpanded = value; }],
}));
jest.mock("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", Modal: "Modal",
  StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
jest.mock("@/lib/contacts-context", () => ({ useContacts: () => ({ contacts: mockContacts }) }));
jest.mock("@/lib/theme-context", () => ({ useThemeColors: () => darkColors }));

const source = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");
const compiled = ts.transpileModule(source("components/SocialHealthBar.tsx"), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const exportsObject: Record<string, any> = {};
new Function("require", "exports", compiled)(require, exportsObject);
const render = (compact = false) => exportsObject.SocialHealthBar({ compact });
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

beforeEach(() => {
  mockExpanded = false;
  mockContacts = Array.from({ length: 3 }, () => ({ circleLevel: 2, lastContacted: "2000-01-01" }));
});

test("context changes immediately update the displayed percentage without fetching", () => {
  expect(text(render())).toContain("0%");
  mockContacts = mockContacts.map(contact => ({ ...contact, lastContacted: new Date() }));
  expect(text(render())).toContain("100%");
  expect(source("components/SocialHealthBar.tsx")).not.toMatch(/fetch\(|apiRequest\(/);
});

test("opens and closes the breakdown with circle colors, counts, non-scoring Core, and footnote", () => {
  let tree = render();
  elements(tree).find(e => e.props.accessibilityLabel === "Social health, 0 percent. View breakdown").props.onPress();
  tree = render();
  expect(elements(tree).find(e => e.type === "Modal").props.visible).toBe(true);
  expect(text(tree)).toContain("Close Friends0 of 3 in touch");
  expect(text(tree)).toContain("Friends0 of 0 in touch");
  expect(text(tree)).toContain("You're always in touch");
  expect(text(tree)).toContain("Starting dates for new contacts are estimates until you log a real catch-up.");
  expect(elements(tree).some(e => e.props.style?.some?.((s: any) => s?.color === darkColors.circle2))).toBe(true);
  expect(elements(tree).some(e => e.props.style?.some?.((s: any) => s?.color === darkColors.circle3))).toBe(true);
  elements(tree).find(e => e.props.accessibilityLabel === "Close breakdown").props.onPress();
  expect(elements(render()).find(e => e.type === "Modal").props.visible).toBe(false);
});

test("has a meaningful empty state and supports compact rendering", () => {
  mockContacts = [];
  expect(text(render())).toContain("Add at least 3 Close Friends or Friends");
  expect(elements(render()).some(e => e.props.accessibilityRole === "progressbar")).toBe(false);
  mockContacts = Array.from({ length: 3 }, () => ({ circleLevel: 3, lastContacted: new Date() }));
  expect(text(render(true))).toContain("100%");
});

test.each(["green", "amber", "red"])("uses the requested %s score band", band => {
  mockContacts = band === "green"
    ? Array.from({ length: 3 }, () => ({ circleLevel: 3, lastContacted: new Date() }))
    : band === "amber"
      ? [{ circleLevel: 2, lastContacted: new Date() }, ...mockContacts.map(c => ({ ...c, circleLevel: 3 }))]
      : mockContacts;
  const progress = elements(render()).find(e => e.props.accessibilityRole === "progressbar");
  expect(progress.props.children.props.style[1].backgroundColor)
    .toBe(band === "green" ? darkColors.success : band === "amber" ? darkColors.yellow : darkColors.danger);
});

test("both Profile implementations mount the component, and Home does not", () => {
  for (const file of ["app/profile.tsx", "components/android-only/ProfileScreen.android.tsx"]) {
    expect(source(file)).toContain("<SocialHealthBar />");
  }
  expect(source("app/(tabs)/index.tsx")).not.toContain("SocialHealthBar");
});
