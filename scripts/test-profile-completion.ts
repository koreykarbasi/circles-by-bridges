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

// ─── Summary ───
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
