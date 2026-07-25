import { generateReminders } from "../lib/reminders";
import type { Contact } from "../lib/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function makeContact(overrides: Partial<Contact> & { id: string; circleLevel: number }): Contact {
  return {
    name: "Test",
    interests: [],
    labels: [],
    avatarColor: "#aaa",
    lastContacted: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

console.log("\n=== Profile Completion Card Round-Trip Tests ===\n");

// ─── Test 1: Red card (C1 no birthday) ───
console.log("Test 1: Red card appears when a Circle 1 contact has no birthday");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: undefined, labels: ["College Friend"], interests: ["Reading"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "05/01", labels: ["Work Friend"], interests: ["Gaming"] }),
  ];
  const reminders = generateReminders(contacts);
  const redCard = reminders.find((r) => r.type === "profile-completion-high");
  assert(!!redCard, "Red card appears when C1 contact has no birthday");
  assert(redCard?.title === "Add birthdays to your Core contacts to unlock reminders.", "Red card has correct title");
}

console.log("\nTest 2: Red card disappears after adding C1 birthday");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "06/15", labels: ["College Friend"], interests: ["Reading"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "05/01", labels: ["Work Friend"], interests: ["Gaming"] }),
  ];
  const reminders = generateReminders(contacts);
  const redCard = reminders.find((r) => r.type === "profile-completion-high");
  assert(!redCard, "Red card disappears when C1 contact gets a birthday");
}

// ─── Test 3: Orange card (C2 no birthday) ───
console.log("\nTest 3: Orange card appears when a Circle 2 contact has no birthday");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["College Friend"], interests: ["Fitness"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: undefined, labels: ["Work Friend"], interests: ["Gaming"] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: "08/10", labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = generateReminders(contacts);
  const orangeCard = reminders.find((r) => r.type === "profile-completion-medium");
  assert(!!orangeCard, "Orange card appears when C2 contact has no birthday");
  assert(
    orangeCard?.title === "Some close contacts are missing birthdays or profile details.",
    "Orange card has correct title"
  );
}

console.log("\nTest 4: Orange card disappears after adding C2 birthday");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["College Friend"], interests: ["Fitness"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "05/12", labels: ["Work Friend"], interests: ["Gaming"] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: "08/10", labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = generateReminders(contacts);
  const orangeCard = reminders.find((r) => r.type === "profile-completion-medium");
  assert(!orangeCard, "Orange card disappears when C2 contact gets a birthday");
}

// ─── Test 5: Orange card (C1/C2 missing labels+interests) ───
console.log("\nTest 5: Orange card appears when a Circle 1/2 contact has no labels AND no interests");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: [], interests: [] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "07/04", labels: ["Work Friend"], interests: ["Gaming"] }),
  ];
  const reminders = generateReminders(contacts);
  const orangeCard = reminders.find((r) => r.type === "profile-completion-medium");
  assert(!!orangeCard, "Orange card appears when C1 contact has no labels and no interests");
}

console.log("\nTest 6: Orange card disappears after adding labels to C1 contact");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["Family"], interests: ["Cooking"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "07/04", labels: ["Work Friend"], interests: ["Gaming"] }),
  ];
  const reminders = generateReminders(contacts);
  const orangeCard = reminders.find((r) => r.type === "profile-completion-medium");
  assert(!orangeCard, "Orange card disappears when C1 contact gets labels and interests");
}

// ─── Test 7: Yellow card (C3 no birthday) ───
console.log("\nTest 7: Yellow card appears when a Circle 3 contact has no birthday");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["College Friend"], interests: ["Fitness"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "07/04", labels: ["Work Friend"], interests: ["Gaming"] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: undefined, labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = generateReminders(contacts);
  const yellowCard = reminders.find((r) => r.type === "profile-completion-low");
  assert(!!yellowCard, "Yellow card appears when C3 contact has no birthday");
  assert(
    yellowCard?.title?.startsWith("Some contacts are missing birthdays"),
    "Yellow card has correct title"
  );
}

console.log("\nTest 8: Yellow card disappears after all C3 contacts get birthdays");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["College Friend"], interests: ["Fitness"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "07/04", labels: ["Work Friend"], interests: ["Gaming"] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: "11/22", labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = generateReminders(contacts);
  const yellowCard = reminders.find((r) => r.type === "profile-completion-low");
  assert(!yellowCard, "Yellow card disappears when all C3 contacts have birthdays");
}

// ─── Test 9: Yellow card (any contact missing labels+interests) ───
console.log("\nTest 9: Yellow card appears when any contact has no labels AND no interests");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["College Friend"], interests: ["Fitness"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "07/04", labels: [], interests: [] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: "11/22", labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = generateReminders(contacts);
  const yellowCard = reminders.find((r) => r.type === "profile-completion-low");
  assert(!!yellowCard, "Yellow card appears when any contact (including C2) has empty labels AND interests");
}

console.log("\nTest 10: Yellow card disappears after the contact gets enrichment data");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["College Friend"], interests: ["Fitness"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "07/04", labels: ["Work Friend"], interests: ["Music"] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: "11/22", labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = generateReminders(contacts);
  const yellowCard = reminders.find((r) => r.type === "profile-completion-low");
  assert(!yellowCard, "Yellow card disappears when all contacts have labels or interests");
}

// ─── Test 11: No cards when all data is complete ───
console.log("\nTest 11: No profile completion cards when all data is complete");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["College Friend"], interests: ["Fitness"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "07/04", labels: ["Work Friend"], interests: ["Gaming"] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: "11/22", labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = generateReminders(contacts);
  const pcCards = reminders.filter((r) => r.type.startsWith("profile-completion"));
  assert(pcCards.length === 0, "No profile completion cards when all contacts have complete data");
}

// ─── Test 12: No cards with empty contact list ───
console.log("\nTest 12: No profile completion cards with zero contacts");
{
  const reminders = generateReminders([]);
  const pcCards = reminders.filter((r) => r.type.startsWith("profile-completion"));
  assert(pcCards.length === 0, "No profile completion cards with zero contacts");
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggestions Tab path tests
//
// The Suggestions tab runs the same generateReminders() call and then applies
// this filter (simplified from suggestions.tsx reminders useMemo):
//
//   allReminders
//     .filter(circleLevel matches if filterCircle set)
//     .filter(r => !completedReminderIds.has(r.id))
//     .filter(r => not suppressed by elevation/snooze for check-in/hangout types)
//
// Profile-completion reminders are only removed by the completedReminderIds
// filter, so we simulate that here.
// ─────────────────────────────────────────────────────────────────────────────

function suggestionsTabReminders(
  contacts: Contact[],
  dismissedIds: Set<string> = new Set(),
  filterCircle: 1 | 2 | 3 | null = null,
) {
  const allReminders = generateReminders(contacts);
  const filtered = filterCircle
    ? allReminders.filter((r) => r.circleLevel === filterCircle)
    : allReminders;
  return filtered.filter((r) => !dismissedIds.has(r.id));
}

console.log("\n=== Suggestions Tab Profile Completion Card Tests ===\n");

// ─── Test 13: Red card appears in Suggestions tab ───
console.log("Test 13: Red (high) card appears in Suggestions tab when C1 has no birthday");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: undefined, labels: ["Family"], interests: ["Reading"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "05/01", labels: ["Work"], interests: ["Gaming"] }),
  ];
  const reminders = suggestionsTabReminders(contacts);
  const card = reminders.find((r) => r.type === "profile-completion-high");
  assert(!!card, "Red card appears in Suggestions tab when C1 contact is missing a birthday");
}

// ─── Test 14: Red card disappears from Suggestions tab after data is added ───
console.log("\nTest 14: Red card disappears from Suggestions tab after C1 birthday is added");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["Family"], interests: ["Reading"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "05/01", labels: ["Work"], interests: ["Gaming"] }),
  ];
  const reminders = suggestionsTabReminders(contacts);
  const card = reminders.find((r) => r.type === "profile-completion-high");
  assert(!card, "Red card disappears from Suggestions tab once C1 contact has a birthday");
}

// ─── Test 15: Orange card appears in Suggestions tab ───
console.log("\nTest 15: Orange (medium) card appears in Suggestions tab when C2 has no birthday");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["Family"], interests: ["Running"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: undefined, labels: ["Work"], interests: ["Gaming"] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: "11/22", labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = suggestionsTabReminders(contacts);
  const card = reminders.find((r) => r.type === "profile-completion-medium");
  assert(!!card, "Orange card appears in Suggestions tab when C2 contact is missing a birthday");
}

// ─── Test 16: Orange card disappears from Suggestions tab after data is added ───
console.log("\nTest 16: Orange card disappears from Suggestions tab after C2 birthday is added");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["Family"], interests: ["Running"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "07/04", labels: ["Work"], interests: ["Gaming"] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: "11/22", labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = suggestionsTabReminders(contacts);
  const card = reminders.find((r) => r.type === "profile-completion-medium");
  assert(!card, "Orange card disappears from Suggestions tab once C2 contact has a birthday");
}

// ─── Test 17: Yellow card appears in Suggestions tab ───
console.log("\nTest 17: Yellow (low) card appears in Suggestions tab when any contact is missing enrichment");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["Family"], interests: ["Running"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "07/04", labels: [], interests: [] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: "11/22", labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = suggestionsTabReminders(contacts);
  const card = reminders.find((r) => r.type === "profile-completion-low");
  assert(!!card, "Yellow card appears in Suggestions tab when any contact lacks labels and interests");
}

// ─── Test 18: Yellow card disappears from Suggestions tab after enrichment added ───
console.log("\nTest 18: Yellow card disappears from Suggestions tab after enrichment is added");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: "03/15", labels: ["Family"], interests: ["Running"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "07/04", labels: ["Work"], interests: ["Music"] }),
    makeContact({ id: "c3", circleLevel: 3, birthday: "11/22", labels: ["Neighbor"], interests: ["Movies"] }),
  ];
  const reminders = suggestionsTabReminders(contacts);
  const card = reminders.find((r) => r.type === "profile-completion-low");
  assert(!card, "Yellow card disappears from Suggestions tab once all contacts have enrichment data");
}

// ─── Test 19: Dismissed cards are hidden in Suggestions tab ───
console.log("\nTest 19: Dismissed profile-completion-high card is hidden in Suggestions tab");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: undefined, labels: ["Family"], interests: ["Reading"] }),
  ];
  // Card appears before dismiss
  const before = suggestionsTabReminders(contacts);
  assert(!!before.find((r) => r.type === "profile-completion-high"), "Red card visible before dismiss");

  // Simulate user dismissing the card
  const dismissed = new Set<string>(["profile-completion-high"]);
  const after = suggestionsTabReminders(contacts, dismissed);
  assert(!after.find((r) => r.type === "profile-completion-high"), "Red card hidden in Suggestions tab after dismiss");
}

// ─── Test 20: Circle filter in Suggestions tab does not hide profile-completion-high (C1 priority) ───
console.log("\nTest 20: Circle 1 filter shows red card; Circle 2 filter hides it");
{
  const contacts: Contact[] = [
    makeContact({ id: "c1", circleLevel: 1, birthday: undefined, labels: ["Family"], interests: ["Reading"] }),
    makeContact({ id: "c2", circleLevel: 2, birthday: "05/01", labels: ["Work"], interests: ["Gaming"] }),
  ];
  // profile-completion-high has circleLevel: 1, so it should appear under C1 filter
  const c1Filtered = suggestionsTabReminders(contacts, new Set(), 1);
  assert(!!c1Filtered.find((r) => r.type === "profile-completion-high"), "Red card visible with Circle 1 filter");

  // Under Circle 2 filter it should be excluded (circleLevel mismatch)
  const c2Filtered = suggestionsTabReminders(contacts, new Set(), 2);
  assert(!c2Filtered.find((r) => r.type === "profile-completion-high"), "Red card hidden under Circle 2 filter");
}

// ─── Summary ───
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
