import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";
import {
  getActionType,
  getNextPrompt,
  getPromptsForContact,
  loadSyncedPrompts,
  resetSeenPrompts,
  type ActionType,
} from "../lib/prompts";
import { getContactUrgency, getDaysSince, getDaysUntilBirthday, formatBirthdayCountdown, formatLastContacted } from "../lib/helpers";
import { getCheckinThreshold } from "../shared/reminder-thresholds";

jest.mock("@/lib/query-client", () => ({ getApiUrl: () => "https://example.test" }));

const actions: ActionType[] = ["call", "text", "hangout"];
const options = { labels: ["Neighbor", "Partner"], isOverdue: true, hasBirthdaySoon: true };
const interests = ["Cooking", "Gaming", "Travel"];

beforeEach(() => {
  resetSeenPrompts();
  // Repeatable Fisher-Yates choices, not probabilistic assertions.
  let seed = 12345;
  jest.spyOn(Math, "random").mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
});
afterEach(() => jest.restoreAllMocks());

describe("suggestion-card shuffle uses the entire personalized action pool", () => {
  test.each(
    ([1, 2, 3, 4] as const).flatMap(circle => actions.map(action => ({ circle, action }))),
  )("circle $circle starting from $action visits all actions without trapping or repeats", ({ circle, action }) => {
    const pool = [...new Set(getPromptsForContact("Alex", circle, interests, options))];
    let current = pool.find(prompt => getActionType(circle, prompt, "contact") === action)!;
    expect(current).toBeDefined();
    const visited = new Set([current]);
    const visitedActions = new Set([action]);
    // Every unseen prompt must be reached before recycling the pool.
    for (let i = 1; i < pool.length; i++) {
      const next = getNextPrompt("contact", current, "Alex", circle, interests, options);
      expect(next).not.toBe(current);
      expect(pool).toContain(next);
      expect(visited.has(next)).toBe(false);
      visited.add(next);
      visitedActions.add(getActionType(circle, next, "contact"));
      current = next;
    }
    expect(visited.size).toBe(pool.length);
    expect([...visitedActions].sort()).toEqual([...actions].sort());
    expect([...visited].some(p => p.includes("game night"))).toBe(true);
    expect([...visited].some(p => p.includes("backyard hangout"))).toBe(true);
    expect([...visited].some(p => p.includes("trip you took together"))).toBe(true);
    // Exhaustion resets history, not the action pool, and never repeats immediately.
    const recycledActions = new Set<ActionType>();
    for (let i = 0; i < pool.length; i++) {
      const next = getNextPrompt("contact", current, "Alex", circle, interests, options);
      expect(next).not.toBe(current);
      expect(pool).toContain(next);
      recycledActions.add(getActionType(circle, next, "contact"));
      current = next;
    }
    expect([...recycledActions].sort()).toEqual([...actions].sort());
  });

  test("keeps circle, interest, label, birthday, and overdue context in the pool", () => {
    const base = getPromptsForContact("Alex", 2, [], {});
    const personalized = getPromptsForContact("Alex", 2, interests, options);
    expect(base).not.toContain("Suggest a game night together");
    expect(personalized).toContain("Suggest a game night together");
    expect(personalized).toContain("Invite Alex over for a casual backyard hangout.");
    expect(personalized).toContain("Ask about their next trip plans");
    expect(personalized).toContain("Alex's birthday is coming up! Plan something special.");
    expect(personalized).toContain("It's been a while since you reached out to Alex. A quick message can reignite the connection.");
    expect(base).toContain("Call Alex to catch up - even 10 minutes makes a difference.");
    expect(getPromptsForContact("Alex", 3, [], {})).not.toContain("Call Alex to catch up - even 10 minutes makes a difference.");
    expect(getPromptsForContact("Alex", 4, [], options)).not.toContain("Alex's birthday is coming up! Plan something special.");
  });

  test("preserves international-friend suitability without removing call or text", () => {
    const normal = getPromptsForContact("Alex", 2, [], {});
    const international = getPromptsForContact("Alex", 2, [], { labels: ["International Friend"] });
    const baseHangouts = normal.filter(p => getActionType(2, p, "contact") === "hangout");
    expect(international.filter(p => baseHangouts.includes(p)).length).toBeLessThan(baseHangouts.length);
    expect(international).toContain("Schedule a video call with Alex to properly catch up.");
    expect(new Set(international.map(p => getActionType(2, p, "contact")))).toEqual(new Set(actions));
  });
});

// Execute the real screen callback declarations with injected state setters.
// This catches screen-specific option regressions without duplicating handlers
// or needing native APIs, authentication, or live contact data.
function screenCallback(file: string, name: string, dependencies: Record<string, unknown>): (...args: any[]) => void {
  const source = readFileSync(join(__dirname, "..", file), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!initializer) throw new Error(`Callback ${name} missing in ${file}`);
  const compiled = ts.transpileModule(`const callback = ${initializer.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}; return callback;`)(...Object.values(dependencies));
}

describe.each(["Home", "Suggestions"] as const)("%s screen shuffle callback", screen => {
  function setup(circleLevel = 2) {
    const contact = {
      id: "contact", name: "Alex", circleLevel, interests, labels: options.labels,
      lastContacted: "2000-01-01T12:00:00Z", birthday: "12/31",
    };
    let homePrompts = new Map<string, string>();
    let cards: Record<string, any> = {};
    const cache = new Map<string, string>();
    const choosePrompt = jest.fn(getNextPrompt);
    const callback = screenCallback(
      screen === "Home" ? "app/(tabs)/index.tsx" : "app/(tabs)/suggestions.tsx",
      screen === "Home" ? "handleSuggestionRefresh" : "handleRefreshSingle",
      {
        contacts: [contact],
        useCallback: (fn: unknown) => fn,
        getNextPrompt: choosePrompt, getActionType, getDaysSince, getDaysUntilBirthday,
        getCheckinThreshold, getContactUrgency, formatBirthdayCountdown, formatLastContacted,
        setCachedPrompt: (id: string, prompt: string) => cache.set(id, prompt),
        setSuggestionPrompts: (updater: (prev: Map<string, string>) => Map<string, string>) => {
          homePrompts = updater(homePrompts);
        },
        setCardPrompts: (updater: (prev: Record<string, any>) => Record<string, any>) => {
          cards = updater(cards);
        },
      },
    );
    return {
      contact, choosePrompt,
      refresh(current: string): string {
        if (screen === "Home") callback({
          contactId: contact.id, prompt: current,
          actionType: getActionType(circleLevel as 1 | 2 | 3 | 4, current, contact.id),
        });
        else callback(contact.id, current);
        const next = cache.get(contact.id)!;
        expect(next).toBe(screen === "Home" ? homePrompts.get(contact.id) : cards[contact.id].prompt);
        if (screen === "Suggestions") {
          expect(cards[contact.id].type).toBe(getActionType(circleLevel as 1 | 2 | 3 | 4, next, contact.id));
          expect(actions).toContain(cards[contact.id].type);
        }
        return next;
      },
    };
  }

  test.each(actions)("starting with %s can reach all three actions and only writes suggestion state", action => {
    const { contact, choosePrompt, refresh } = setup();
    const circle = contact.circleLevel as 1 | 2 | 3 | 4;
    const pool = getPromptsForContact(contact.name, circle, interests, options);
    let current = pool.find(p => getActionType(circle, p, contact.id) === action)!;
    const visited = new Set<ActionType>();
    for (let i = 0; i < pool.length * 2; i++) {
      const next = refresh(current);
      expect(next).not.toBe(current);
      expect(typeof next).toBe("string"); // Never a Reminder/QuickPick object.
      expect(pool).toContain(next);
      visited.add(getActionType(circle, next, contact.id));
      current = next;
    }
    expect(visited).toEqual(new Set(actions));
    for (const call of choosePrompt.mock.calls) {
      expect(call.slice(2, 5)).toEqual([contact.name, circle, interests]);
      expect(call[5]).toMatchObject({ labels: options.labels, isOverdue: true });
      expect(call[5]).not.toHaveProperty("nonCheckinOnly");
    }
  });
});

describe("synced prompt metadata during shuffle", () => {
  test("uses sheet actions for personalized prompts, not misleading keywords", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        circle2Call: ["Call [Name] about the week."],
        circle2Text: ["Text [Name] about the week."],
        circle2Hangout: ["Invite [Name] to lunch."],
        universal: [], birthday: [], overdue: [],
        labelPrompts: { neighbor: ["Discuss a hangout idea with [Name]."] },
        interestPrompts: { gaming: ["Plan a strategy with [Name]."] },
        promptActions: {
          "Discuss a hangout idea with [Name].": ["call"],
          "Plan a strategy with [Name].": ["text"],
        },
      }),
    });
    try {
      await loadSyncedPrompts();
      const pool = [...new Set(getPromptsForContact("Alex", 2, ["Gaming"], { labels: ["Neighbor"] }))];
      const visited = new Set<string>();
      let current = "Invite Alex to lunch.";
      for (let i = 0; i < pool.length * 2; i++) {
        const next = getNextPrompt("synced", current, "Alex", 2, ["Gaming"], { labels: ["Neighbor"] });
        expect(next).not.toBe(current);
        expect(pool).toContain(next);
        visited.add(next);
        if (next === "Discuss a hangout idea with Alex.") expect(getActionType(2, next, "synced")).toBe("call");
        if (next === "Plan a strategy with Alex.") expect(getActionType(2, next, "synced")).toBe("text");
        current = next;
      }
      expect(visited.has("Discuss a hangout idea with Alex.")).toBe(true);
      expect(visited.has("Plan a strategy with Alex.")).toBe(true);
      expect(new Set([...visited].map(p => getActionType(2, p, "synced")))).toEqual(new Set(actions));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
