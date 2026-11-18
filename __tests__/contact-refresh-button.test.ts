import React from "react";
import { Alert, Linking } from "react-native";
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";
import { darkColors } from "../constants/colors";
import { PhoneContactsPermissionError } from "../lib/phone-contact-refresh";

const mockLoad = jest.fn();
const mockSave = jest.fn();
let mockContacts: any[] = [];
jest.mock("react", () => ({
  ...jest.requireActual("react"), useState: jest.fn(), useRef: jest.fn(),
}));
jest.mock("react-native", () => ({
  ActivityIndicator: "Spinner", Image: "Image", View: "View", Text: "Text", Modal: "Modal",
  ScrollView: "ScrollView", Pressable: "Pressable",
  Alert: { alert: jest.fn() }, Linking: { openSettings: jest.fn().mockResolvedValue(undefined) },
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock("@/lib/theme-context", () => ({ useThemeColors: () => darkColors }));
jest.mock("@/lib/contacts-context", () => ({
  useContacts: () => ({ contacts: mockContacts, isLoading: false, fillContactFields: mockSave }),
}));
jest.mock("@/lib/phone-contact-refresh", () => ({
  loadPhoneContactsForRefresh: () => mockLoad(),
  PhoneContactsPermissionError: class extends Error {},
}));

const source = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");
const exportsObject: Record<string, any> = {};
new Function("require", "exports", ts.transpileModule(source("components/ContactRefreshButton.tsx"), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText)(require, exportsObject);
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
function harness(props: Record<string, any> = {}) {
  const state: any[] = [], refs: any[] = [];
  let cursor = 0, refCursor = 0;
  (React.useState as jest.Mock).mockImplementation((initial: unknown) => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], (value: unknown) => { state[index] = value; }];
  });
  (React.useRef as jest.Mock).mockImplementation((initial: unknown) => {
    const index = refCursor++;
    return refs[index] ?? (refs[index] = { current: initial });
  });
  const render = () => { cursor = 0; refCursor = 0; return exportsObject.ContactRefreshButton(props); };
  const click = (label: string) => elements(render()).find(e => e.type === "Pressable" &&
    (e.props.accessibilityLabel === label || text(e) === label)).props.onPress();
  return { render, click };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockContacts = [{ id: "one", name: "Alex", email: null, phone: "", photoUri: null, birthday: "" }];
  mockLoad.mockResolvedValue({ limited: false, contacts: [{
    id: "device", name: "Alex", phones: ["123"], emails: ["alex@example.test"], birthday: "01/02",
  }] });
  mockSave.mockImplementation(async (id: string, changes: any) => {
    const contact = { ...mockContacts.find(c => c.id === id), ...changes };
    mockContacts = mockContacts.map(c => c.id === id ? contact : c);
    return { contact, appliedFields: Object.keys(changes) };
  });
});

test("preview shows exact proposed values; Cancel writes nothing", async () => {
  const h = harness({ contactId: "one" });
  await h.click("Refresh from phone contacts");
  expect(text(h.render())).toContain("Email · Empty → alex@example.test");
  expect(text(h.render())).toContain("Birthday · Empty → 01/02");
  expect(mockSave).not.toHaveBeenCalled();
  await h.click("Cancel");
  expect(elements(h.render()).find(e => e.type === "Modal").props.visible).toBe(false);
  expect(mockSave).not.toHaveBeenCalled();
});
test("Apply saves only previewed empty fields and reports results", async () => {
  const onApplied = jest.fn();
  const h = harness({ contactId: "one", draft: { phone: "Unsaved phone" }, onApplied });
  await h.click("Refresh from phone contacts");
  expect(text(h.render())).not.toContain("Empty → 123");
  await h.click("Apply changes");
  expect(mockSave).toHaveBeenCalledWith("one", { email: "alex@example.test", birthday: "01/02" });
  expect(onApplied).toHaveBeenCalledWith({ email: "alex@example.test", birthday: "01/02" });
  expect(text(h.render())).toContain("1 contact updated");
  await h.click("Done");
  expect(elements(h.render()).find(e => e.type === "Modal").props.visible).toBe(false);
});
test("revalidates context changes between preview and Apply", async () => {
  const h = harness({ contactId: "one" });
  await h.click("Refresh from phone contacts");
  mockContacts[0] = { ...mockContacts[0], email: "New saved email" };
  await h.click("Apply changes");
  expect(mockSave).toHaveBeenCalledWith("one", { phone: "123", birthday: "01/02" });
});
test("bulk preview lists unmatched names and handles limited permission without guessing", async () => {
  mockContacts.push({ id: "two", name: "Unknown" });
  mockLoad.mockResolvedValueOnce({ ...(await mockLoad()), limited: true });
  const h = harness();
  await h.click("Refresh all");
  expect(text(h.render())).toContain("only see the phone contacts you've shared");
  expect(text(h.render())).toContain("UnknownSkipped");
  expect(text(h.render())).toContain("No matching phone contact");
});
test("permission denial offers Settings and never saves", async () => {
  mockLoad.mockRejectedValueOnce(new PhoneContactsPermissionError("Enable Contacts in Settings"));
  const h = harness();
  await h.click("Refresh all");
  expect(text(h.render())).toContain("Enable Contacts in Settings");
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
  buttons.find((b: any) => b.text === "Open Settings").onPress();
  expect(Linking.openSettings).toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
});
test("both Profile variants and the shared edit-contact screen expose refresh", () => {
  for (const file of ["app/profile.tsx", "components/android-only/ProfileScreen.android.tsx", "app/edit-contact.tsx"]) {
    expect(source(file)).toContain("<ContactRefreshButton");
  }
});
