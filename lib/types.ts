export interface Contact {
  id: string;
  name: string;
  circleLevel: 1 | 2 | 3;
  interests: string[];
  birthday?: string;
  lastContacted?: string;
  notes?: string;
  phone?: string;
  avatarColor: string;
}

export interface Reminder {
  id: string;
  contactId: string;
  type: "birthday" | "check_in" | "custom";
  message: string;
  dueDate: string;
  completed: boolean;
  snoozed: boolean;
}

export interface Suggestion {
  id: string;
  contactId: string;
  type: "call" | "text" | "hangout";
  prompt: string;
  circleLevel: 1 | 2 | 3;
}

export const CIRCLE_CONFIG = {
  1: { label: "Core Circle", max: 5, color: "#FF6B8A", description: "Your closest people" },
  2: { label: "Close Friends", max: 10, color: "#6B4EFF", description: "Trusted confidants" },
  3: { label: "Acquaintances", max: 35, color: "#4ECDC4", description: "Strong acquaintances" },
} as const;

export const AVATAR_COLORS = [
  "#FF6B8A", "#6B4EFF", "#4ECDC4", "#FFB84D",
  "#FF8A65", "#7C4DFF", "#26A69A", "#EF5350",
  "#AB47BC", "#42A5F5", "#66BB6A", "#FFA726",
];
