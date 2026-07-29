import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { colors, radius } from "../theme";

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  style?: ViewStyle;
}

export function PrimaryButton({ title, onPress, loading, disabled, variant = "primary", style }: Props) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        isPrimary && { backgroundColor: pressed ? colors.accentPressed : colors.accent },
        variant === "ghost" && [styles.ghost, pressed && { backgroundColor: colors.surface2 }],
        variant === "danger" && { backgroundColor: pressed ? "#D94A4A" : colors.red },
        (disabled || loading) && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.text} />
      ) : (
        <Text
          style={[
            styles.text,
            { color: isPrimary ? colors.onAccent : variant === "danger" ? "#fff" : colors.text },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 54,
    borderRadius: radius.l,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  ghost: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  text: { fontSize: 16, fontWeight: "700" },
});
