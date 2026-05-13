/**
 * Deterministic unit tests for International Friend action-type distribution.
 * Run with: npx ts-node tests/prompts-international.test.ts
 *
 * Uses fixed ordering (no randomness) so results are stable across runs.
 */

type ActionType = "call" | "text" | "hangout";

interface TaggedPrompt {
  text: string;
  actionType: ActionType;
}

function buildInternationalPool(tagged: TaggedPrompt[]): TaggedPrompt[] {
  const hangoutPool = tagged.filter((t) => t.actionType === "hangout");
  const reducedCount = Math.max(1, Math.floor(hangoutPool.length * 0.6));
  return [
    ...tagged.filter((t) => t.actionType !== "hangout"),
    ...hangoutPool.slice(0, reducedCount),
  ];
}

function hangoutRate(pool: TaggedPrompt[]): number {
  return pool.filter((t) => t.actionType === "hangout").length / pool.length;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error("FAIL: " + message);
  console.log("PASS: " + message);
}

const circles: Array<{ name: string; call: number; text: number; hangout: number }> = [
  { name: "Circle 1", call: 13, text: 17, hangout: 4 },
  { name: "Circle 2", call: 11, text: 17, hangout: 5 },
  { name: "Circle 3", call: 10, text: 16, hangout: 3 },
];

for (const { name, call, text, hangout } of circles) {
  const tagged: TaggedPrompt[] = [
    ...Array.from({ length: call }, (_, i) => ({ text: `call_${i}`, actionType: "call" as ActionType })),
    ...Array.from({ length: text }, (_, i) => ({ text: `text_${i}`, actionType: "text" as ActionType })),
    ...Array.from({ length: hangout }, (_, i) => ({ text: `hangout_${i}`, actionType: "hangout" as ActionType })),
  ];

  const normalRate = hangoutRate(tagged);
  const intlPool = buildInternationalPool(tagged);
  const intlRate = hangoutRate(intlPool);
  const reducedCount = Math.max(1, Math.floor(hangout * 0.6));

  assert(
    intlRate < normalRate,
    `${name}: international hangout rate (${(intlRate * 100).toFixed(1)}%) is strictly fewer than normal (${(normalRate * 100).toFixed(1)}%)`
  );

  assert(
    intlPool.filter((t) => t.actionType === "hangout").length === reducedCount,
    `${name}: hangout count reduced to floor(n * 0.6) = ${reducedCount} (from ${hangout})`
  );

  assert(
    intlPool.filter((t) => t.actionType === "hangout").length >= 1,
    `${name}: international pool contains at least 1 hangout prompt`
  );

  assert(
    intlPool.filter((t) => t.actionType === "call").length === call,
    `${name}: all ${call} circle call prompts retained for international contacts`
  );

  assert(
    intlPool.filter((t) => t.actionType === "text").length === text,
    `${name}: all ${text} circle text prompts retained for international contacts`
  );
}

console.log("\nAll tests passed.");
