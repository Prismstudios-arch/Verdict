import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, spacing } from "../theme";

export interface TimelineStep {
  label: string;
  state: "done" | "active" | "pending";
}

/** Live audit progress bound to REAL job state from the server — no fake bars. */
export function ProgressTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View>
      {steps.map((step, i) => (
        <View key={step.label} style={styles.row}>
          <View style={styles.railCol}>
            <Dot state={step.state} />
            {i < steps.length - 1 && (
              <View
                style={[
                  styles.rail,
                  { backgroundColor: step.state === "done" ? colors.accent : colors.border },
                ]}
              />
            )}
          </View>
          <Text
            style={[
              styles.label,
              step.state === "active" && { color: colors.text, fontWeight: "700" },
              step.state === "done" && { color: colors.dim },
              step.state === "pending" && { color: colors.faint },
            ]}
          >
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Dot({ state }: { state: TimelineStep["state"] }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (state === "active") {
      pulse.value = withRepeat(
        withSequence(withTiming(1.5, { duration: 550 }), withTiming(1, { duration: 550 })),
        -1,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [state, pulse]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (state === "done") {
    return (
      <View style={[styles.dot, { backgroundColor: colors.accent }]}>
        <Text style={styles.check}>✓</Text>
      </View>
    );
  }
  return (
    <Animated.View
      style={[
        styles.dot,
        state === "active"
          ? [{ backgroundColor: colors.accent }, style]
          : { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  railCol: { alignItems: "center", width: 26, marginRight: spacing.m },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  check: { color: colors.onAccent, fontSize: 11, fontWeight: "900", lineHeight: 13 },
  rail: { width: 2, height: 34, marginVertical: 4 },
  label: { fontSize: 16, color: colors.dim, paddingTop: 0, paddingBottom: 34 },
});
