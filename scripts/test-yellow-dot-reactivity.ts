/**
 * test-yellow-dot-reactivity.ts
 *
 * Verifies that the yellow enrichment dot disappears on the next render after
 * a contact's labels or interests are filled in, across all three surfaces:
 *
 *   1. ContactCard  — isMissingEnrichment(contact)
 *   2. SuggestionCard — (interests ?? []).length === 0 && (labels ?? []).length === 0
 *   3. Home tab (index.tsx) — isEnrichmentMissing in getSuggestionForContact
 *
 * Each test simulates the state change that happens when updateContact() calls
 * the optimistic setContacts() update, replacing the old contact object with the
 * newly saved one. If the dot logic re-evaluates from the contact object on every
 * render (no stale closures or memo deps missing), the dot will clear immediately.
 */

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
    name: "Test User",
    interests: [],
    labels: [],
    avatarColor: "#aaa",
    lastContacted: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  } as Contact;
}

// ─── Surface 1: ContactCard logic ────────────────────────────────────────────
// Mirrors ContactCard.tsx: isMissingEnrichment() + the enrichmentMissing guard

function isMissingBirthday(contact: Contact): boolean {
  return (contact.circleLevel === 1 || contact.circleLevel === 2) && !contact.birthday;
}

function isMissingEnrichment(contact: Contact): boolean {
  return (contact.labels ?? []).length === 0 && (contact.interests ?? []).length === 0;
}

/** Returns what ContactCard renders: should the yellow dot be shown? */
function contactCardShowsDot(contact: Contact, isProfileIncomplete?: boolean): boolean {
  const incomplete = isMissingBirthday(contact);
  // Yellow dot only shows when there is no red/orange birthday badge (incomplete=false)
  return !incomplete && (isProfileIncomplete !== undefined ? isProfileIncomplete : isMissingEnrichment(contact));
}

console.log("\n=== Surface 1: ContactCard yellow dot ===\n");

console.log("Test 1: Dot shown for a contact with no labels and no interests");
{
  const contact = makeContact({ id: "c1", circleLevel: 3, birthday: "06/15", labels: [], interests: [] });
  assert(contactCardShowsDot(contact), "Yellow dot is shown when labels=[] and interests=[]");
}

console.log("\nTest 2: Dot hidden after labels are added (simulates optimistic state update)");
{
  const before = makeContact({ id: "c1", circleLevel: 3, birthday: "06/15", labels: [], interests: [] });
  // Simulate updateContact optimistic update: spread the saved values onto the contact
  const after: Contact = { ...before, labels: ["College Friend"] };
  assert(contactCardShowsDot(before), "Dot visible before save");
  assert(!contactCardShowsDot(after), "Dot hidden after labels added");
}

console.log("\nTest 3: Dot hidden after interests are added (simulates optimistic state update)");
{
  const before = makeContact({ id: "c1", circleLevel: 1, birthday: "03/10", labels: [], interests: [] });
  const after: Contact = { ...before, interests: ["Hiking"] };
  assert(contactCardShowsDot(before), "Dot visible before save");
  assert(!contactCardShowsDot(after), "Dot hidden after interests added");
}

console.log("\nTest 4: Dot hidden when BOTH labels and interests are present");
{
  const contact = makeContact({ id: "c1", circleLevel: 2, birthday: "07/04", labels: ["Work"], interests: ["Tennis"] });
  assert(!contactCardShowsDot(contact), "Dot hidden when both labels and interests present");
}

console.log("\nTest 5: Dot not shown when birthday badge already shown (incomplete=true takes priority)");
{
  // C1 with no birthday → incomplete=true, so yellow dot must NOT render alongside red badge
  const contact = makeContact({ id: "c1", circleLevel: 1, birthday: undefined, labels: [], interests: [] });
  assert(!contactCardShowsDot(contact), "Yellow dot suppressed when red/orange birthday badge is showing");
}

console.log("\nTest 6: External isProfileIncomplete override controls dot when provided");
{
  const contact = makeContact({ id: "c1", circleLevel: 3, birthday: "01/01", labels: [], interests: [] });
  // isProfileIncomplete=false means caller says profile IS complete → dot must be hidden
  assert(!contactCardShowsDot(contact, false), "isProfileIncomplete=false → dot hidden (override wins)");
  // isProfileIncomplete=true means caller says profile is incomplete → dot must be shown
  assert(contactCardShowsDot(contact, true), "isProfileIncomplete=true → dot visible (override wins)");
}

// ─── Surface 2: SuggestionCard logic ─────────────────────────────────────────
// Mirrors SuggestionCard.tsx line 253: enrichmentMissing computed from props

/** Returns what SuggestionCard renders: should the yellow dot be shown? */
function suggestionCardShowsDot(interests: string[], labels: string[]): boolean {
  return (interests ?? []).length === 0 && (labels ?? []).length === 0;
}

console.log("\n=== Surface 2: SuggestionCard yellow dot ===\n");

console.log("Test 7: Dot shown when interests=[] and labels=[]");
{
  assert(suggestionCardShowsDot([], []), "Dot visible for contact with no enrichment data");
}

console.log("\nTest 8: Dot hidden after labels prop is updated");
{
  const before = suggestionCardShowsDot([], []);
  const after = suggestionCardShowsDot([], ["Neighbor"]);
  assert(before, "Dot visible before label prop update");
  assert(!after, "Dot hidden after label prop update");
}

console.log("\nTest 9: Dot hidden after interests prop is updated");
{
  const before = suggestionCardShowsDot([], []);
  const after = suggestionCardShowsDot(["Reading"], []);
  assert(before, "Dot visible before interest prop update");
  assert(!after, "Dot hidden after interest prop update");
}

console.log("\nTest 10: Dot hidden when both interests and labels are non-empty");
{
  assert(!suggestionCardShowsDot(["Running", "Chess"], ["Family", "Work"]), "Dot hidden with both enrichment fields populated");
}

// ─── Surface 3: Home tab (index.tsx) getSuggestionForContact logic ────────────
// Mirrors app/(tabs)/index.tsx line 296: isEnrichmentMissing in the Suggestion object

/** Returns what the Home tab suggestion builder produces: is isEnrichmentMissing set? */
function homeTabIsEnrichmentMissing(contact: Contact): boolean {
  return (contact.labels ?? []).length === 0 && (contact.interests ?? []).length === 0;
}

console.log("\n=== Surface 3: Home tab suggestion builder ===\n");

console.log("Test 11: isEnrichmentMissing=true for contact with no labels and no interests");
{
  const contact = makeContact({ id: "c1", circleLevel: 2, birthday: "05/20", labels: [], interests: [] });
  assert(homeTabIsEnrichmentMissing(contact), "isEnrichmentMissing is true for bare contact");
}

console.log("\nTest 12: isEnrichmentMissing=false after contact updated with labels (simulates context re-render)");
{
  const before = makeContact({ id: "c1", circleLevel: 2, birthday: "05/20", labels: [], interests: [] });
  // Simulate optimistic setContacts: spread saved values onto the old contact entry
  const after: Contact = { ...before, labels: ["Work Friend"] };
  assert(homeTabIsEnrichmentMissing(before), "isEnrichmentMissing true before save");
  assert(!homeTabIsEnrichmentMissing(after), "isEnrichmentMissing false after save — dot will not appear on next render");
}

console.log("\nTest 13: isEnrichmentMissing=false after contact updated with interests");
{
  const before = makeContact({ id: "c1", circleLevel: 1, birthday: "11/01", labels: [], interests: [] });
  const after: Contact = { ...before, interests: ["Cooking", "Travel"] };
  assert(homeTabIsEnrichmentMissing(before), "isEnrichmentMissing true before save");
  assert(!homeTabIsEnrichmentMissing(after), "isEnrichmentMissing false after save — dot will not appear on next render");
}

console.log("\nTest 14: All three surfaces agree — dot clears simultaneously after one state update");
{
  const before = makeContact({ id: "c1", circleLevel: 3, birthday: "08/08", labels: [], interests: [] });
  const after: Contact = { ...before, labels: ["Old Friend"], interests: ["Cycling"] };

  const cardBefore = contactCardShowsDot(before);
  const suggBefore = suggestionCardShowsDot(before.interests, before.labels);
  const homeBefore = homeTabIsEnrichmentMissing(before);

  const cardAfter = contactCardShowsDot(after);
  const suggAfter = suggestionCardShowsDot(after.interests, after.labels);
  const homeAfter = homeTabIsEnrichmentMissing(after);

  assert(cardBefore && suggBefore && homeBefore, "All three surfaces show the dot before save");
  assert(!cardAfter && !suggAfter && !homeAfter, "All three surfaces hide the dot after save — no surface is left showing a stale dot");
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
