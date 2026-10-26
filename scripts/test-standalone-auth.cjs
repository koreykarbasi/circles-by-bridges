// Focused component/handler tests with native services mocked.
// These do not replace a physical-device Apple sign-in check.
// Run: node --test scripts/test-standalone-auth.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const code = ts.transpileModule(fs.readFileSync("app/auth.tsx", "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;

function harness({ theme = "dark", platform = "ios", appleResult, appleError, loginError } = {}) {
  const slots = [];
  let cursor = 0;
  let tree;
  const calls = [];
  const react = {
    createElement: (type, props, ...children) => ({
      type, props: { ...props, children: children.flat(Infinity) },
    }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => {
        slots[i] = typeof value === "function" ? value(slots[i]) : value;
      }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo: fn => fn(),
    useEffect: () => {},
  };
  const apple = {
    AppleAuthenticationButton: "AppleButton",
    AppleAuthenticationButtonType: { SIGN_IN: "SIGN_IN" },
    AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 2 },
    AppleAuthenticationScope: { FULL_NAME: "FULL_NAME", EMAIL: "EMAIL" },
    signInAsync: async options => {
      calls.push(["applePrompt", options]);
      if (appleError) throw appleError;
      return appleResult ?? {
        identityToken: "test-identity-token",
        fullName: { givenName: "Test", familyName: "User" },
      };
    },
  };
  const auth = {
    login: async (...args) => {
      calls.push(["login", ...args]);
      if (loginError) throw new Error(loginError);
    },
    register: async (...args) => calls.push(["register", ...args]),
    loginWithApple: async (...args) => calls.push(["loginWithApple", ...args]),
    loginWithGoogle: async (...args) => calls.push(["loginWithGoogle", ...args]),
  };
  const native = Object.fromEntries([
    "View", "Text", "TextInput", "TouchableOpacity", "KeyboardAvoidingView",
    "ActivityIndicator", "Image", "Modal",
  ].map(name => [name, name]));
  native.StyleSheet = { create: value => value };
  native.Platform = { OS: platform };
  const modules = {
    react,
    "react-native": native,
    "react-native-keyboard-controller": { KeyboardAwareScrollView: "ScrollView" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "@/lib/theme-context": {
      useTheme: () => ({ mode: theme }),
      useThemeColors: () => ({}),
    },
    "@/lib/auth-context": { useAuth: () => auth },
    "@/lib/query-client": { apiRequest: async (...args) => calls.push(["apiRequest", ...args]) },
    "expo-apple-authentication": apple,
    "expo-auth-session/providers/google": {},
    "@/assets/images/bridge-logo.png": "logo",
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports, process: { env: {} },
    require: name => {
      assert.ok(name in modules, `Unexpected import: ${name}`);
      return modules[name];
    },
  });
  const render = () => {
    cursor = 0;
    tree = exports.default();
    return tree;
  };
  const nodes = () => {
    const result = [];
    function visit(node) {
      if (!node || typeof node !== "object") return;
      result.push(node);
      (node.props?.children ?? []).forEach(visit);
    }
    visit(tree);
    return result;
  };
  const find = id => {
    const node = nodes().find(node => node.props.testID === id);
    assert.ok(node, `Missing ${id}`);
    return node;
  };
  const fill = (id, value) => { find(id).props.onChangeText(value); render(); };
  const click = async id => { await find(id).props.onPress(); render(); };
  const text = () => nodes().flatMap(node => node.props.children)
    .filter(child => typeof child === "string").join(" ");
  render();
  return { calls, render, nodes, find, fill, click, text };
}

for (const theme of ["dark", "light"]) {
  test(`Apple native button is present in both auth modes with ${theme} contrast`, async () => {
    const h = harness({ theme });
    for (let mode = 0; mode < 2; mode++) {
      const { props } = h.find("auth-apple");
      assert.equal(props.buttonStyle, theme === "dark" ? 0 : 2);
      assert.equal(props.buttonType, "SIGN_IN");
      assert.equal(props.cornerRadius, 14);
      assert.equal(props.style.height, 52);
      assert.equal(props.style.width, "100%");
      await h.click("auth-switch");
    }
  });
}

test("Apple passes verified token and optional name to the existing auth provider", async () => {
  const h = harness();
  await h.click("auth-apple");
  assert.equal(h.calls[0][0], "applePrompt");
  assert.deepEqual(Array.from(h.calls[0][1].requestedScopes), ["FULL_NAME", "EMAIL"]);
  assert.equal(h.calls[1][0], "loginWithApple");
  assert.equal(h.calls[1][1], "test-identity-token");
  assert.equal(h.calls[1][2].givenName, "Test");
});

test("Apple also authenticates from sign-up mode without requiring email/password fields", async () => {
  const h = harness({ appleResult: { identityToken: "returning-token", fullName: null } });
  await h.click("auth-switch");
  await h.click("auth-apple");
  assert.equal(h.calls[1][0], "loginWithApple");
  assert.equal(h.calls[1][1], "returning-token");
  assert.equal(h.calls[1][2].givenName, undefined);
});

test("Apple cancellation is quiet and leaves the button usable", async () => {
  const h = harness({ appleError: { code: "ERR_REQUEST_CANCELED" } });
  await h.click("auth-apple");
  assert.equal(h.calls.length, 1);
  assert.ok(!h.text().includes("failed"));
  assert.equal(h.nodes().find(n => n.props.accessibilityState)?.props.accessibilityState.busy, false);
});

test("Apple errors and missing tokens are explicit, and never authenticate", async () => {
  for (const options of [
    { appleResult: { identityToken: null } },
    { appleError: new Error("Apple service failed") },
  ]) {
    const h = harness(options);
    await h.click("auth-apple");
    assert.equal(h.calls.length, 1);
    assert.match(h.text(), /failed/);
  }
});

test("Concurrent Apple taps only open one request", async () => {
  const h = harness();
  const press = h.find("auth-apple").props.onPress;
  await Promise.all([press(), press()]);
  assert.equal(h.calls.filter(call => call[0] === "applePrompt").length, 1);
});

test("Sign-up fields match onboarding and an optional blank name can register then log in", async () => {
  const h = harness();
  await h.click("auth-switch");
  assert.match(h.text(), /Name \(optional\)/);
  h.fill("auth-email", " test@example.com ");
  h.fill("auth-password", "test-password");
  h.fill("auth-confirm-password", "test-password");
  await h.click("auth-submit");
  assert.deepEqual(h.calls, [
    ["register", "test@example.com", "test-password", undefined],
    ["login", "test@example.com", "test-password"],
  ]);
});

test("Mismatched password confirmation prevents registration", async () => {
  const h = harness();
  await h.click("auth-switch");
  h.fill("auth-email", "test@example.com");
  h.fill("auth-password", "test-password");
  h.fill("auth-confirm-password", "different");
  await h.click("auth-submit");
  assert.equal(h.calls.length, 0);
  assert.match(h.text(), /Passwords don't match/);
});

test("Existing email sign-in still works; auth errors stay on the form", async () => {
  for (const loginError of [undefined, "Invalid email or password"]) {
    const h = harness({ loginError });
    h.fill("auth-email", "test@example.com");
    h.fill("auth-password", "test-password");
    await h.click("auth-submit");
    assert.equal(h.calls[0][0], "login");
    if (loginError) assert.match(h.text(), /Invalid email or password/);
    assert.equal(h.find("auth-submit").props.disabled, false);
  }
});

test("Forgot-password uses the existing endpoint and preserves its confirmation", async () => {
  const h = harness();
  h.fill("auth-email", "test@example.com");
  await h.click("auth-forgot-password");
  await h.click("forgot-submit");
  assert.equal(h.calls[0][0], "apiRequest");
  assert.equal(h.calls[0][2], "/api/auth/forgot-password");
  assert.equal(h.calls[0][3].email, "test@example.com");
  assert.match(h.text(), /Check your email/);
});

test("Web never renders the native Apple button", () => {
  const h = harness({ platform: "web" });
  assert.ok(!h.nodes().some(node => node.type === "AppleButton"));
});
