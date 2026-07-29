import { useEffect } from "react";
import type { ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { colors, radius } from "../theme";

/** Pulsing placeholder block — no spinners floating in the void. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.9, { duration: 650 }), withTiming(0.45, { duration: 650 })),
      -1,
    );
  }, [opacity]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[{ backgroundColor: colors.surface2, borderRadius: radius.s, height: 16 }, anim, style]}
    />
  );
}
