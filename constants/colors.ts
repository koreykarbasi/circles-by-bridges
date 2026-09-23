export const darkColors = {
  primary: "#9B7DFF",
  primaryDark: "#1A0E3E",
  primaryDeep: "#0D0820",
  primaryLight: "#B9A4FF",
  primaryMuted: "#2A1F52",
  accent: "#FF6B8A",
  accentSoft: "#3D1A2A",
  background: "#0B0718",
  surface: "#151028",
  surfaceElevated: "#1E1640",
  text: "#F0ECF8",
  textSecondary: "#9B93B8",
  textTertiary: "#5E5580",
  border: "#2A2148",
  borderLight: "#1E1840",
  success: "#4ADE80",
  warning: "#E07818",
  danger: "#FF4757",
  yellow: "#F5C842",
  circle1: "#FF6B8A",
  circle2: "#9B7DFF",
  circle3: "#4ECDC4",
  onPrimary: "#FFFFFF",
  onCircle: "#FFFFFF",
  tabIconDefault: "#9B93B8",
};

export type ThemeColors = typeof darkColors;

// A warm lavender canvas, deep purple controls, and darker circle colors
// allow labels and icons to remain readable on pale surfaces.
export const lightColors: ThemeColors = {
  primary: "#6540C8",
  primaryDark: "#E5D8FA",
  primaryDeep: "#342060",
  primaryLight: "#5534A9",
  primaryMuted: "#EEE8FA",
  accent: "#B93761",
  accentSoft: "#FCE7EE",
  background: "#F8F5FD",
  surface: "#FFFFFF",
  surfaceElevated: "#F0EBFA",
  text: "#25193B",
  textSecondary: "#574D6D",
  textTertiary: "#6A607D",
  border: "#D8D0E8",
  borderLight: "#E8E2F1",
  success: "#197348",
  warning: "#925200",
  danger: "#B4233F",
  yellow: "#836000",
  circle1: "#B93761",
  circle2: "#6540C8",
  circle3: "#007D75",
  onPrimary: "#FFFFFF",
  onCircle: "#FFFFFF",
  tabIconDefault: "#6A607D",
};

// Kept for non-reactive callers. UI code should use useThemeColors().
export default darkColors;