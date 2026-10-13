// Non-Android fallback for the unselected Android route in Expo Router's context.
// Explicit extension returns the unchanged original rather than its Android sibling.
export default require("../../app/onboarding.tsx").default as typeof import("../../app/onboarding").default;
