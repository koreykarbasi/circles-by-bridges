import React, { useState } from "react";
import { Image, View } from "react-native";
import { Avatar } from "../Avatar";

interface OrbitAvatarProps {
  name: string;
  color: string;
  size: number;
  photoUri?: string | null;
}

function PhotoOverlay({ uri, size }: { uri: string; size: number }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Image
      source={{ uri }}
      accessible={false}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(false)}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        opacity: loaded ? 1 : 0,
      }}
    />
  );
}

/** Only the Android orbit uses this; the shared/iOS Avatar stays unchanged. */
export function AndroidOrbitAvatar({ name, color, size, photoUri }: OrbitAvatarProps) {
  return (
    <View
      collapsable={false}
      pointerEvents="none"
      style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}
    >
      {/* Always keep initials mounted, including while a photo is pending or fails. */}
      <Avatar name={name} color={color} size={size} />
      {photoUri ? <PhotoOverlay key={photoUri} uri={photoUri} size={size} /> : null}
    </View>
  );
}
