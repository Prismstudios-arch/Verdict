import { StyleSheet, Text } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { fonts, scoreColor } from "../theme";

interface Props {
  grade: string;
  score: number;
  delay?: number;
  size?: number;
}

/** Grade stamp: springs in after the ring count-up lands. */
export function GradeBadge({ grade, score, delay = 1750, size = 30 }: Props) {
  const color = scoreColor(score);
  return (
    <Animated.View
      entering={ZoomIn.springify().damping(11).stiffness(190).delay(delay)}
      style={[styles.badge, { borderColor: color, transform: [{ rotate: "-4deg" }] }]}
    >
      <Text style={[styles.text, { color, fontSize: size }]}>{grade}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 3,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    alignSelf: "center",
  },
  text: { fontFamily: fonts.rounded, fontWeight: "900", letterSpacing: 1 },
});
