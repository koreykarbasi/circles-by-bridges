export interface CooldownContact {
  notificationsCooldownUntil?: string | Date | null;
}

export function isContactOnCooldown(contact: CooldownContact, now = new Date()): boolean {
  if (!contact.notificationsCooldownUntil) return false;
  const until = new Date(contact.notificationsCooldownUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}
