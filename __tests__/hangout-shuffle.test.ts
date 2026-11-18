import { readFileSync } from "fs";
import { join } from "path";
import { getActionType, getNextPrompt, getPromptsForContact, resetSeenPrompts } from "../lib/prompts";

jest.mock("@/lib/query-client", () => ({ getApiUrl: () => "https://example.test" }));

describe("hangout shuffle never becomes a check-in", () => {
  beforeEach(() => resetSeenPrompts());
  test.each([1, 2, 3, 4] as const)("cycles all non-check-in ideas in circle %s, including personalized invitations", (circle) => {
    const options = { labels: ["Neighbor", "Partner"], nonCheckinOnly: true };
    const interests = ["Cooking", "Gaming", "Outdoors"];
    const pool = getPromptsForContact("Alex", circle, interests, options);
    const allowed = pool.filter((prompt) => getActionType(circle, prompt, "contact") === "hangout");
    expect(allowed.length).toBeGreaterThan(1);
    let current = allowed[0];
    const visited = new Set([current]);
    for (let index = 0; index < allowed.length * 3; index++) {
      const next = getNextPrompt("contact", current, "Alex", circle, interests, options);
      expect(next).not.toBe(current);
      expect(allowed).toContain(next);
      expect(getActionType(circle, next, "contact")).toBe("hangout");
      visited.add(next);
      current = next;
    }
    expect(visited.size).toBe(new Set(allowed).size);
    expect([...visited].some((p) => p.includes("game night"))).toBe(true);
  });

  test("Home and Suggestions both enable non-check-in filtering for hangout refresh", () => {
    for (const file of ["app/(tabs)/index.tsx", "app/(tabs)/suggestions.tsx"]) {
      const source = readFileSync(join(__dirname, "..", file), "utf8");
      expect(source).toContain("nonCheckinOnly:");
      expect(source).toContain("getNextPrompt(");
    }
    const home = readFileSync(join(__dirname, "../app/(tabs)/index.tsx"), "utf8");
    expect(home).not.toContain('suggestion.actionType !== "hangout"');
    expect(home).toContain("<ContactCooldownButton contact={cooldownContact} compact");
  });
});
