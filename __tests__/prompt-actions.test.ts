import { chooseAllowedAction, inferAllowedActions } from "../lib/prompt-actions";

describe("suggestion action classification", () => {
  test("a trip memory allows conversation actions, not a hangout", () => {
    expect(inferAllowedActions("Reminisce about a trip you took together")).toEqual(["text", "call"]);
  });

  test("misleading words do not automatically turn conversation prompts into hangouts", () => {
    expect(inferAllowedActions("Ask about their next trip plans")).toEqual(["text", "call"]);
    expect(inferAllowedActions("Share your plan for the week")).toEqual(["text", "call"]);
  });

  test("actual invitations and planned activities remain hangouts", () => {
    expect(inferAllowedActions("Invite them to work out together this week")).toEqual(["hangout"]);
    expect(inferAllowedActions("Plan a camping or nature trip together")).toEqual(["hangout"]);
    expect(inferAllowedActions("Suggest a neighborhood walk with [Name].")).toEqual(["hangout"]);
    expect(inferAllowedActions("Recreate an early date or favorite memory with [Name].")).toEqual(["hangout"]);
  });

  test("multi-action choices are stable and use the requested circle weighting", () => {
    const prompt = "Reminisce about a trip you took together";
    const circle1 = Array.from({ length: 500 }, (_, index) =>
      chooseAllowedAction(["text", "call"], 1, prompt, `contact-${index}`),
    );
    const circle3 = Array.from({ length: 500 }, (_, index) =>
      chooseAllowedAction(["text", "call"], 3, prompt, `contact-${index}`),
    );

    expect(chooseAllowedAction(["text", "call"], 3, prompt, "same-contact")).toBe(
      chooseAllowedAction(["text", "call"], 3, prompt, "same-contact"),
    );
    expect(circle1.filter((action) => action === "call").length).toBeGreaterThan(
      circle1.filter((action) => action === "text").length,
    );
    expect(circle3.filter((action) => action === "text").length).toBeGreaterThan(
      circle3.filter((action) => action === "call").length,
    );
    expect(circle3).toContain("call");
  });
});