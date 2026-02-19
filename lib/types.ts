export interface Contact {
  id: string;
  userId?: string | null;
  name: string;
  circleLevel: number;
  interests: string[];
  birthday?: string | null;
  lastContacted?: string | null;
  notes?: string | null;
  phone?: string | null;
  avatarColor: string;
  photoUri?: string | null;
  createdAt?: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  profilePhotoUri?: string | null;
}

export const CIRCLE_CONFIG = {
  1: { label: "Core Circle", max: 5, color: "#FF6B8A", description: "Your closest people" },
  2: { label: "Close Friends", max: 10, color: "#9B7DFF", description: "Trusted confidants" },
  3: { label: "Acquaintances", max: 35, color: "#4ECDC4", description: "Strong acquaintances" },
} as const;

export const AVATAR_COLORS = [
  "#FF6B8A", "#9B7DFF", "#4ECDC4", "#FFB84D",
  "#FF8A65", "#7C4DFF", "#26A69A", "#EF5350",
  "#AB47BC", "#42A5F5", "#66BB6A", "#FFA726",
];
