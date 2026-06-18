export interface CustomReminder {
  label: string;
  date: string;
}

export interface Contact {
  id: string;
  userId?: string | null;
  name: string;
  circleLevel: number;
  interests: string[];
  birthday?: string | null;
  lastContacted?: string | null;
  lastHangout?: string | null;
  lastContactedLabel?: string | null;
  lastHangoutLabel?: string | null;
  labels: string[];
  notes?: string | null;
  phone?: string | null;
  email?: string | null;
  avatarColor: string;
  photoUri?: string | null;
  createdAt?: string | null;
  customReminders?: CustomReminder[] | null;
  sortOrder?: number | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  profilePhotoUri?: string | null;
  suggestionNotifFrequency?: string | null;
  suggestionNotifTime?: string | null;
  hasPassword?: boolean;
}

export interface HangoutPlan {
  id: string;
  userId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  shareCode: string;
  finalizedOptionId?: string | null;
  finalizedTimeOptionId?: string | null;
  inviteeNames: string[];
  surveyMode: string;
  fixedActivity?: string | null;
  deadline?: string | null;
  includePlusOne: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  options?: HangoutOption[];
  bestRecommendation?: BestRecommendation;
}

export interface HangoutOption {
  id: string;
  planId?: string | null;
  label: string;
  dateTime?: string | null;
  activity?: string | null;
  location?: string | null;
  questionType: string;
  votes?: HangoutVote[];
  voteCount?: number;
  bordaScore?: number;
}

export interface HangoutVote {
  id: string;
  optionId?: string | null;
  planId?: string | null;
  voterName: string;
  rank?: number | null;
  bringsGuests?: boolean | null;
  plusOneCount?: number | null;
  createdAt?: string | null;
}

export interface BestRecommendation {
  bestActivity?: { label: string; score: number } | null;
  bestTime?: { label: string; score: number } | null;
  bestLocation?: { label: string; score: number } | null;
  totalVoters: number;
  plusOneTotal?: number;
}

export const CIRCLE_CONFIG = {
  1: { label: "Core Circle", max: 5, color: "#FF6B8A", description: "Your closest people" },
  2: { label: "Close Friends", max: 10, color: "#9B7DFF", description: "Trusted confidants" },
  3: { label: "Friends", max: 35, color: "#4ECDC4", description: "Your friends" },
} as const;

export const AVATAR_COLORS = [
  "#FF6B8A", "#9B7DFF", "#4ECDC4", "#FFB84D",
  "#FF8A65", "#7C4DFF", "#26A69A", "#EF5350",
  "#AB47BC", "#42A5F5", "#66BB6A", "#FFA726",
];
