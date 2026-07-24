/**
 * Shared notification-permission cache.
 *
 * Keeping this in a dedicated module means every screen imports the *same*
 * module-level variable, so a useFocusEffect re-check in any one screen
 * (e.g. Profile) immediately invalidates the value read by every other caller.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type PermissionStatus = "granted" | "denied" | null;

/** In-memory cache; null means "unknown / needs a real check". */
let _notifPermissionCache: PermissionStatus = null;

/** Read the cached value without triggering a system call. */
export function getCachedNotifPermission(): PermissionStatus {
  return _notifPermissionCache;
}

/** Overwrite the cached value (used by screens after they call getPermissionsAsync). */
export function setCachedNotifPermission(status: PermissionStatus): void {
  _notifPermissionCache = status;
}

/**
 * Ask the OS for the current permission status, update the cache, and return
 * the result.  Safe to call on web (returns "granted" immediately).
 */
export async function refreshNotifPermission(): Promise<PermissionStatus> {
  if (Platform.OS === "web") {
    _notifPermissionCache = "granted";
    return "granted";
  }
  const { status } = await Notifications.getPermissionsAsync();
  _notifPermissionCache =
    status === "granted" ? "granted" : status === "denied" ? "denied" : null;
  return _notifPermissionCache;
}
