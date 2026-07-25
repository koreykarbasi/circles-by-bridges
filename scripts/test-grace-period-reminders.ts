/**
 * Tests that the grace-period logic in generateCircle1Reminders and
 * generateCircle2Reminders suppresses the "You haven't reached out yet"
 * check-in reminder for contacts added within the last 7 days, and shows
 * the reminder once a contact is older than 7 days.
 */

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

function isoAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

function makeContact(overrides: Partial<Contact> & { id: string; circleLevel: number }): Contact {
  return {
    name: "Test Contact",
    interests: [],
    labels: [],
    avatarColor: "#aaa",
    ...overrides,
  };
}

// ─── Circle 1 Grace Period Tests ───────────────────────────────────────────

console.log("\n=== Circle 1 Grace Period Tests ===\n");

console.log("Test 1: New C1 contact (createdAt = today, no lastContacted) → no check-in reminder");
{
  const contact = makeContact({
    id: "c1",
    circleLevel: 1,
    lastContacted: null,
    createdAt: isoAgo(0),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c1" && r.type === "check-in-quickpick");
  assert(!checkin, "No check-in reminder for brand-new C1 contact (createdAt today)");
}

console.log("\nTest 2: C1 contact added 3 days ago, no lastContacted → no check-in reminder");
{
  const contact = makeContact({
    id: "c1",
    circleLevel: 1,
    lastContacted: null,
    createdAt: isoAgo(3),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c1" && r.type === "check-in-quickpick");
  assert(!checkin, "No check-in reminder for C1 contact added 3 days ago");
}

console.log("\nTest 3: C1 contact added 7 days ago, no lastContacted → no check-in reminder (boundary, still in grace)");
{
  const contact = makeContact({
    id: "c1",
    circleLevel: 1,
    lastContacted: null,
    createdAt: isoAgo(7),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c1" && r.type === "check-in-quickpick");
  assert(!checkin, "No check-in reminder for C1 contact added exactly 7 days ago (boundary)");
}

console.log("\nTest 4: C1 contact added 8 days ago, no lastContacted → check-in reminder DOES appear");
{
  const contact = makeContact({
    id: "c1",
    circleLevel: 1,
    lastContacted: null,
    createdAt: isoAgo(8),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c1" && r.type === "check-in-quickpick");
  assert(!!checkin, "Check-in reminder fires for C1 contact added 8 days ago with no lastContacted");
  assert(
    checkin?.subtitle === "You haven't reached out yet",
    "Subtitle is 'You haven't reached out yet' for never-contacted C1 contact",
  );
}

console.log("\nTest 5: C1 contact added 30 days ago, no lastContacted → check-in reminder appears");
{
  const contact = makeContact({
    id: "c1",
    circleLevel: 1,
    lastContacted: null,
    createdAt: isoAgo(30),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c1" && r.type === "check-in-quickpick");
  assert(!!checkin, "Check-in reminder fires for C1 contact added 30 days ago with no lastContacted");
}

console.log("\nTest 6: C1 contact with null createdAt and no lastContacted → no check-in reminder (null treated as within grace)");
{
  const contact = makeContact({
    id: "c1",
    circleLevel: 1,
    lastContacted: null,
    createdAt: null,
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c1" && r.type === "check-in-quickpick");
  assert(!checkin, "No check-in reminder for C1 contact with null createdAt (treated as within grace)");
}

console.log("\nTest 7: C1 contact added 15 days ago WITH a lastContacted beyond threshold → check-in reminder appears");
{
  const contact = makeContact({
    id: "c1",
    circleLevel: 1,
    lastContacted: isoAgo(20), // 20 days ago, beyond 14-day C1 threshold
    createdAt: isoAgo(15),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c1" && r.type === "check-in-quickpick");
  assert(!!checkin, "Check-in reminder fires when lastContacted is beyond threshold, regardless of grace period");
}

console.log("\nTest 8: C1 contact added 1 day ago WITH lastContacted within threshold → no check-in reminder");
{
  const contact = makeContact({
    id: "c1",
    circleLevel: 1,
    lastContacted: isoAgo(5), // 5 days, within 14-day threshold
    createdAt: isoAgo(1),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c1" && r.type === "check-in-quickpick");
  assert(!checkin, "No check-in reminder when C1 lastContacted is within threshold");
}

// ─── Circle 2 Grace Period Tests ───────────────────────────────────────────

console.log("\n=== Circle 2 Grace Period Tests ===\n");

console.log("Test 9: New C2 contact (createdAt = today, no lastContacted) → no check-in reminder");
{
  const contact = makeContact({
    id: "c2",
    circleLevel: 2,
    lastContacted: null,
    createdAt: isoAgo(0),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c2" && r.type === "check-in-quickpick");
  assert(!checkin, "No check-in reminder for brand-new C2 contact (createdAt today)");
}

console.log("\nTest 10: C2 contact added 3 days ago, no lastContacted → no check-in reminder");
{
  const contact = makeContact({
    id: "c2",
    circleLevel: 2,
    lastContacted: null,
    createdAt: isoAgo(3),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c2" && r.type === "check-in-quickpick");
  assert(!checkin, "No check-in reminder for C2 contact added 3 days ago");
}

console.log("\nTest 11: C2 contact added 7 days ago, no lastContacted → no check-in reminder (boundary, still in grace)");
{
  const contact = makeContact({
    id: "c2",
    circleLevel: 2,
    lastContacted: null,
    createdAt: isoAgo(7),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c2" && r.type === "check-in-quickpick");
  assert(!checkin, "No check-in reminder for C2 contact added exactly 7 days ago (boundary)");
}

console.log("\nTest 12: C2 contact added 8 days ago, no lastContacted → check-in reminder DOES appear");
{
  const contact = makeContact({
    id: "c2",
    circleLevel: 2,
    lastContacted: null,
    createdAt: isoAgo(8),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c2" && r.type === "check-in-quickpick");
  assert(!!checkin, "Check-in reminder fires for C2 contact added 8 days ago with no lastContacted");
  assert(
    checkin?.subtitle === "You haven't reached out yet",
    "Subtitle is 'You haven't reached out yet' for never-contacted C2 contact",
  );
}

console.log("\nTest 13: C2 contact added 60 days ago, no lastContacted → check-in reminder appears");
{
  const contact = makeContact({
    id: "c2",
    circleLevel: 2,
    lastContacted: null,
    createdAt: isoAgo(60),
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c2" && r.type === "check-in-quickpick");
  assert(!!checkin, "Check-in reminder fires for C2 contact added 60 days ago with no lastContacted");
}

console.log("\nTest 14: C2 contact with null createdAt and no lastContacted → no check-in reminder (null treated as within grace)");
{
  const contact = makeContact({
    id: "c2",
    circleLevel: 2,
    lastContacted: null,
    createdAt: null,
  });
  const reminders = generateReminders([contact]);
  const checkin = reminders.find((r) => r.contactId === "c2" && r.type === "check-in-quickpick");
  assert(!checkin, "No check-in reminder for C2 contact with null createdAt (treated as within grace)");
}

// ─── Summary ───────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
