import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { colors, fonts, scoreColor } from "../theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  score: number;
  size?: number;
  strokeWidth?: number;
  delay?: number;
  haptics?: boolean;
}

/**
 * The score reveal: ring sweeps + number counts 0→score on a shared cubic
 * ease-out, with a heavy haptic landing on the final value.
 */
export function ScoreRing({ score, size = 230, strokeWidth = 20, delay = 350, haptics = true }: Props) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const color = scoreColor(score);
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);
  const done = useRef(false);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value * score / 100),
  }));

  useEffect(() => {
    const duration = 1400;
    progress.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));

    let raf = 0;
    const startAt = Date.now() + delay;
    if (haptics) setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), delay);
    const tick = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - startAt) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * score));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!done.current) {
        done.current = true;
        if (haptics) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 120);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.surface2}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={styles.center}>
          <Text style={[styles.number, { fontSize: size * 0.32, color }]}>{display}</Text>
          <Text style={styles.outOf}>/100</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  number: {
    fontFamily: fonts.rounded,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -1,
  },
  outOf: { color: colors.dim, fontSize: 15, fontWeight: "600", marginTop: -4 },
});
