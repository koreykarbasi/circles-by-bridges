import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HangoutPlan } from "./types";

type ViewedMap = Record<string, string>;

function storageKey(userId: string): string {
  return `bridges_hangout_viewed_v1:${userId}`;
}

async function getViewedMap(userId: string): Promise<ViewedMap> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function markHangoutViewed(hangoutId: string, userId: string): Promise<void> {
  if (!userId) return;
  try {
    const map = await getViewedMap(userId);
    map[hangoutId] = new Date().toISOString();
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(map));
  } catch {}
}

export async function getViewedTimestamps(userId: string): Promise<ViewedMap> {
  if (!userId) return {};
  return getViewedMap(userId);
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
