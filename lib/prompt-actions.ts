export type ActionType = "call" | "text" | "hangout";

const MEMORY_PROMPT_PATTERN = /\b(reminisce|memory|memories|remember|throwback)\b/i;

export function inferAllowedActions(prompt: string): ActionType[] {
  const lower = prompt.toLowerCase();
  if (
    lower.startsWith("recreate an early date") ||
    lower.includes("neighborhood walk") ||
    lower.includes("new class or gym together")
  ) {
    return ["hangout"];
  }
  if (MEMORY_PROMPT_PATTERN.test(prompt)) return ["text", "call"];
  if (lower.includes("voice note") || lower.includes("phone call") || lower.includes("call ") || lower.includes("facetime") || lower.includes("video call")) {
    return ["call"];
  }
  if (
    lower.includes("hangout") || lower.includes("hang out") ||
    lower.includes("invite") || lower.includes("date with") ||
    lower.includes("concert") || lower.includes("game night") ||
    lower.includes("hike") || lower.includes("potluck") ||
    lower.includes("watch a game together") || lower.includes("dinner") ||
    lower.includes("outing") || lower.includes("coffee break") ||
    lower.includes("work out together") || lower.includes("cooking date") ||
    lower.includes("mini book club") || lower.includes("camping") ||
    lower.includes("nature trip") || lower.includes("creative collaboration") ||
    lower.includes("same city") || lower.includes("trip to visit") ||
    lower.startsWith("plan a ") || lower.startsWith("start planning ")
  ) {
    return ["hangout"];
  }
  return ["text", "call"];
}

function stableFraction(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function chooseAllowedAction(
  allowed: ActionType[],
  circleLevel: 1 | 2 | 3,
  prompt: string,
  contactId = "",
): ActionType {
  if (allowed.length === 0) return "text";
  if (allowed.length === 1) return allowed[0];

  const weighted = allowed.map((action) => ({
    action,
    weight:
      circleLevel === 3
        ? (action === "text" ? 1.5 : 1)
        : (action === "call" ? 1.5 : 1),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let target = stableFraction(`${contactId}:${prompt}:${circleLevel}`) * total;
  for (const item of weighted) {
    target -= item.weight;
    if (target < 0) return item.action;
  }
  return weighted[weighted.length - 1].action;
}