import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HangoutPlan } from "./types";

const STORAGE_KEY = "bridges_hangout_viewed_v1";

type ViewedMap = Record<string, string>;

async function getViewedMap(): Promise<ViewedMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function markHangoutViewed(hangoutId: string): Promise<void> {
  try {
    const map = await getViewedMap();
    map[hangoutId] = new Date().toISOString();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export async function getViewedTimestamps(): Promise<ViewedMap> {
  return getViewedMap();
}

export function getMostRecentVoteAt(plan: HangoutPlan): string | null {
  let latest: string | null = null;
  for (const opt of plan.options || []) {
    for (const vote of opt.votes || []) {
      if (vote.createdAt) {
        if (!latest || vote.createdAt > latest) {
          latest = vote.createdAt;
        }
      }
    }
  }
  return latest;
}

export function hasUnreadVotes(plan: HangoutPlan, viewedAt: string | undefined): boolean {
  const mostRecent = getMostRecentVoteAt(plan);
  if (!mostRecent) return false;
  if (!viewedAt) return true;
  return mostRecent > viewedAt;
}

export function countNewVoters(plan: HangoutPlan, viewedAt: string | undefined): number {
  const newVoters = new Set<string>();
  for (const opt of plan.options || []) {
    for (const vote of opt.votes || []) {
      if (!vote.voterName) continue;
      if (!viewedAt || (vote.createdAt && vote.createdAt > viewedAt)) {
        newVoters.add(vote.voterName);
      }
    }
  }
  return newVoters.size;
}
