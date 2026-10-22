import React from "react";
import { CirclesVisualization } from "../components/CirclesVisualization.android";
import { AndroidOrbitAvatar } from "../components/android-only/OrbitAvatar";
import { androidOrbitGeometry } from "../lib/android-only/orbit-geometry";
import type { Contact } from "../lib/types";

// Use the installed renderer without adding React DOM typings to the app.
const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

const mockImages: any[] = [];
const mockPressables: any[] = [];
const mockViews: any[] = [];
const mockPush = jest.fn();
let mockWidth = 360;

jest.mock("react-native", () => {
  const R = require("react");
  const flatten = (style: any): any => Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten)) : style || {};
  return {
    StyleSheet: { create: (styles: any) => styles },
    useWindowDimensions: () => ({ width: mockWidth }),
    View: (props: any) => {
      mockViews.push({ ...props, style: flatten(props.style) });
      return R.createElement("div", { style: flatten(props.style) }, props.children);
    },
    Text: (props: any) => R.createElement("span", { style: flatten(props.style) }, props.children),
    Pressable: (props: any) => {
      mockPressables.push(props);
      return R.createElement("button", {
        "aria-label": props.accessibilityLabel,
        style: flatten(typeof props.style === "function" ? props.style({ pressed: false }) : props.style),
      }, props.children);
    },
    Image: (props: any) => {
      mockImages.push(props);
      return R.createElement("img", { src: props.source.uri, alt: "", style: flatten(props.style) });
    },
  };
});

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: require("react-native").View, Image: require("react-native").Image },
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: (worklet: () => unknown) => worklet(),
  withRepeat: jest.fn(),
  withTiming: jest.fn(),
  cancelAnimation: jest.fn(),
  Easing: { linear: (value: number) => value },
}));

jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/lib/helpers", () => ({ getInitials: (name: string) => `initials-${name}` }));
jest.mock("@/lib/theme-context", () => {
  const colors = {
    circle1: "#FF7287", circle2: "#9C79F8", circle3: "#43C5BE",
    primary: "#9C79F8", primaryLight: "#B59EF3", text: "#FFFFFF",
    textSecondary: "#AAAAAA", textTertiary: "#888888",
  };
  return {
    useThemeColors: () => colors,
    useTheme: () => ({ colors, mode: "dark" }),
  };
});

const contacts = ([5, 10, 31] as const).flatMap((count, level) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${level + 1}-${String(index).padStart(2, "0")}`,
    name: `${["Core", "Close", "Friends"][level]} ${index}`,
    circleLevel: level + 1,
    avatarColor: "#9C79F8",
    photoUri: `content://unavailable-contact-photo/${level}/${index}`,
  } as Contact)),
);

const markup = () => renderToStaticMarkup(
  React.createElement(CirclesVisualization, { contacts }),
).replace(/<!--.*?-->/g, "");

beforeEach(() => {
  mockImages.length = 0;
  mockPressables.length = 0;
  mockViews.length = 0;
  mockPush.mockClear();
  mockWidth = 360;
});
afterEach(() => jest.restoreAllMocks());

describe("Android orbit population with slow or inaccessible photos", () => {
  test("renders every Core/Close contact and the existing Friends overflow from the screenshot counts", () => {
    const html = markup();
    expect(html.match(/initials-Core \d+/g)).toHaveLength(5);
    expect(html.match(/initials-Close \d+/g)).toHaveLength(10);
    expect(html.match(/initials-Friends \d+/g)).toHaveLength(14);
    expect(html).toContain("+17");
    expect(html).toContain("Core (5)");
    expect(html).toContain("Close (10)");
    expect(html).toContain("Friends (31)");
    expect(mockImages).toHaveLength(29);
    expect(mockImages.every(image => image.style.opacity === 0)).toBe(true);
  });

  test("keeps initials behind a successfully loaded photo, rather than replacing the entire slot", () => {
    jest.spyOn(React, "useState").mockImplementation((() => [true, jest.fn()]) as any);
    const html = renderToStaticMarkup(React.createElement(AndroidOrbitAvatar, {
      name: "Test Contact", color: "#9C79F8", size: 28, photoUri: "file:///photo.jpg",
    }));
    expect(html).toContain("initials-Test Contact");
    expect(mockImages[0].style.opacity).toBe(1);
  });

  test("reveals a loaded photo and hides a failed photo without unmounting the initials", () => {
    const setLoaded = jest.fn();
    jest.spyOn(React, "useState").mockImplementation((() => [false, setLoaded]) as any);
    const html = renderToStaticMarkup(React.createElement(AndroidOrbitAvatar, {
      name: "Test Contact", color: "#9C79F8", size: 28, photoUri: "content://unreadable",
    }));
    expect(html).toContain("initials-Test Contact");
    mockImages[0].onLoad();
    expect(setLoaded).toHaveBeenLastCalledWith(true);
    mockImages[0].onError();
    expect(setLoaded).toHaveBeenLastCalledWith(false);
  });

  test("uses a fresh photo state when a contact's photo address changes", () => {
    const render = (photoUri: string) => renderToStaticMarkup(React.createElement(AndroidOrbitAvatar, {
      name: "Test Contact", color: "#9C79F8", size: 28, photoUri,
    }));
    render("file:///old.jpg");
    expect(mockViews[0].children[1].key).toBe("file:///old.jpg");
    mockViews.length = 0;
    render("file:///new.jpg");
    expect(mockViews[0].children[1].key).toBe("file:///new.jpg");
    expect(mockImages[1].style.opacity).toBe(0);
  });

  test.each([null, undefined, ""])("shows initials without creating an image for photo %s", photoUri => {
    expect(renderToStaticMarkup(React.createElement(AndroidOrbitAvatar, {
      name: "No Photo", color: "#9C79F8", size: 28, photoUri,
    }))).toContain("initials-No Photo");
    expect(mockImages).toHaveLength(0);
  });

  test.each([320, 360, 412, 480])("gives every animated contact a stable, visible frame at width %d", width => {
    mockWidth = width;
    markup();
    const frames = mockViews.filter(view =>
      view.children?.props?.accessibilityRole === "button" &&
      view.children.props.accessibilityLabel.startsWith("Open "),
    );
    expect(frames).toHaveLength(29);
    const { size } = androidOrbitGeometry(width);
    for (const frame of frames) {
      expect(frame.collapsable).toBe(false);
      expect(frame.style.width).toBeGreaterThan(0);
      expect(frame.style.height).toBe(frame.style.width);
      expect(frame.style.left).toBeGreaterThanOrEqual(0);
      expect(frame.style.top).toBeGreaterThanOrEqual(0);
      expect(frame.style.left + frame.style.width).toBeLessThanOrEqual(size);
      expect(frame.style.top + frame.style.height).toBeLessThanOrEqual(size);
    }
  });

  test("preserves the contact tap target for every populated slot", () => {
    markup();
    const buttons = mockPressables.filter(p => p.accessibilityLabel?.startsWith("Open "));
    expect(buttons).toHaveLength(29);
    buttons.find(p => p.accessibilityLabel === "Open Core 0").onPress();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/edit-contact", params: { id: "1-00" } });
  });
});
