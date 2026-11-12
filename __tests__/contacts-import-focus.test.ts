import React from "react";
import { Platform } from "react-native";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import type { ImportedContact } from "../components/ContactsImport";

jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return {
    ...actual,
    useState: jest.fn(),
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
  };
});
jest.mock("react-native", () => ({
  View: "View", Text: "Text", TextInput: "TextInput", Pressable: "Pressable",
  FlatList: "FlatList", ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "ios" },
  Linking: { openSettings: jest.fn() },
}));
jest.mock("expo-contacts", () => ({}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
jest.mock("../components/Avatar", () => ({ Avatar: "Avatar" }));
jest.mock("../lib/theme-context", () => ({
  useThemeColors: () => ({ primary: "#9876ff", onPrimary: "#fff", text: "#fff" }),
}));

// The project's shared Jest compiler preserves JSX for Expo. Compile just this
// component for the regression test, without changing the global test setup.
const source = readFileSync(resolve(__dirname, "../components/ContactsImport.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;
const componentExports: Record<string, any> = {};
new Function("require", "exports", compiled)(
  (id: string) => require(id === "./Avatar" ? "../components/Avatar" : id),
  componentExports,
);
const ContactsImport = componentExports.ContactsImport as
  (props: { selectedContacts: ImportedContact[]; onSelect: (contact: ImportedContact) => void; onDeselect: (name: string) => void; maxSelections: number }) => React.ReactNode;

type Element = React.ReactElement<Record<string, any>>;

// Track the component types and positions React reconciles on the way to the
// input. Replacing ANY ancestor component also replaces the native text field.
function manualInput(tree: React.ReactNode, ancestry: unknown[] = []): { element: Element; ancestry: unknown[] } | undefined {
  if (!React.isValidElement(tree)) return;
  const element = tree as Element;
  const next = [...ancestry, element.type, element.key];
  if (element.type === ("TextInput" as any) && element.props.placeholder === "Enter a name...") {
    return { element, ancestry: next };
  }
  if (typeof element.type === "function") {
    return manualInput((element.type as (props: any) => React.ReactNode)(element.props), next);
  }
  const children = React.Children.toArray(element.props.children);
  for (let index = 0; index < children.length; index++) {
    const found = manualInput(children[index], [...next, index]);
    if (found) return found;
  }
}

function harness(platform: "ios" | "android" | "web", permission = "idle", selected: ImportedContact[] = [], max = 5) {
  (Platform as { OS: string }).OS = platform;
  const state: unknown[] = [permission, [], "", ""];
  const onSelect = jest.fn();
  const props = { selectedContacts: selected, onSelect, onDeselect: jest.fn(), maxSelections: max };
  function render() {
    let cursor = 0;
    (React.useState as jest.Mock).mockImplementation(() => {
      const slot = cursor++;
      return [state[slot], (value: unknown) => { state[slot] = value; }];
    });
    const result = manualInput(ContactsImport(props));
    if (!result) throw new Error("Manual contact field was not rendered");
    return result;
  }
  return { render, onSelect };
}

describe("onboarding manual contact input identity", () => {
  it.each([
    ["ios", "idle"], ["ios", "denied"],
    ["android", "idle"], ["android", "denied"],
    ["web", "idle"],
  ] as const)("preserves the input and all ancestors while typing on %s with %s permission", (platform, permission) => {
    const { render } = harness(platform, permission);
    const initial = render();
    let typed = "";
    for (const letter of "Alex Smith") {
      typed += letter;
      render().element.props.onChangeText(typed);
      const updated = render();
      expect(updated.element.props.value).toBe(typed);
      expect(updated.ancestry).toEqual(initial.ancestry);
    }
  });

  it.each(["ios", "android"] as const)("still adds the full trimmed name and clears the field on %s", platform => {
    const { render, onSelect } = harness(platform);
    render().element.props.onChangeText("  Alex Smith  ");
    render().element.props.onSubmitEditing();
    expect(onSelect).toHaveBeenCalledWith({ name: "Alex Smith" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(render().element.props.value).toBe("");
  });

  it("does not add blank names or exceed the selection limit", () => {
    const blank = harness("ios");
    blank.render().element.props.onChangeText("   ");
    blank.render().element.props.onSubmitEditing();
    expect(blank.onSelect).not.toHaveBeenCalled();
    const full = harness("android", "idle", [{ name: "Existing" }], 1);
    full.render().element.props.onChangeText("Alex");
    full.render().element.props.onSubmitEditing();
    expect(full.onSelect).not.toHaveBeenCalled();
    expect(full.render().element.props.value).toBe("Alex");
  });
});
