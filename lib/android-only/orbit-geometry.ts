/** Geometry for Android only; the iOS visualization keeps its original values. */
export function androidOrbitGeometry(viewportWidth: number) {
  const size = Math.max(80, Math.min(viewportWidth - 48, 320));
  const scale = Math.min(1, size / 272);
  const outerRadius = size / 2;
  const middleRadius = outerRadius * 0.68;
  // Keep Core photos inside their ring, with clearance from the center photo.
  const innerRadius = Math.max(outerRadius * 0.38, 60 * scale);
  return {
    size,
    outerRadius,
    middleRadius,
    innerRadius,
    centerSize: 44 * scale,
    coreAvatarSize: 28 * scale,
    closeAvatarSize: 26 * scale,
    friendsAvatarSize: 24 * scale,
    coreOrbitRadius: innerRadius - 16 * scale,
    closeOrbitRadius: (middleRadius + innerRadius) / 2,
    friendsOrbitRadius: (outerRadius + middleRadius) / 2,
  };
}
