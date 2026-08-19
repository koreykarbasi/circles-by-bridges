import {
  scorePrioritySuggestion,
  selectSuggestionForDelivery,
} from "../shared/suggestion-priority";

describe("shared suggestion priority", () => {
  it("uses the same circle, cooldown, and contact-recency signals deterministically", () => {
    expect(scorePrioritySuggestion(2, null, 10)).toBe(1360);
    expect(scorePrioritySuggestion(1, null, 10)).toBe(1310);
    expect(scorePrioritySuggestion(3, null, 10)).toBe(1210);
  });

  it("applies elevation after the normal score", () => {
    expect(scorePrioritySuggestion(1, null, 10, 3000)).toBe(
      scorePrioritySuggestion(1, null, 10) + 3000,
    );
  });
});

describe("successful-delivery rotation", () => {
  const cohort = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("chooses the highest-ranked contact not used by the last two successful sends", () => {
    expect(selectSuggestionForDelivery(cohort, ["a", "b"])?.id).toBe("c");
    expect(selectSuggestionForDelivery(cohort, ["c", "a"])?.id).toBe("b");
    expect(selectSuggestionForDelivery(cohort, ["b", "c"])?.id).toBe("a");
  });

  it("does not advance when delivery history has not changed", () => {
    const successfulHistory = ["a", "b"];
    expect(selectSuggestionForDelivery(cohort, successfulHistory)?.id).toBe("c");
    expect(selectSuggestionForDelivery(cohort, successfulHistory)?.id).toBe("c");
  });

  it("alternates safely when fewer than three contacts are available", () => {
    expect(selectSuggestionForDelivery(cohort.slice(0, 2), ["a", "b"])?.id).toBe("b");
    expect(selectSuggestionForDelivery(cohort.slice(0, 2), ["b", "a"])?.id).toBe("a");
  });
});