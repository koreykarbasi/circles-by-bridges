import { PROMPT_SMS_MAP, getTextCopyMessage, reasonFromPrompt } from "../lib/sms-templates";

const SAMPLE_NAME = "Jane Smith";
const FIRST_NAME = "Jane";

describe("PROMPT_SMS_MAP coverage", () => {
  const keys = Object.keys(PROMPT_SMS_MAP);

  test("map is non-empty", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  test("every key contains [Name] or is an interest/label-style prompt without placeholder", () => {
    for (const key of keys) {
      const hasNamePlaceholder = key.includes("[Name]");
      const isInterestStylePrompt = !key.includes("[Name]") && !key.includes("[");
      expect(hasNamePlaceholder || isInterestStylePrompt).toBe(true);
    }
  });

  test("every value contains [Name] placeholder (for later substitution)", () => {
    for (const [key, value] of Object.entries(PROMPT_SMS_MAP)) {
      const hasNameInValue = value.includes("[Name]");
      const isNoNameKey = !key.includes("[Name]");
      if (!isNoNameKey) {
        expect(hasNameInValue).toBe(true);
      }
    }
  });

  test("every value starts with 'Hey [Name]'", () => {
    for (const value of Object.values(PROMPT_SMS_MAP)) {
      expect(value.startsWith("Hey [Name]")).toBe(true);
    }
  });

  describe("getTextCopyMessage resolves every map key to exact expected SMS draft (no silent fallback)", () => {
    for (const rawKey of Object.keys(PROMPT_SMS_MAP)) {
      test(`key: "${rawKey.slice(0, 70)}..."`, () => {
        const prompt = rawKey.replace(/\[Name\]/g, SAMPLE_NAME);
        const result = getTextCopyMessage(SAMPLE_NAME, { prompt });

        const expected = PROMPT_SMS_MAP[rawKey].replace(/\[Name\]/g, FIRST_NAME);
        expect(result).toBe(expected);
        expect(result).not.toContain("[Name]");
      });
    }
  });
});

describe("getTextCopyMessage — name substitution", () => {
  test("uses only the first name for a multi-word contact name", () => {
    const prompt = "Ask [Name] what's bringing them joy right now.".replace("[Name]", "Alice Wonderland");
    const result = getTextCopyMessage("Alice Wonderland", { prompt });
    expect(result).toContain("Alice");
    expect(result).not.toContain("Wonderland");
    expect(result).not.toContain("[Name]");
  });

  test("handles a single-word name", () => {
    const prompt = "Tell [Name] that you admire how they show up for others.".replace("[Name]", "Maya");
    const result = getTextCopyMessage("Maya", { prompt });
    expect(result.startsWith("Hey Maya")).toBe(true);
    expect(result).not.toContain("[Name]");
  });

  test("escapes regex special characters in contact name", () => {
    const name = "O'Brien";
    const prompt = "Ask [Name] what's been making them happy lately.".replace("[Name]", name);
    const result = getTextCopyMessage(name, { prompt });
    expect(result).toContain("O'Brien");
    expect(result).not.toContain("[Name]");
  });
});

describe("getTextCopyMessage — birthday override", () => {
  test("returns birthday message when hasBirthdaySoon is true regardless of prompt", () => {
    const result = getTextCopyMessage(SAMPLE_NAME, {
      prompt: "Ask Jane what they need most right now - and really mean it.",
      hasBirthdaySoon: true,
    });
    expect(result).toContain(FIRST_NAME);
    expect(result.toLowerCase()).toMatch(/birthday/);
    expect(result).not.toContain("[Name]");
  });

  test("birthday message starts with 'Hey <FirstName>'", () => {
    const result = getTextCopyMessage("Tom Jones", { hasBirthdaySoon: true });
    expect(result.startsWith("Hey Tom")).toBe(true);
  });
});

describe("getTextCopyMessage — overdue override", () => {
  test("returns overdue message when daysSinceContact > 45", () => {
    const result = getTextCopyMessage(SAMPLE_NAME, { daysSinceContact: 46 });
    expect(result).toContain(FIRST_NAME);
    expect(result.toLowerCase()).toMatch(/long|ages|while/);
    expect(result).not.toContain("[Name]");
  });

  test("does NOT trigger overdue path at exactly 45 days", () => {
    const prompt = "Tell [Name] that you admire how they show up for others.".replace("[Name]", SAMPLE_NAME);
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt, daysSinceContact: 45 });
    expect(result).toContain(FIRST_NAME);
    expect(result).not.toContain("too long");
  });

  test("overdue message starts with 'Hey <FirstName>'", () => {
    const result = getTextCopyMessage("Maria Sanchez", { daysSinceContact: 100 });
    expect(result.startsWith("Hey Maria")).toBe(true);
    expect(result).not.toContain("[Name]");
  });
});

describe("getTextCopyMessage — fallback to reasonFromPrompt for unknown prompts", () => {
  test("unknown prompt falls back to opener + reasonFromPrompt output", () => {
    const result = getTextCopyMessage(SAMPLE_NAME, {
      prompt: "This is a completely unknown prompt that does not exist in the map.",
    });
    expect(result).toContain(FIRST_NAME);
    expect(result.length).toBeGreaterThan(10);
    expect(result).not.toContain("[Name]");
  });

  test("unknown prompt starts with 'Hey <FirstName>'", () => {
    const result = getTextCopyMessage(SAMPLE_NAME, {
      prompt: "An unrecognised prompt text right here.",
    });
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });

  test("empty prompt with no interests falls back to generic message", () => {
    const result = getTextCopyMessage(SAMPLE_NAME, {});
    expect(result).toContain(FIRST_NAME);
    expect(result.length).toBeGreaterThan(10);
  });

  test("interests are passed to reasonFromPrompt when no map hit", () => {
    const result = getTextCopyMessage(SAMPLE_NAME, {
      prompt: "totally unrecognised prompt",
      interests: ["cycling"],
    });
    expect(result).toContain(FIRST_NAME);
    expect(result).not.toContain("[Name]");
  });

  test("labels are passed to reasonFromPrompt when no map hit", () => {
    const result = getTextCopyMessage(SAMPLE_NAME, {
      prompt: "totally unrecognised prompt",
      labels: ["College Friend"],
    });
    expect(result).toContain(FIRST_NAME);
    expect(result).not.toContain("[Name]");
  });
});

describe("getTextCopyMessage — specific map entries (spot-checks)", () => {
  test("Circle 1 — deeply appreciate prompt", () => {
    const rawKey = "Tell [Name] something you deeply appreciate about who they are.";
    const prompt = rawKey.replace("[Name]", SAMPLE_NAME);
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt });
    expect(result).toContain(FIRST_NAME);
    expect(result).toContain("appreciate");
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });

  test("Circle 2 — proud of them prompt", () => {
    const rawKey = "Tell [Name] you're proud of them for something (big or small).";
    const prompt = rawKey.replace("[Name]", SAMPLE_NAME);
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt });
    expect(result).toContain(FIRST_NAME);
    expect(result).toContain("proud");
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });

  test("Circle 3 — check in no agenda prompt", () => {
    const rawKey = "Check in with [Name] - no agenda, just a moment of presence.";
    const prompt = rawKey.replace("[Name]", SAMPLE_NAME);
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt });
    expect(result).toContain(FIRST_NAME);
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });

  test("Birthday — birthday is coming up prompt", () => {
    const rawKey = "[Name]'s birthday is coming up! Plan something special.";
    const prompt = rawKey.replace("[Name]", SAMPLE_NAME);
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt });
    expect(result).toContain(FIRST_NAME);
    expect(result.toLowerCase()).toContain("birthday");
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });

  test("Overdue — it's been a while prompt", () => {
    const rawKey = "It's been a while since you reached out to [Name]. A quick message can reignite the connection.";
    const prompt = rawKey.replace("[Name]", SAMPLE_NAME);
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt });
    expect(result).toContain(FIRST_NAME);
    expect(result).toContain("long");
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });

  test("Interest — ask how their training is going", () => {
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt: "Ask how their training is going" });
    expect(result).toContain(FIRST_NAME);
    expect(result.toLowerCase()).toContain("training");
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });

  test("Label — childhood friend reminisce", () => {
    const rawKey = "Reminisce about a memory from growing up with [Name].";
    const prompt = rawKey.replace("[Name]", SAMPLE_NAME);
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt });
    expect(result).toContain(FIRST_NAME);
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });

  test("Label — family tell them you love them", () => {
    const rawKey = "Tell [Name] that you love them and that you mean it.";
    const prompt = rawKey.replace("[Name]", SAMPLE_NAME);
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt });
    expect(result).toContain(FIRST_NAME);
    expect(result).toContain("love");
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });

  test("Mentor — share a win prompt", () => {
    const rawKey = "Share a win with [Name] and credit their influence.";
    const prompt = rawKey.replace("[Name]", SAMPLE_NAME);
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt });
    expect(result).toContain(FIRST_NAME);
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });

  test("International friend — lonely, always here prompt", () => {
    const rawKey = "Tell [Name] that whenever they feel lonely, you're always here to talk.";
    const prompt = rawKey.replace("[Name]", SAMPLE_NAME);
    const result = getTextCopyMessage(SAMPLE_NAME, { prompt });
    expect(result).toContain(FIRST_NAME);
    expect(result.toLowerCase()).toContain("lonely");
    expect(result.startsWith("Hey " + FIRST_NAME)).toBe(true);
  });
});

describe("reasonFromPrompt — fallback logic (no map hit)", () => {
  test("returns a non-empty string for any prompt", () => {
    const result = reasonFromPrompt("", [], []);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("unknown prompt with no interests/labels returns generic fallback", () => {
    const result = reasonFromPrompt("completely random unmatched text xyz", [], []);
    const fallbacks = [
      "Just wanted to check in — how have you been?",
      "Hope things are going well! What's new with you?",
      "Just thought of you and wanted to say hi. How are things?",
    ];
    expect(fallbacks).toContain(result);
  });

  test("detects 'birthday' keyword", () => {
    const result = reasonFromPrompt("upcoming birthday approaching", [], []);
    expect(result.toLowerCase()).toContain("birthday");
  });

  test("detects 'admire' keyword", () => {
    const result = reasonFromPrompt("I genuinely admire you", [], []);
    expect(result.toLowerCase()).toContain("admire");
  });

  test("detects 'grateful' keyword", () => {
    const result = reasonFromPrompt("I am grateful for everything", [], []);
    expect(result.toLowerCase()).toMatch(/appreciat|grateful/);
  });

  test("detects 'memory' keyword", () => {
    const result = reasonFromPrompt("a great shared memory we have", [], []);
    expect(result.toLowerCase()).toMatch(/memor|flashback|smile|great time|reminded me/);
  });

  test("detects 'travel' keyword", () => {
    const result = reasonFromPrompt("let's take a trip together", [], []);
    expect(result.toLowerCase()).toMatch(/trip|travel|adventure/);
  });

  test("detects 'book' keyword", () => {
    const result = reasonFromPrompt("I read a book that reminded me", [], []);
    expect(result.toLowerCase()).toMatch(/read|book/);
  });

  test("detects 'excited about' keyword", () => {
    const result = reasonFromPrompt("what are you most excited about", [], []);
    expect(result.toLowerCase()).toMatch(/excited|looking forward/);
  });

  test("uses interest in fallback when prompt matches interest", () => {
    const result = reasonFromPrompt("cycling", ["cycling"], []);
    expect(result.toLowerCase()).toContain("cycling");
  });

  test("uses first interest when prompt does not match any interest", () => {
    const result = reasonFromPrompt("completely random prompt xyz", ["photography"], []);
    expect(result.toLowerCase()).toContain("photography");
  });

  test("detects work/career keyword", () => {
    const result = reasonFromPrompt("how is work going for you", [], []);
    expect(result.toLowerCase()).toMatch(/work|project/);
  });

  test("detects 'catch up' keyword", () => {
    const result = reasonFromPrompt("we should catch up soon", [], []);
    expect(result.toLowerCase()).toMatch(/catch up|what's new|what.s going on|been up to/i);
  });
});
