import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { colors, fonts, scoreColor, spacing } from "../theme";

interface Sub {
  label: string;
  value: number;
  weight: string;
}

interface Scores {
  clarity: number;
  copy: number;
  mobile: number;
  performance: number;
  trust: number;
  accessibility: number;
}

export function SubScoreBars({ scores }: { scores: Scores }) {
  const rows: Sub[] = [
    { label: "Clarity", value: scores.clarity, weight: "25%" },
    { label: "Copy & conversion", value: scores.copy, weight: "25%" },
    { label: "Mobile experience", value: scores.mobile, weight: "20%" },
    { label: "Performance", value: scores.performance, weight: "15%" },
    { label: "Trust", value: scores.trust, weight: "10%" },
    { label: "Accessibility", value: scores.accessibility, weight: "5%" },
  ];
  return (
    <View>
      {rows.map((row, i) => (
        <Bar key={row.label} {...row} delay={200 + i * 90} />
      ))}
    </View>
  );
}

function Bar({ label, value, weight, delay }: Sub & { delay: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(delay, withTiming(value, { duration: 800, easing: Easing.out(Easing.cubic) }));
  }, [value, delay, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  const color = scoreColor(value);
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value} out of 100`}>
      <View style={styles.header}>
        <Text style={styles.label}>
          {label} <Text style={styles.weight}>{weight}</Text>
        </Text>
        <Text style={[styles.value, { color }]}>{value}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.l },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  label: { color: colors.text, fontSize: 14, fontWeight: "600" },
  weight: { color: colors.faint, fontSize: 12, fontWeight: "400" },
  value: { fontFamily: fonts.rounded, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
});
